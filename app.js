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

const haptic = () => { if (navigator.vibrate) navigator.vibrate(12); };

window.adjustCount = (v) => { haptic(); targetPlayerCount = Math.max(1, Math.min(20, targetPlayerCount + v)); document.getElementById('playerCountDisplay').innerText = targetPlayerCount; };
window.showScreen = (id) => { document.querySelectorAll('.screen').forEach(s => s.style.display='none'); document.getElementById(id).style.display='flex'; };
window.leaveGame = () => location.reload();
window.closeCelebration = () => document.getElementById('celebration-overlay').style.display='none';

window.hostGameFromUI = async () => {
    if(!myName || myName.trim() === "") return alert("Enter name first!");
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await set(ref(db, `games/${code}`), { host: myName, targetCount: targetPlayerCount, status: "waiting", roundNum: 1 });
    await set(ref(db, `games/${code}/players/${myName}`), { name: myName, history: [0], submitted: false, liveScore: 0, isBusted: false });
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
    if (!snap.exists()) await set(pRef, { name: myName, history: [0], submitted: false, liveScore: 0, isBusted: false });
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
        if (idx > 0 && idx < data.roundNum) return acc + (typeof entry === 'object' ? (entry.score || 0) : (entry || 0));
        return acc;
    }, 0);

    if (data.status === "waiting") {
        window.showScreen('lobby-screen');
        document.getElementById('lobby-status').innerText = `Joined: ${playersArr.length} / ${data.targetCount}`;
        document.getElementById('player-list').innerHTML = playersArr.map(p => `<div class="player-tile"><b>${p.name}</b></div>`).join("");
        if(playersArr.length >= data.targetCount && data.host === myName) update(ref(db, `games/${gameCode}`), { status: "active" });
    } else {
        window.showScreen('game-screen');
        document.getElementById('calc-view').style.display = me.submitted ? 'none' : 'block';
        document.getElementById('waiting-view').style.display = me.submitted ? 'block' : 'none';

        const ranked = playersArr.map(p => {
            const hScore = (p.history || []).reduce((a,b) => a + (typeof b === 'object' ? (b.score || 0) : (b || 0)), 0);
            const total = hScore + (p.submitted ? 0 : (p.liveScore || 0));
            return { ...p, total };
        }).sort((a,b) => b.total - a.total);

        const buildTile = (p) => `
            <div class="player-tile ${p.name === myName ? 'me-highlight' : ''} ${p.isBusted ? 'busted-tile' : ''}">
                <b>${p.name} ${p.submitted ? '✅' : '⚡'}</b>
                <span>${p.isBusted ? 'BUST' : p.total}</span>
            </div>`;

        document.getElementById('live-rankings-list').innerHTML = ranked.map(buildTile).join("");
        document.getElementById('leaderboard').innerHTML = ranked.map(buildTile).join("");

        if (data.host === myName && playersArr.every(p => p.submitted)) {
            const won = ranked.some(p => p.total >= 200);
            document.getElementById('nextRoundBtn').style.display = won ? 'none' : 'block';
            document.getElementById('finishGameBtn').style.display = won ? 'block' : 'none';
        }
    }
    updateUI();
}

function updateUI() {
    const roundScore = calculateScore();
    const hasF7 = (usedCards.length === 7);
    if(hasF7 && !hasCelebrated && !busted) { document.getElementById('celebration-overlay').style.display = 'flex'; hasCelebrated = true; }
    if(!hasF7) hasCelebrated = false;
    document.getElementById('flip7-banner').style.display = hasF7 ? 'block' : 'none';

    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + roundScore;
    
    if (gameCode && myName) update(ref(db, `games/${gameCode}/players/${myName}`), { liveScore: roundScore, isBusted: busted });

    document.querySelectorAll('#cardGrid button:not(.bust-btn)').forEach(btn => {
        const val = parseInt(btn.innerText);
        if(usedCards.includes(val)) btn.classList.add('card-active-style');
        else btn.classList.remove('card-active-style');
    });

    document.getElementById('bust-toggle-btn').className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
    document.getElementById('btn-m2').className = (mult === 2) ? "mod-btn-active" : "";
    [2,4,6,8,10].forEach(v => {
        const b = document.getElementById('btn-p' + v);
        if(b) b.className = bonuses.includes(v) ? "mod-btn-active" : "";
    });
}

window.triggerBust = () => { haptic(); busted = !busted; if(busted){ usedCards=[]; bonuses=[]; mult=1; } updateUI(); };
window.toggleMod = (id, val) => { haptic(); if(id === 'm2') mult = (mult === 2) ? 1 : 2; else bonuses.includes(val) ? bonuses = bonuses.filter(b=>b!==val) : bonuses.push(val); updateUI(); };

window.submitRound = async () => {
    haptic();
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const meSnap = await get(ref(db, `games/${gameCode}/players/${myName}`));
    let h = meSnap.val().history || [0];
    h[rNum] = { score: calculateScore(), busted };
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true, liveScore: 0 });
    usedCards=[]; bonuses=[]; mult=1; busted=false; updateUI();
};

window.editScore = async () => { haptic(); await update(ref(db, `games/${gameCode}/players/${myName}`), { submitted: false }); };

window.readyForNextRound = async () => {
    haptic();
    const snap = await get(ref(db, `games/${gameCode}`));
    const up = { [`games/${gameCode}/roundNum`]: snap.val().roundNum + 1 };
    for (let p in snap.val().players) up[`games/${gameCode}/players/${p}/submitted`] = false;
    await update(ref(db), up);
};

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('cardGrid');
    const bustBtn = document.getElementById('bust-toggle-btn');
    const nInput = document.getElementById('userNameInput');
    if(nInput) { nInput.value = myName; nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); }; }
    grid.innerHTML = "";
    for(let i=0; i<=12; i++){
        let btn = document.createElement('button'); btn.innerText = i;
        btn.onclick = () => { 
            haptic(); 
            if(busted){ busted=false; usedCards=[i]; }
            else { usedCards.includes(i) ? usedCards=usedCards.filter(v=>v!==i) : (usedCards.length < 7 && usedCards.push(i)); }
            updateUI(); 
        };
        grid.appendChild(btn);
    }
    grid.appendChild(bustBtn);
});
