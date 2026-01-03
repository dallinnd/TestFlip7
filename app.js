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
let targetPlayerCount = 4;
let hasCelebratedThisRound = false; 

// --- Window Exports ---
window.adjustCount = (v) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v));
    document.getElementById('playerCountDisplay').innerText = targetPlayerCount;
};

window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Please enter your name first!");
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    saveToGameList(newCode);
    await set(ref(db, `games/${newCode}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
    joinGame(newCode);
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
    
    usedCards = []; bonuses = []; mult = 1; busted = false; hasCelebratedThisRound = false; 
    updateUI();
};

// --- Core Logic ---
function calculateCurrentScore() {
    if (busted) return 0;
    const sum = usedCards.reduce((a, b) => a + b, 0);
    const totalB = bonuses.reduce((a, b) => a + b, 0);
    const f7Bonus = (usedCards.length === 7) ? 15 : 0;
    return (sum * mult) + totalB + f7Bonus;
}

function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    gameCode = snap.key;
    const me = data.players[myName]; if(!me) return;
    const playersArr = Object.values(data.players || {});

    document.getElementById('roomCodeDisplay').innerText = `CODE: ${gameCode} | R${data.roundNum}`;

    currentGrandTotal = (me.history || [0]).reduce((acc, entry, idx) => {
        if (idx > 0 && idx < data.roundNum) {
            const val = (typeof entry === 'object') ? entry.score : entry;
            return acc + (val || 0);
        }
        return acc;
    }, 0);
    
    if (data.status === "waiting") {
        window.showScreen('lobby-screen');
        document.getElementById('lobby-status').innerText = `Joined: ${playersArr.length} / ${data.targetCount}`;
        if(playersArr.length >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), { status: "active" });
    } else {
        window.showScreen('game-screen');
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';
        
        const rankedPlayers = playersArr.map(p => {
            const historyScore = (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0);
            const total = historyScore + (p.submitted ? 0 : (p.liveScore || 0));
            return { ...p, displayTotal: total, isMe: p.name === myName };
        }).sort((a,b) => b.displayTotal - a.displayTotal);

        const liveList = document.getElementById('live-rankings-list');
        if (liveList) {
            liveList.innerHTML = rankedPlayers.map(p => `
                <div class="live-rank-row ${p.isMe ? 'me-highlight' : ''}">
                    <div>${p.name} ${p.submitted ? '✅' : '⚡'}</div>
                    <div style="color: ${p.isBusted ? 'var(--danger)' : 'var(--gold)'}">${p.isBusted ? 'BUST' : p.displayTotal + ' pts'}</div>
                </div>`).join("");
        }
    }
    updateUI();
}

function updateUI() {
    const hasF7 = (usedCards.length === 7);
    if(hasF7 && !hasCelebratedThisRound && !busted) {
        document.getElementById('celebration-overlay').style.display = 'flex';
        hasCelebratedThisRound = true;
    }
    if(!hasF7) hasCelebratedThisRound = false;
    
    const banner = document.getElementById('flip7-banner');
    if(banner) banner.style.display = (hasF7 && !busted) ? 'block' : 'none';

    const roundScore = calculateCurrentScore();
    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + roundScore;
    
    const isPlaying = document.getElementById('calc-view').style.display === 'block';
    if (gameCode && myName && isPlaying) {
        update(ref(db, `games/${gameCode}/players/${myName}`), { liveScore: roundScore, isBusted: busted });
    }

    const grid = document.getElementById('cardGrid');
    if(grid) {
        Array.from(grid.children).forEach((btn, i) => {
            if (i <= 12) btn.className = usedCards.includes(i) ? 'card-active-style' : '';
        });
    }

    const bBtn = document.getElementById('bust-toggle-btn');
    if(bBtn) bBtn.className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
    
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2,4,6,8,10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) { 
        nInput.value = myName; 
        nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); }; 
    }
    
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
        // Add Bust Button into the same grid
        let bustBtn = document.createElement('button');
        bustBtn.id = "bust-toggle-btn";
        bustBtn.innerText = "BUST";
        bustBtn.className = "big-btn bust-btn";
        bustBtn.onclick = () => window.triggerBust();
        grid.appendChild(bustBtn);
    }
});

// Helpers
async function joinGame(code) {
    gameCode = String(code); 
    const pRef = ref(db, `games/${gameCode}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0], submitted: false, isBusted: false, liveScore: 0 });
    onValue(ref(db, `games/${gameCode}`), syncApp);
}

function saveToGameList(code) {
    if (!activeGames.includes(String(code))) {
        activeGames.push(String(code));
        localStorage.setItem('f7_game_list', JSON.stringify(activeGames));
    }
}

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};

window.triggerBust = () => { busted = !busted; if(busted) { usedCards = []; bonuses = []; mult = 1; } updateUI(); };
window.toggleMod = (id, val) => { if(id === 'm2') mult = (mult === 2) ? 1 : 2; else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val); updateUI(); };
window.leaveGame = () => { if(confirm("Exit to home?")) location.reload(); };
window.closeCelebration = () => document.getElementById('celebration-overlay').style.display = 'none';
