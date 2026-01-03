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

// --- State ---
let myName = localStorage.getItem('f7_name') || "";
let gameCode = null;
let activeGames = JSON.parse(localStorage.getItem('f7_game_list')) || [];
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0;
let targetPlayerCount = 4, hasCelebrated = false;

// --- Global Window Exports ---
window.adjustCount = (v) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v));
    document.getElementById('playerCountDisplay').innerText = targetPlayerCount;
};

window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Enter your name first!");
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    saveToGameList(newCode);
    await set(ref(db, `games/${newCode}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
    await joinGame(newCode);
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
    
    usedCards = []; bonuses = []; mult = 1; busted = false; 
    hasCelebrated = false; // Reset for next round
    updateUI();
};

// --- Logic ---
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
    
    const gameDisp = document.getElementById('roomCodeDisplay');
    if (gameDisp) gameDisp.innerText = `CODE: ${gameCode} | R${data.roundNum}`;

    const me = data.players[myName]; if(!me) return;
    const playersArr = Object.values(data.players || {});

    // Calculate current grand total from history
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
        const isWaiting = me.submitted;
        document.getElementById('calc-view').style.display = isWaiting ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = isWaiting ? 'block' : 'none';
        
        // Rankings logic
        const rankedPlayers = playersArr.map(p => {
            const historyScore = (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0);
            const total = historyScore + (p.submitted ? 0 : (p.liveScore || 0));
            return { ...p, displayTotal: total, isMe: p.name === myName };
        }).sort((a,b) => b.displayTotal - a.displayTotal);

        renderRankings(rankedPlayers);
    }
    updateUI();
}

function renderRankings(players) {
    const liveList = document.getElementById('live-rankings-list');
    if (liveList) {
        liveList.innerHTML = players.map(p => `
            <div class="live-rank-row ${p.isMe ? 'me-highlight' : ''}">
                <div>${p.name} ${p.submitted ? '✅' : '⚡'}</div>
                <div class="live-rank-total">${p.isBusted ? 'BUST' : p.displayTotal + 'pts'}</div>
            </div>`).join("");
    }
}

function updateUI() {
    const hasF7 = (usedCards.length === 7);
    const banner = document.getElementById('flip7-banner');
    
    // Celebration Trigger
    if(hasF7 && !hasCelebrated && !busted) {
        document.getElementById('celebration-overlay').style.display = 'flex';
        hasCelebrated = true;
    }
    if(!hasF7) hasCelebrated = false;
    
    if(banner) banner.style.display = (hasF7 && !busted) ? 'block' : 'none';

    const roundScore = calculateCurrentScore();
    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + roundScore;
    
    // Update live score in DB
    if (gameCode && myName && document.getElementById('calc-view').style.display !== 'none') {
        update(ref(db, `games/${gameCode}/players/${myName}`), { liveScore: roundScore, isBusted: busted });
    }

    // Refresh Grids
    const grid = document.getElementById('cardGrid');
    if(grid) {
        Array.from(grid.children).forEach((btn, i) => {
            btn.className = usedCards.includes(i) ? 'card-active-style' : '';
        });
    }
}

// Initializers
document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) {
        nInput.value = myName;
        nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); };
    }
    // Generate Cards
    const grid = document.getElementById('cardGrid');
    if(grid) {
        grid.innerHTML = "";
        for(let i=0; i<=12; i++){
            let btn = document.createElement('button');
            btn.innerText = i;
            btn.onclick = () => {
                if(busted) { busted = false; usedCards = [i]; }
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

// Helper Functions
async function joinGame(code) {
    gameCode = String(code); 
    saveToGameList(gameCode);
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
