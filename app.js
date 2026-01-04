import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyConuxhGCtGvJaa6TZ1bkUvlOhhTdyTgZE",
    authDomain: "flip7share.firebaseapp.com",
    databaseURL: "https://flip7share-default-rtdb.firebaseio.com",
    projectId: "flip7share",
    storageBucket: "flip7share.firebasestorage.app",
    messagingSenderId: "467127126520",
    appId: "1:467127126520:web:0646f4fc19352eaa11ee0d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let myName = localStorage.getItem('f7_name') || "";
let gameCode = null;
let activeGames = JSON.parse(localStorage.getItem('f7_game_list')) || [];
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0;
let targetPlayerCount = 4, hasCelebrated = false;

// --- Host & Join Logic ---
window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Please enter your name first!");
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    saveToGameList(newCode);
    await set(ref(db, `games/${newCode}`), { 
        host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 
    });
    await set(ref(db, `games/${newCode}/players/${myName}`), { 
        name: myName, history: [0], submitted: false, isBusted: false, liveScore: 0 
    });
    onValue(ref(db, `games/${newCode}`), syncApp);
};

window.openJoinPopup = () => {
    let c = prompt("Enter 6-digit code:");
    if(c && myName) joinGame(c);
    else if(!myName) alert("Please enter your name first!");
};

async function joinGame(code) {
    gameCode = String(code); 
    saveToGameList(gameCode);
    const pRef = ref(db, `games/${gameCode}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0], submitted: false, isBusted: false, liveScore: 0 });
    onValue(ref(db, `games/${gameCode}`), syncApp);
}

// --- Sync Logic ---
function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    gameCode = snap.key;
    
    // Update labels
    const lobbyDisp = document.getElementById('roomDisplayLobby');
    const gameDisp = document.getElementById('roomCodeDisplay');
    if (lobbyDisp) lobbyDisp.innerText = "Game: " + gameCode;
    if (gameDisp) gameDisp.innerText = `CODE: ${gameCode} | R${data.roundNum}`;

    const me = data.players[myName]; if(!me) return;
    const playersArr = Object.values(data.players || {});

    // Calculate Pre-round Total
    const myHistory = me.history || [0];
    currentGrandTotal = myHistory.reduce((acc, entry, idx) => {
        if (idx > 0 && idx < data.roundNum) {
            const val = (typeof entry === 'object') ? entry.score : entry;
            return acc + (val || 0);
        }
        return acc;
    }, 0);

    // Screen Switching
    if (data.status === "waiting") {
        window.showScreen('lobby-screen');
        document.getElementById('lobby-status').innerText = `Joined: ${playersArr.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = playersArr.map(p => `<div class="p-row"><b>${p.name}</b></div>`).join("");
        if(playersArr.length >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), { status: "active" });
    } else {
        window.showScreen('game-screen');
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
        
        // Standings
        const rankedPlayers = playersArr.map(p => {
            const historyScore = (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0);
            const liveScore = p.submitted ? 0 : (p.liveScore || 0);
            return { ...p, displayTotal: historyScore + liveScore };
        }).sort((a,b) => b.displayTotal - a.displayTotal);

        document.getElementById('live-rankings-list').innerHTML = rankedPlayers.map(p => `
            <div class="live-rank-row ${p.name === myName ? 'me-highlight' : ''}">
                <div>${p.name} ${p.submitted ? '✅' : '⚡'}</div>
                <div>${p.isBusted ? 'BUST' : p.displayTotal + ' pts'}</div>
            </div>`).join("");
    }
    updateUI();
}

// --- Interaction Exports ---
window.adjustCount = (v) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v));
    const display = document.getElementById('playerCountDisplay');
    if (display) display.innerText = targetPlayerCount;
};

window.triggerBust = () => { 
    busted = !busted; 
    if(busted) { usedCards = []; bonuses = []; mult = 1; } 
    updateUI(); 
};

window.toggleMod = (id, val) => { 
    if(id === 'm2') mult = (mult === 2) ? 1 : 2; 
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val); 
    updateUI(); 
};

window.submitRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const score = calculateCurrentScore();
    let h = (await get(ref(db, `games/${gameCode}/players/${myName}`))).val().history || [0];
    h[rNum] = { score, usedCards: [...usedCards], bonuses: [...bonuses], mult, busted };
    await update(ref(db, `games/${gameCode}/players/${myName}`), { 
        history: h, submitted: true, liveScore: 0, isBusted: false 
    });
    usedCards = []; bonuses = []; mult = 1; busted = false; updateUI();
};

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'flex';
};

window.leaveGame = () => { location.reload(); };

// --- Helpers ---
function calculateCurrentScore() {
    if (busted) return 0;
    const sum = usedCards.reduce((a, b) => a + b, 0);
    const totalB = bonuses.reduce((a, b) => a + b, 0);
    const f7Bonus = (usedCards.length === 7) ? 15 : 0;
    return (sum * mult) + totalB + f7Bonus;
}

function saveToGameList(code) {
    if (!activeGames.includes(String(code))) {
        activeGames.push(String(code));
        localStorage.setItem('f7_game_list', JSON.stringify(activeGames));
    }
}

function updateUI() {
    const hasF7 = (usedCards.length === 7);
    document.getElementById('flip7-banner').style.display = hasF7 ? 'block' : 'none';
    const roundScore = calculateCurrentScore();
    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + roundScore;

    if (gameCode && myName) {
        update(ref(db, `games/${gameCode}/players/${myName}`), { liveScore: roundScore, isBusted: busted });
    }

    const grid = document.getElementById('cardGrid');
    if(grid) {
        Array.from(grid.children).forEach((btn) => {
            const val = parseInt(btn.innerText);
            if (!isNaN(val)) {
                btn.className = btn.className.replace(/\bactive-\d+\b/g, "");
                if (usedCards.includes(val)) btn.classList.add(`active-${val}`);
            }
        });
    }

    document.getElementById('bust-toggle-btn').className = busted ? "big-btn bust-btn bust-grid-layout bust-active" : "big-btn bust-btn bust-grid-layout";
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2,4,6,8,10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

// --- DOM Load ---
document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) {
        nInput.value = myName;
        nInput.addEventListener('input', () => {
            myName = nInput.value;
            localStorage.setItem('f7_name', myName);
        });
    }
    const countDisp = document.getElementById('playerCountDisplay');
    if (countDisp) countDisp.innerText = targetPlayerCount;

    const grid = document.getElementById('cardGrid');
    const bustBtn = document.getElementById('bust-toggle-btn');
    if(grid) {
        grid.innerHTML = "";
        for(let i=0; i<=12; i++){
            let btn = document.createElement('button');
            btn.innerText = i;
            btn.onclick = () => {
                if (busted) { busted = false; usedCards = [i]; }
                else {
                    if(usedCards.includes(i)) usedCards = usedCards.filter(v=>v!==i);
                    else if(usedCards.length < 7) usedCards.push(i);
                }
                updateUI();
            };
            grid.appendChild(btn);
        }
        if(bustBtn) grid.appendChild(bustBtn);
    }
});
