const readline = require("readline");
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

let sock, saveCreds;
let isPairing = false;
let isConnected = false;
let offlineMode = false;
let isReconnecting = false;
let pairingCode = null;
let pairingResolve = null; // To resolve when code is received

// ----- Auto‑greetings (unchanged) -----
const GREETINGS = [
    "Hello! 👋 Welcome to the bot.",
    "Hi there! 😊 How can I help you?",
    "Hey! 👋 Glad to see you.",
    "Welcome! ✨ Happy to have you here.",
    "Salam! 🌟 Good to see you."
];

// ----- Anti-Ban (unchanged) -----
const antiBan = {
    messagesPerMinute: 0,
    maxPerMinute: 6,
    messagesPerHour: 0,
    maxPerHour: 30,
    lastMinuteReset: Date.now(),
    lastHourReset: Date.now(),
    locked: false,
    lockUntil: 0,
    canSend() {
        const now = Date.now();
        if (this.locked && now < this.lockUntil) return false;
        if (now - this.lastMinuteReset > 60000) { this.messagesPerMinute = 0; this.lastMinuteReset = now; }
        if (now - this.lastHourReset > 3600000) { this.messagesPerHour = 0; this.lastHourReset = now; }
        if (this.messagesPerMinute >= this.maxPerMinute) { this.lock(30000); return false; }
        if (this.messagesPerHour >= this.maxPerHour) { this.lock(300000); return false; }
        this.messagesPerMinute++;
        this.messagesPerHour++;
        return true;
    },
    lock(d) { this.locked = true; this.lockUntil = Date.now() + d; setTimeout(() => { this.locked = false; }, d); },
    getStatus() { return { minute: `${this.messagesPerMinute}/${this.maxPerMinute}`, hour: `${this.messagesPerHour}/${this.maxPerHour}`, locked: this.locked }; }
};

// ----- Auto-Reply (unchanged) -----
const autoReply = {
    responses: [
        "💬 I'm currently offline. Will reply when back!",
        "⏰ Thanks for your message! I'll reply soon.",
        "📱 Hey! I'm busy but will respond ASAP.",
        "💭 Message received! Will reply when available.",
        "🤖 I'm not available right now, but will reply later."
    ],
    getReply(msg) { return this.responses[Math.floor(Math.random() * this.responses.length)]; }
};

// ----- Main bot function -----
async function startBot() {
    try {
        if (isPairing) {
            console.log("⏳ Pairing in progress... ignoring reconnection");
            return;
        }

        const { state, saveCreds: save } = await useMultiFileAuthState("./session");
        saveCreds = save;

        const version = [2, 3000, 1015906];

        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeout: 30000,
            defaultQueryTimeoutMs: 30000
        });

        sock.ev.on("creds.update", saveCreds);

        // ------ Connection handler ------
        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                isConnected = true;
                isReconnecting = false;
                isPairing = false;
                console.log("\n╔══════════════════════════════════════╗");
                console.log("║         ✅ CONNECTED!               ║");
                console.log("║  ✅ WhatsApp Linked Successfully    ║");
                console.log("╚══════════════════════════════════════╝\n");
                console.log("📱 Bot is ready! Send commands on WhatsApp.\n");
                // Send welcome message (optional)
                try {
                    await sock.sendMessage(state.creds.me?.id || "status@broadcast", {
                        text: `╔══════════════════════════════════════╗
║         🤖 VELDRIX BOT           ║
╠══════════════════════════════════════╣
║                                    ║
║  ✨ CONNECTED SUCCESSFULLY ✨      ║
║                                    ║
║  📋 COMMANDS:                     ║
║  ├ .menu   - Show menu           ║
║  ├ .ping   - Test bot            ║
║  ├ .owner  - Bot owner           ║
║  ├ .status - Bot status          ║
║  ├ .groupinfo - Group info       ║
║  ├ .tagall - Tag members         ║
║  ├ .help   - Help menu           ║
║  ├ .offline - Toggle offline mode║
║  └ .antiban - Anti-ban status    ║
║                                    ║
║  🛡️ Anti-Ban: Active              ║
║  🌐 Type: Public Bot              ║
║  🤖 AI: Enabled                   ║
║                                    ║
╚══════════════════════════════════════╝`
                    });
                } catch (e) {}
            }

            if (connection === "close") {
                if (isPairing) {
                    console.log("⏳ Pairing in progress - ignoring disconnect");
                    return;
                }

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect && !isReconnecting) {
                    isReconnecting = true;
                    console.log("🔄 Reconnecting in 5s...");
                    isConnected = false;
                    setTimeout(async () => {
                        isReconnecting = false;
                        if (!isPairing) {
                            await startBot();
                        }
                    }, 5000);
                } else if (statusCode === DisconnectReason.loggedOut) {
                    console.log("❌ Logged out. Delete session folder and restart.");
                }
            }
        });

        // ------ Message handler (same as before, omitted for brevity) ------
        // (Keep your existing message handler – unchanged)
        // ... the entire messages.upsert handler from earlier ...

        // ------ Check if already registered ------
        if (state.creds.registered) {
            console.log("✅ Session found – waiting for connection...");
            console.log("📱 Bot is ready! Send commands on WhatsApp.");
        } else if (!isPairing) {
            // Wait for connection to be open before pairing
            // We'll set up a one-time listener for "open"
            const waitForOpen = () => {
                return new Promise((resolve) => {
                    const handler = (update) => {
                        if (update.connection === "open") {
                            sock.ev.off("connection.update", handler);
                            resolve();
                        }
                    };
                    sock.ev.on("connection.update", handler);
                });
            };

            console.log("⏳ Waiting for WebSocket connection to be ready...");
            await waitForOpen();
            console.log("✅ Connection open. Starting pairing...");
            // Now start pairing
            startPairing();
        }

    } catch (error) {
        console.log("❌ Start error:", error.message);
        setTimeout(startBot, 5000);
    }
}

