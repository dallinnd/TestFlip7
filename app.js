import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- Firebase Configuration ---
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

// --- State Variables ---
let myName = localStorage.getItem('f7_name') || "";
let gameCode = null;
let activeGames = JSON.parse(localStorage.getItem('f7_game_list')) || [];
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0;
let targetPlayerCount = 4, hasCelebrated = false;

/**
 * GLOBAL EXPORTS
 * These functions are attached to the 'window' object so they can be 
 * called directly from the HTML 'onclick' attributes.
 */

window.adjustCount = (v) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v));
    const display = document.getElementById('playerCountDisplay');
    if (display) display.innerText = targetPlayerCount;
};

window.deleteGame = (code) => {
    if (confirm(`Remove Game ${code} from your list?`)) {
        activeGames = activeGames.filter(c => String(c) !== String(code));
        localStorage.setItem('f7_game_list', JSON.stringify(activeGames));
        renderGameList();
    }
};

window.deleteAllGames = () => {
    if (confirm("Delete ALL games from your local list?")) {
        activeGames = [];
        localStorage.setItem('f7_game_list', JSON.stringify([]));
        renderGameList();
    }
};

window.resumeSpecificGame = (code) => joinGame(code);

window.showEndPrompt = () => {
    document.getElementById('end-game-overlay').style.display = 'flex';
};

window.rematch = async () => {
    if (!gameCode) return;
    const snap = await get(ref(db, `games/${gameCode}`));
    const players = snap.val().players;
    const updates = {};
    
    updates[`games/${gameCode}/roundNum`] = 1;
    updates[`games/${gameCode}/status`] = "active";
    for (let p in players) {
        updates[`games/${gameCode}/players/${p}/history`] = [0];
        updates[`games/${gameCode}/players/${p}/submitted`] = false;
        updates[`games/${gameCode}/players/${p}/liveScore`] = 0;
        updates[`games/${gameCode}/players/${p}/isBusted`] = false;
    }
    
    await update(ref(db), updates);
    document.getElementById('end-game-overlay').style.display = 'none';
};

window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Please enter your name first!");
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    saveToGameList(newCode);
    await set(ref(db, `games/${newCode}`), { 
        host: myName, 
        targetCount: targetPlayerCount, 
        status: "waiting", 
        roundNum: 1 
    });
    await set(ref(db, `games/${newCode}/players/${myName}`), { 
        name: myName, 
        history: [0], 
        submitted: false,
        isBusted: false,
        liveScore: 0
    });
    onValue(ref(db, `games/${newCode}`), syncApp);
};

window.openJoinPopup = () => {
    let c = prompt("Enter 6-digit code:");
    if(c && myName) joinGame(c);
    else if(!myName) alert("Please enter your name first!");
};

// --- Scoring Logic ---
function calculateCurrentScore() {
    if (busted) return 0;
    const sum = usedCards.reduce((a, b) => a + b, 0);
    const totalB = bonuses.reduce((a, b) => a + b, 0);
    const f7Bonus = (usedCards.length === 7) ? 15 : 0;
    return (sum * mult) + totalB + f7Bonus;
}

// --- Local Management ---
function saveToGameList(code) {
    if (!activeGames.includes(String(code))) {
        activeGames.push(String(code));
        localStorage.setItem('f7_game_list', JSON.stringify(activeGames));
    }
    renderGameList();
}

