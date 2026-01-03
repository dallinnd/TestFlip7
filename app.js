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

// --- GLOBAL EXPORTS (Crucial for onclick to work) ---
window.adjustCount = (v) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v));
    document.getElementById('playerCountDisplay').innerText = targetPlayerCount;
};

window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Enter Name!");
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    saveToGameList(code);
    await set(ref(db, `games/${code}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
    await set(ref(db, `games/${code}/players/${myName}`), { name: myName, history: [0], submitted: false });
    onValue(ref(db, `games/${code}`), syncApp);
};

window.deleteGame = (code) => {
    if (confirm(`Remove Game ${code}?`)) {
        activeGames = activeGames.filter(c => String(c) !== String(code));
        localStorage.setItem('f7_game_list', JSON.stringify(activeGames));
        renderGameList();
    }
};

window.deleteAllGames = () => {
    if (confirm("Delete ALL games?")) {
        activeGames = [];
        localStorage.setItem('f7_game_list', JSON.stringify([]));
        renderGameList();
    }
};

window.openJoinPopup = () => {
    let c = prompt("6-Digit Code:");
    if(c && myName) joinGame(c);
};

window.clearCards = () => {
    usedCards = []; busted = false; mult = 1; bonuses = [];
    updateUI();
};

window.toggleLog = async () => {
    const overlay = document.getElementById('log-overlay');
    if (overlay.style.display !== 'flex') {
        const snap = await get(ref(db, `games/${gameCode}/players/${myName}`));
        const hist = snap.val().history || [];
        document.getElementById('history-list').innerHTML = hist.map((entry, idx) => {
            if (idx === 0) return "";
            const score = typeof entry === 'object' ? entry.score : entry;
            const isBust = typeof entry === 'object' ? entry.busted : (score === 0);
            return `<div class="log-item"><b>RD ${idx}</b><span style="${isBust?'color:red':''}">${isBust?'BUSTED':score+' pts'}</span></div>`;
        }).join("");
        overlay.style.display = 'flex';
    } else overlay.style.display = 'none';
};

// --- Core App Logic ---
function calculateCurrentScore() {
    if (busted) return 0;
    const sum = usedCards.reduce((a, b) => a + b, 0);
    const totalB = bonuses.reduce((a, b) => a + b, 0);
    return (sum * mult) + totalB + (usedCards.length === 7 ? 15 : 0);
}

function saveToGameList(code) {
    if (!activeGames.includes(String(code))) {
        activeGames.push(String(code));
        localStorage.setItem('f7_game_list', JSON.stringify(activeGames));
    }
    renderGameList();
}

async function joinGame(code) {
    gameCode = String(code); saveToGameList(gameCode);
    const pRef = ref(db, `games/${gameCode}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0], submitted: false });
    onValue(ref(db, `games/${gameCode}`), syncApp);
}

function renderGameList() {
    const container = document.getElementById('game-list-container');
    const manager = document.getElementById('game-manager');
    if (!container || !manager) return;
    if (activeGames.length === 0) { manager.style.display = 'none'; return; }
    manager.style.display = 'block';
    container.innerHTML = activeGames.map(code => `
        <div class="game-item" style="display:flex; justify-content:space-between; align-items:center; background:var(--glass); padding:10px; border-radius:15px; margin-bottom:10px;">
            <div onclick="window.resumeSpecificGame('${code}')" style="font-weight:900; cursor:pointer;">GAME: ${code}</div>
            <button onclick="window.deleteGame('${code}')" style="background:var(--danger); border:none; border-radius:8px; color:white; width:30px; height:30px;">×</button>
        </div>`).join("");
}

window.resumeSpecificGame = (code) => joinGame(code);

