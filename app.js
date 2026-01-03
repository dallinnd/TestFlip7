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
let usedCards = [], bonuses = [], mult = 1, busted = false, currentGrandTotal = 0;
let targetPlayerCount = 4, hasCelebrated = false;

const haptic = () => { if (navigator.vibrate) navigator.vibrate(10); };

window.adjustCount = (v) => { haptic(); targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v)); document.getElementById('playerCountDisplay').innerText = targetPlayerCount; };

window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Enter name first!");
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await set(ref(db, `games/${code}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
    await set(ref(db, `games/${code}/players/${myName}`), { name: myName, history: [0], submitted: false, liveScore: 0 });
    onValue(ref(db, `games/${code}`), syncApp);
};

window.openJoinPopup = () => {
    let c = prompt("Enter 6-digit code:");
    if(c && myName) joinGame(c);
};

async function joinGame(code) {
    gameCode = String(code);
    const pRef = ref(db, `games/${gameCode}/players/${myName}`);
    const snap = await get(pRef);
    if (!snap.exists()) await set(pRef, { name: myName, history: [0], submitted: false, liveScore: 0 });
    onValue(ref(db, `games/${gameCode}`), syncApp);
}

function calculateScore() {
    if (busted) return 0;
    const sum = usedCards.reduce((a, b) => a + b, 0);
    const bTotal = bonuses.reduce((a, b) => a + b, 0);
    const f7 = (usedCards.length === 7) ? 15 : 0;
    return (sum * mult) + bTotal + f7;
}

function syncApp(snap) {
    const data = snap.val(); if(!data) return;
    gameCode = snap.key;
    document.getElementById('roomCodeDisplay').innerText = `CODE: ${gameCode} | R${data.roundNum}`;

    const me = data.players[myName]; if(!me) return;
    const playersArr = Object.values(data.players);

    currentGrandTotal = (me.history || [0]).reduce((acc, entry, idx) => {
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
            const hScore = (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? b.score : b), 0);
            const total = hScore + (p.submitted ? 0 : (p.liveScore || 0));
            return { ...p, total };
        }).sort((a,b) => b.total - a.total);

        document.getElementById('live-rankings-list').innerHTML = ranked.map(p => `
            <div class="live-rank-row ${p.name === myName ? 'me-highlight' : ''}">
                <span>${p.name} ${p.submitted ? '✅' : '⚡'}</span>
                <span>${p.isBusted ? 'BUST' : p.total + ' pts'}</span>
            </div>`).join("");
            
        document.getElementById('leaderboard').innerHTML = ranked.map(p => `
            <div class="p-row ${p.total >= 200 ? 'threshold-style' : ''}">
                <b>${p.name}</b> <span>${p.total} pts</span>
            </div>`).join("");

        const isAllDone = playersArr.every(p => p.submitted);
        const nextBtn = document.getElementById('nextRoundBtn');
        const finishBtn = document.getElementById('finishGameBtn');
        const threshold = ranked.some(p => p.total >= 200);

        if (data.host === myName && isAllDone) {
            nextBtn.style.display = threshold ? 'none' : 'block';
            finishBtn.style.display = threshold ? 'block' : 'none';
        }
    }
    updateUI();
}

function updateUI() {
    const roundScore = calculateScore();
    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + roundScore;
    
    if (gameCode && myName) update(ref(db, `games/${gameCode}/players/${myName}`), { liveScore: roundScore, isBusted: busted });

    const grid = document.getElementById('cardGrid');
    Array.from(grid.children).forEach((btn, i) => {
        if (usedCards.includes(i)) btn.classList.add('card-active-style');
        else btn.classList.remove('card-active-style');
    });

    document.getElementById('bust-toggle-btn').className = busted ? "bust-btn bust-active" : "bust-btn";
}

window.triggerBust = () => { haptic(); busted = !busted; if(busted){ usedCards=[]; bonuses=[]; mult=1; } updateUI(); };

window.submitRound = async () => {
    haptic();
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    let h = (await get(ref(db, `games/${gameCode}/players/${myName}`))).val().history || [0];
    h[rNum] = { score: calculateScore(), busted };
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true, liveScore: 0 });
    usedCards=[]; bonuses=[]; mult=1; busted=false; updateUI();
};

window.showScreen = (id) => { document.querySelectorAll('.screen').forEach(s => s.style.display='none'); document.getElementById(id).style.display='flex'; };
window.leaveGame = () => location.reload();
window.closeCelebration = () => document.getElementById('celebration-overlay').style.display='none';

document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); };
    
    const grid = document.getElementById('cardGrid');
    const bustBtn = document.getElementById('bust-toggle-btn');
    grid.innerHTML = "";
    for(let i=0; i<=12; i++){
        let btn = document.createElement('button'); btn.innerText = i;
        btn.onclick = () => { 
            haptic(); 
            if(busted){ busted=false; usedCards=[i]; }
            else { usedCards.includes(i) ? usedCards=usedCards.filter(v=>v!==i) : usedCards.push(i); }
            updateUI(); 
        };
        grid.appendChild(btn);
    }
    grid.appendChild(bustBtn);
});