async function joinGame(code) {
    gameCode = String(code); 
    saveToGameList(gameCode);
    const pRef = ref(db, `games/${gameCode}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0], submitted: false, isBusted: false, liveScore: 0 });
    onValue(ref(db, `games/${gameCode}`), syncApp);
}

function renderGameList() {
    const manager = document.getElementById('game-manager');
    const container = document.getElementById('game-list-container');
    if (!container || !manager) return;
    if (activeGames.length === 0) { manager.style.display = 'none'; return; }
    manager.style.display = 'block';
    container.innerHTML = activeGames.map(code => `
        <div class="game-item">
            <div class="game-info" onclick="window.resumeSpecificGame('${code}')">GAME: ${code}</div>
            <button class="delete-single-btn" onclick="window.deleteGame('${code}')">×</button>
        </div>`).join("");
}

// --- Real-time Sync Logic ---

function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    gameCode = snap.key;
    
    // Update Header Labels
    const lobbyDisp = document.getElementById('roomDisplayLobby');
    const gameDisp = document.getElementById('roomCodeDisplay');
    if (lobbyDisp) lobbyDisp.innerText = "Game: " + gameCode;
    if (gameDisp) gameDisp.innerText = `CODE: ${gameCode} | R${data.roundNum}`;

    const me = data.players[myName]; if(!me) return;
    const playersArr = Object.values(data.players || {});

    // Calculate My Current Grand Total (excluding this live round)
    const myHistory = me.history || [0];
    currentGrandTotal = myHistory.reduce((acc, entry, idx) => {
        if (idx > 0 && idx < data.roundNum) {
            const val = (typeof entry === 'object') ? entry.score : entry;
            return acc + (val || 0);
        }
        return acc;
    }, 0);
    
    if (data.status === "waiting") {
        window.showScreen('lobby-screen');
        document.getElementById('lobby-status').innerText = `Joined: ${playersArr.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = playersArr.map(p => `<div class="p-row"><b>${p.name}</b></div>`).join("");
        if(playersArr.length >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), { status: "active" });
    } else {
        window.showScreen('game-screen');
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
        
        // --- Process Live Rankings ---
        let anyoneReachedThreshold = false;
        const rankedPlayers = playersArr.map(p => {
            const historyScore = (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0);
            const liveScore = p.submitted ? 0 : (p.liveScore || 0);
            const total = historyScore + liveScore;
            if (total >= 200) anyoneReachedThreshold = true;
            return { ...p, displayTotal: total, isMe: p.name === myName };
        }).sort((a,b) => b.displayTotal - a.displayTotal);

        // Render Live Standings (on Calculator Screen)
        const liveList = document.getElementById('live-rankings-list');
        if (liveList) {
            liveList.innerHTML = rankedPlayers.map(p => `
                <div class="live-rank-row ${p.isMe ? 'me-highlight' : ''}">
                    <div class="live-rank-name">${p.name} ${p.submitted ? '✅' : '<span class="live-icon">⚡</span>'}</div>
                    <div class="live-rank-total">${p.isBusted ? '<span style="color:var(--danger)">BUST</span>' : p.displayTotal + ' pts'}</div>
                </div>`).join("");
        }

        // Render Final Leaderboard (on Waiting Screen)
        document.getElementById('leaderboard').innerHTML = rankedPlayers.map(p => `
            <div class="p-row ${p.isBusted ? 'busted-row' : ''} ${p.displayTotal >= 200 ? 'threshold-style' : ''}">
                <b>${p.name} ${p.submitted ? '✅' : '...'}</b>
                <span>${p.isBusted ? 'BUST' : p.displayTotal + ' pts'}</span>
            </div>`).join("");

        // Host Control Buttons
        const isAllSubmitted = playersArr.every(p => p.submitted);
        const nextBtn = document.getElementById('nextRoundBtn');
        const finishBtn = document.getElementById('finishGameBtn');

        if (data.host === myName && isAllSubmitted) {
            if (anyoneReachedThreshold) {
                nextBtn.style.display = 'none';
                finishBtn.style.display = 'block';
            } else {
                nextBtn.style.display = 'block';
                finishBtn.style.display = 'none';
            }
        } else {
            nextBtn.style.display = 'none';
            finishBtn.style.display = 'none';
        }
    }
    updateUI();
}

function updateUI() {
    const hasF7 = (usedCards.length === 7);
    const banner = document.getElementById('flip7-banner');
    
    if(hasF7 && !hasCelebrated && !busted) {
        document.getElementById('celebration-overlay').style.display = 'flex';
        hasCelebrated = true;
    }
    if(!hasF7) hasCelebrated = false;
    if(banner) banner.style.display = hasF7 ? 'block' : 'none';

    const roundScore = calculateCurrentScore();
    const liveGrandTotal = currentGrandTotal + roundScore;

    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = liveGrandTotal;
    
    // Push Live Data to Firebase
    if (gameCode && myName) {
        update(ref(db, `games/${gameCode}/players/${myName}`), { 
            liveScore: roundScore, 
            isBusted: busted 
        });
    }

    const grid = document.getElementById('cardGrid');
    if(grid) {
        Array.from(grid.children).forEach((btn, i) => {
            if (usedCards.includes(i)) btn.classList.add('card-active-style');
            else btn.classList.remove('card-active-style');
        });
    }

    document.getElementById('bust-toggle-btn').className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2,4,6,8,10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

// --- Interaction Exports ---
window.submitRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const score = calculateCurrentScore();
    let h = (await get(ref(db, `games/${gameCode}/players/${myName}`))).val().history || [0];
    h[rNum] = { score, usedCards: [...usedCards], bonuses: [...bonuses], mult, busted };
    await update(ref(db, `games/${gameCode}/players/${myName}`), { 
        history: h, 
        submitted: true, 
        liveScore: 0, 
        isBusted: false 
    });
    usedCards = []; bonuses = []; mult = 1; busted = false; updateUI();
};

window.editScore = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const me = snap.val().players[myName];
    if (me.history && me.history[rNum]) {
        const prev = me.history[rNum];
        usedCards = [...(prev.usedCards || [])]; bonuses = [...(prev.bonuses || [])];
        mult = prev.mult || 1; busted = prev.busted || false;
    }
    await update(ref(db, `games/${gameCode}/players/${myName}`), { submitted: false });
    updateUI();
};

window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const up = { [`games/${gameCode}/roundNum`]: snap.val().roundNum + 1 };
    for (let p in snap.val().players) up[`games/${gameCode}/players/${p}/submitted`] = false;
    await update(ref(db), up);
};

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = 'flex';
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

window.leaveGame = () => { 
    if(confirm("Exit to home page?")) location.reload(); 
};

window.closeCelebration = () => document.getElementById('celebration-overlay').style.display = 'none';

// --- Initialize UI on Load ---
document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) { 
        nInput.value = myName; 
        nInput.oninput = () => { 
            myName = nInput.value; 
            localStorage.setItem('f7_name', myName); 
        }; 
    }
    renderGameList();
    const grid = document.getElementById('cardGrid');
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
    }
});