function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    gameCode = snap.key;
    const playersArr = Object.values(data.players || {});
    const me = data.players[myName]; if(!me) return;

    currentGrandTotal = (me.history || []).reduce((acc, entry, idx) => {
        if (idx > 0 && idx < data.roundNum) return acc + (typeof entry === 'object' ? entry.score : entry);
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
        
        const ranked = playersArr.map(p => {
            const grand = (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0);
            const live = p.submitted ? 0 : (p.liveScore || 0);
            return { ...p, total: grand + live };
        }).sort((a,b) => b.total - a.total);

        document.getElementById('live-rankings-list').innerHTML = ranked.map(p => `
            <div class="live-rank-row ${p.name===myName?'me-highlight':''}">
                <span>${p.name} ${p.submitted?'✅':'⚡'}</span>
                <b>${p.isBusted?'BUST':p.total+' pts'}</b>
            </div>`).join("");

        document.getElementById('leaderboard').innerHTML = ranked.map(p => `
            <div class="p-row ${p.isBusted?'busted-row':''}" style="padding:15px; background:rgba(0,0,0,0.2); border-radius:15px; margin-bottom:8px; display:flex; justify-content:space-between;">
                <b>${p.name}</b><span>${p.isBusted?'BUST':p.total+' pts'}</span>
            </div>`).join("");

        const allSub = playersArr.every(p => p.submitted);
        const someoneWon = ranked.some(p => p.total >= 200);
        document.getElementById('nextRoundBtn').style.display = (data.host===myName && allSub && !someoneWon) ? 'block' : 'none';
        document.getElementById('finishGameBtn').style.display = (data.host===myName && allSub && someoneWon) ? 'block' : 'none';
    }
    updateUI();
}

function updateUI() {
    const rScore = calculateCurrentScore();
    document.getElementById('round-display').innerText = busted ? "BUST" : rScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + rScore;
    
    if (gameCode && myName) update(ref(db, `games/${gameCode}/players/${myName}`), { liveScore: rScore, isBusted: busted });

    const grid = document.getElementById('cardGrid');
    if(grid) {
        Array.from(grid.children).forEach((btn, i) => {
            btn.className = "";
            if(usedCards.includes(i)) btn.className = busted ? "card-busted-style" : "card-active-style";
        });
    }
    document.getElementById('bust-toggle-btn').innerText = busted ? "UNBUST / CLEAR" : "CLEAR CARDS";
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
    h[rNum] = { score, busted, usedCards: [...usedCards], bonuses: [...bonuses], mult };
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true, liveScore: 0, isBusted: false });
    window.clearCards();
};

window.readyForNextRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const up = { [`games/${gameCode}/roundNum`]: snap.val().roundNum + 1 };
    for (let p in snap.val().players) up[`games/${gameCode}/players/${p}/submitted`] = false;
    await update(ref(db), up);
};

window.rematch = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const players = snap.val().players;
    const updates = {};
    updates[`games/${gameCode}/roundNum`] = 1;
    updates[`games/${gameCode}/status`] = "active";
    for (let p in players) {
        updates[`games/${gameCode}/players/${p}/history`] = [0];
        updates[`games/${gameCode}/players/${p}/submitted`] = false;
    }
    await update(ref(db), updates);
    document.getElementById('end-game-overlay').style.display = 'none';
};

window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
};

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};

window.leaveGame = () => location.reload();
window.closeCelebration = () => document.getElementById('celebration-overlay').style.display = 'none';

document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) { nInput.value = myName; nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); }; }
    renderGameList();
    const grid = document.getElementById('cardGrid');
    if(grid) {
        grid.innerHTML = "";
        for(let i=0; i<=12; i++){
            let btn = document.createElement('button'); btn.innerText = i;
            btn.onclick = () => {
                if(!usedCards.includes(i) && !busted) usedCards.push(i);
                else if(usedCards.includes(i) && !busted) { busted = true; usedCards = [i]; }
                else if(busted) { busted = false; usedCards = [i]; }
                updateUI();
            };
            grid.appendChild(btn);
        }
    }
});
