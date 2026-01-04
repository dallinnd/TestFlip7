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

// --- Global UI Logic ---
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

// --- Scoring & Sync ---
function calculateCurrentScore() {
    if (busted) return 0;
    const sum = usedCards.reduce((a, b) => a + b, 0);
    const totalB = bonuses.reduce((a, b) => a + b, 0);
    const f7Bonus = (usedCards.length === 7) ? 15 : 0;
    return (sum * mult) + totalB + f7Bonus;
}

function updateUI() {
    const hasF7 = (usedCards.length === 7);
    if(hasF7 && !hasCelebrated && !busted) {
        document.getElementById('celebration-overlay').style.display = 'flex';
        hasCelebrated = true;
    }
    if(!hasF7) hasCelebrated = false;
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

// --- Lifecycle ---
document.addEventListener('DOMContentLoaded', () => {
    // Name Input Fix
    const nInput = document.getElementById('userNameInput');
    if(nInput) {
        nInput.value = myName;
        nInput.addEventListener('input', () => {
            myName = nInput.value;
            localStorage.setItem('f7_name', myName);
        });
    }

    // Player Count Display Fix
    const countDisp = document.getElementById('playerCountDisplay');
    if (countDisp) countDisp.innerText = targetPlayerCount;

    // Grid Initialization
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

// Note: Include your other existing Firebase functions (syncApp, hostGameFromUI, etc.) below this line.
