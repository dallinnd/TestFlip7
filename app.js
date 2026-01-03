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

// --- Global UI Exports ---
window.adjustCount = (v) => {
    targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v));
    document.getElementById('playerCountDisplay').innerText = targetPlayerCount;
};

window.clearCards = () => {
    usedCards = []; busted = false; mult = 1; bonuses = [];
    updateUI();
};

window.toggleLog = async () => {
    const overlay = document.getElementById('log-overlay');
    const isVisible = overlay.style.display === 'flex';
    if (!isVisible) {
        const snap = await get(ref(db, `games/${gameCode}/players/${myName}`));
        const hist = snap.val().history || [];
        document.getElementById('history-list').innerHTML = hist.map((entry, idx) => {
            if (idx === 0) return "";
            const score = typeof entry === 'object' ? entry.score : entry;
            const isBust = typeof entry === 'object' ? entry.busted : (score === 0);
            return `<div class="log-item"><span class="log-round">RD ${idx}</span><span class="${isBust?'log-bust':''}">${isBust?'BUSTED':score+' pts'}</span></div>`;
        }).join("");
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
};

window.hostGameFromUI = async () => {
    if(!myName) return alert("Enter Name!");
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    saveToGameList(code);
    await set(ref(db, `games/${code}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
    await set(ref(db, `games/${code}/players/${myName}`), { name: myName, history: [0], submitted: false });
    onValue(ref(db, `games/${code}`), syncApp);
};

window.openJoinPopup = () => {
    let c = prompt("6-Digit Code:");
    if(c && myName) joinGame(c);
};

// --- Core Logic ---
function calculateCurrentScore() {
    if (busted) return 0;
    const sum = usedCards.reduce((a, b) => a + b, 0);
    const totalB = bonuses.reduce((a, b) => a + b, 0);
    return (sum * mult) + totalB + (usedCards.length === 7 ? 15 : 0);
}

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
                <span>${p.name} ${p.submitted?'✅':'<span class="live-icon">⚡</span>'}</span>
                <b>${p.isBusted?'BUST':p.total+' pts'}</b>
            </div>`).join("");

        document.getElementById('leaderboard').innerHTML = ranked.map(p => `
            <div class="p-row ${p.isBusted?'busted-row':''} ${p.total>=200?'threshold-style':''}">
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
    const hasF7 = usedCards.length === 7;
    if(hasF7 && !hasCelebrated && !busted) { document.getElementById('celebration-overlay').style.display = 'flex'; hasCelebrated = true; }
    if(!hasF7) hasCelebrated = false;
    document.getElementById('flip7-banner').style.display = hasF7 ? 'block' : 'none';

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

// --- Lifecycle & Exports ---
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

window.toggleMod = (id, val) => {
    if(id === 'm2') mult = (mult === 2) ? 1 : 2;
    else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val);
    updateUI();
};

window.showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'flex';
};

window.leaveGame = () => { if(confirm("Exit?")) location.reload(); };
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
