const { Telegraf } = require('telegraf');
const axios = require('axios');
const express = require('express');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDocs, collection, query } = require('firebase/firestore');

// --- आपकी डिटेल्स ---
const BOT_TOKEN = '8603590032:AAHn_ekd98bHCFU4dGLP7rJpJRuItkbZg_M'; 
const CHANNEL_ID = '-1003741235401'; 
const API_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

// --- आपकी Firebase Config (Updated) ---
const firebaseConfig = {
  apiKey: "AIzaSyA4QXhRkP1QESIMNBIKDmbs9sNxgzDTa7o",
  authDomain: "ai-prediction-bot-10e43.firebaseapp.com",
  projectId: "ai-prediction-bot-10e43",
  storageBucket: "ai-prediction-bot-10e43.firebasestorage.app",
  messagingSenderId: "361461213037",
  appId: "1:361461213037:web:61d8350f4ec029f97e5c64",
  measurementId: "G-WJX15QYL8F"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const bot = new Telegraf(BOT_TOKEN);
const appId = "ai-bot-v169";

let lastSavedIssue = ""; 
let currentPrediction = null;

// Deep Database Scanning Logic
async function analyzeBigData(currentSeq) {
    try {
        const historyRef = collection(db, 'artifacts', appId, 'public', 'data', 'game_history');
        const snapshot = await getDocs(query(historyRef));
        let allRecords = [];
        snapshot.forEach(doc => allRecords.push(doc.data()));
        
        // लेटेस्ट डेटा सबसे ऊपर
        allRecords.sort((a, b) => b.issueNumber - a.issueNumber);

        // कम से कम 20 डेटा होने पर ही प्रेडिक्शन शुरू करें
        if (allRecords.length < 20) return { pred: "SKIP", lvl: `Collecting (${allRecords.length})` };
        
        const historyNums = allRecords.map(h => parseInt(h.number));

        // Pattern Matching L3 to L12 (लाखों डेटा में से)
        for (let L = 12; L >= 3; L--) {
            const pattern = currentSeq.slice(0, L);
            for (let i = 1; i < historyNums.length - L; i++) {
                let match = true;
                for (let j = 0; j < L; j++) {
                    if (historyNums[i + j] !== pattern[j]) { match = false; break; }
                }
                if (match) {
                    const predictedNum = historyNums[i - 1];
                    return { pred: predictedNum >= 5 ? "BIG" : "SMALL", lvl: `L${L} DB-MATCH` };
                }
            }
        }
        return { pred: "SKIP", lvl: "No Match" };
    } catch (e) { 
        console.log("DB Error:", e);
        return { pred: "SKIP", lvl: "Syncing DB" }; 
    }
}

async function startTracking() {
    try {
        const response = await axios.get(`${API_URL}?pageSize=20&r=${Math.random()}`);
        const apiList = response.data.data.list;
        const latest = apiList[0];

        if (latest.issueNumber !== lastSavedIssue) {
            // 1. डेटाबेस में नया रिकॉर्ड सेव करें
            for (let item of apiList) {
                const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'game_history', item.issueNumber);
                await setDoc(docRef, {
                    issueNumber: item.issueNumber,
                    number: item.number,
                    size: parseInt(item.number) >= 5 ? "BIG" : "SMALL",
                    timestamp: Date.now()
                }, { merge: true });
            }

            // 2. पिछला रिजल्ट चैनल में भेजें
            if (currentPrediction && currentPrediction.pick !== "SKIP" && currentPrediction.issue === latest.issueNumber) {
                const actualSize = parseInt(latest.number) >= 5 ? "BIG" : "SMALL";
                const isWin = currentPrediction.pick === actualSize;
                const resText = `📊 *RESULT: #${latest.issueNumber.slice(-4)}*\n━━━━━━━━━━━━━━━━━━\n🔢 Num: \`${latest.number}\`\n🎯 Res: *${actualSize}*\n🏆 Status: ${isWin ? "✅ WIN" : "❌ LOSS"}\n━━━━━━━━━━━━━━━━━━`;
                await bot.telegram.sendMessage(CHANNEL_ID, resText, { parse_mode: 'Markdown' }).catch(e => {});
            }

            // 3. नया सिग्नल
            lastSavedIssue = latest.issueNumber;
            const currentSeq = apiList.slice(0, 15).map(h => parseInt(h.number));
            const ai = await analyzeBigData(currentSeq);
            const nextIssue = (BigInt(latest.issueNumber) + 1n).toString();
            currentPrediction = { issue: nextIssue, pick: ai.pred };

            let signalText = ai.pred === "SKIP" 
                ? `⚠️ *AUTO SKIP*\n━━━━━━━━━━━━━━━━━━\n🆔 Period: \`#${nextIssue.slice(-4)}\`\n🎯 Signal: *WAIT*\n📊 Reason: \`${ai.lvl}\`\n━━━━━━━━━━━━━━━━━━`
                : `🚀 *ULTRA DB SIGNAL*\n━━━━━━━━━━━━━━━━━━\n🆔 Period: \`#${nextIssue.slice(-4)}\`\n🎯 Prediction: *${ai.pred}*\n📊 Match Level: \`${ai.lvl}\`\n━━━━━━━━━━━━━━━━━━`;

            await bot.telegram.sendMessage(CHANNEL_ID, signalText, { parse_mode: 'Markdown' }).catch(e => {});
        }
    } catch (e) { console.log("Updating Cloud Memory..."); }
}

const app = express();
app.get('/', (req, res) => res.send('Super DB Bot Active!'));
app.listen(process.env.PORT || 3000);

bot.telegram.sendMessage(CHANNEL_ID, "🛡️ *Super DB Bot v16.9 is Online!*\n_Data is being synced with Firebase Cloud._")
    .then(() => console.log("Bot Connected!"))
    .catch((err) => console.log("Admin Check Failed!"));

setInterval(startTracking, 5000);
bot.launch();
