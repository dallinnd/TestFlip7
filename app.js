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

// --- Window Functions ---
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

window.triggerBust = () => { 
    busted = !busted; 
    if(busted) { usedCards = []; bonuses = []; mult = 1; } 
    updateUI(); 
};

window.submitRound = async () => {
    const snap = await get(ref(db, `games/${gameCode}`));
    const rNum = snap.val().roundNum;
    const score = calculateCurrentScore();
    let h = (await get(ref(db, `games/${gameCode}/players/${myName}`))).val().history || [0];
    h[rNum] = { score, usedCards: [...usedCards], bonuses: [...bonuses], mult, busted };
    await update(ref(db, `games/${gameCode}/players/${myName}`), { history: h, submitted: true, liveScore: 0, isBusted: false });
    usedCards = []; bonuses = []; mult = 1; busted = false; updateUI();
};

// --- Core Logic ---
function calculateCurrentScore() {
    if (busted) return 0;
    const sum = usedCards.reduce((a, b) => a + b, 0);
    const totalB = bonuses.reduce((a, b) => a + b, 0);
    return (sum * mult) + totalB + (usedCards.length === 7 ? 15 : 0);
}

function updateUI() {
    const roundScore = calculateCurrentScore();
    document.getElementById('round-display').innerText = busted ? "BUST" : roundScore;
    document.getElementById('grand-display').innerText = currentGrandTotal + roundScore;

    // Highlight Cards
    const grid = document.getElementById('cardGrid');
    if(grid) {
        Array.from(grid.children).forEach((btn, i) => {
            if(i <= 12) { // Only highlight the number buttons
                if (usedCards.includes(i)) btn.classList.add('card-active-style');
                else btn.classList.remove('card-active-style');
            }
        });
    }
    document.getElementById('bust-toggle-btn').className = busted ? "big-btn bust-btn bust-active" : "big-btn bust-btn";
}

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    const nInput = document.getElementById('userNameInput');
    if(nInput) { 
        nInput.value = myName; 
        nInput.oninput = () => { myName = nInput.value; localStorage.setItem('f7_name', myName); }; 
    }

    const grid = document.getElementById('cardGrid');
    const bustBtn = document.getElementById('bust-toggle-btn');
    if(grid && bustBtn) {
        // We do NOT clear the grid. We insert numbers BEFORE the Bust button.
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
            grid.insertBefore(btn, bustBtn);
        }
    }
});

// (Keep your existing joinGame, syncApp, and other helper functions exactly as they were...)