// ------ Improved Pairing Function (now safe) ------
function startPairing() {
    if (isPairing) return;
    isPairing = true;
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    console.log("\n╔══════════════════════════════════════╗");
    console.log("║         🔑 PAIRING SETUP            ║");
    console.log("╠══════════════════════════════════════╣");
    console.log("║  📱 Enter your phone number         ║");
    console.log("║  Format: 255xxxxxxxxx               ║");
    console.log("║  Example: 255748529340              ║");
    console.log("╚══════════════════════════════════════╝\n");
    
    rl.question("📱 Phone number (without +): ", async (number) => {
        try {
            number = number.replace(/[^0-9]/g, '');
            if (!number || number.length < 9) {
                console.log("❌ Invalid number! Please include country code (e.g., 255...).");
                isPairing = false;
                rl.close();
                setTimeout(startPairing, 2000);
                return;
            }
            console.log(`⏳ Requesting pairing code for ${number}...`);
            
            // Ensure socket is still alive
            if (!sock || !isConnected) {
                console.log("❌ Socket not connected. Retrying...");
                isPairing = false;
                rl.close();
                // Wait for reconnection
                await new Promise(resolve => setTimeout(resolve, 3000));
                if (!isConnected) {
                    console.log("🔄 Reconnecting...");
                    await startBot();
                } else {
                    startPairing();
                }
                return;
            }

            // Request the code
            const code = await sock.requestPairingCode(number);
            pairingCode = code;
            
            console.log("\n╔══════════════════════════════════════╗");
            console.log("║         🔑 PAIRING CODE              ║");
            console.log("╠══════════════════════════════════════╣");
            console.log(`║  📱 ${number}                    ║`);
            console.log(`║  🔑 Code: ${code}                    ║`);
            console.log("╠══════════════════════════════════════╣");
            console.log("║  📱 Open WhatsApp on your phone     ║");
            console.log("║  ➜ Settings → Linked Devices       ║");
            console.log("║  ➜ Link with phone number          ║");
            console.log("║  ➜ Enter the code:  " + code + "    ║");
            console.log("║  ⏰ Expires in 5 minutes            ║");
            console.log("╚══════════════════════════════════════╝\n");
            
            console.log("✅ Pairing code generated successfully!");
            console.log("💡 Enter that code on your WhatsApp app right now.");
            console.log("🔄 The bot will auto‑connect once you complete the process.\n");
            
            isPairing = false;
            rl.close();
            
        } catch (err) {
            console.error("❌ Pairing failed:", err.message);
            if (err.message.includes("Connection Closed") || err.message.includes("socket")) {
                console.log("💡 Connection issue. Retrying in 5 seconds...");
            } else {
                console.log("💡 Retry in 5 seconds...");
            }
            isPairing = false;
            rl.close();
            setTimeout(() => {
                if (!isConnected) {
                    console.log("🔄 Reconnecting...");
                    startBot();
                } else {
                    startPairing();
                }
            }, 5000);
        }
    });
}

// Display initial menu
console.log("╔══════════════════════════════════════╗");
console.log("║        🤖 VELDRIX BOT              ║");
console.log("╠══════════════════════════════════════╣");
console.log("║                                    ║");
console.log("║  ✨ FEATURES ✨                   ║");
console.log("║  ├ WhatsApp Single-User Support   ║");
console.log("║  ├ Pairing Code System            ║");
console.log("║  ├ Auto-Reconnection              ║");
console.log("║  ├ Anti-Ban Protection            ║");
console.log("║  ├ Anti-Spam Protection           ║");
console.log("║  ├ Offline Auto-Reply             ║");
console.log("║  ├ Auto-View Status               ║");
console.log("║  └ Human-like AI Behavior         ║");
console.log("║                                    ║");
console.log("║  🌐 Type: Public Bot              ║");
console.log("║  🛡️ Status: Protected             ║");
console.log("║  🤖 AI: Enabled                   ║");
console.log("║                                    ║");
console.log("╚══════════════════════════════════════╝\n");

console.log("🚀 Starting WhatsApp bot...\n");
startBot();
