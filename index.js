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

// ----- Auto‑greetings -----
const GREETINGS = [
    "Hello! 👋 Welcome to the bot.",
    "Hi there! 😊 How can I help you?",
    "Hey! 👋 Glad to see you.",
    "Welcome! ✨ Happy to have you here.",
    "Salam! 🌟 Good to see you."
];

// ----- Anti-Ban System -----
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

// ----- Auto-Reply System -----
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
                
                // Send welcome (to yourself or status)
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

        // ------ Message handler (same as before) ------
        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const jid = msg.key.remoteJid;
            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                "";

            console.log(`📨 ${text}`);

            try {
                if (!antiBan.canSend()) {
                    await sock.sendMessage(jid, { text: "⏳ Rate limit reached. Please wait." });
                    return;
                }

                if (offlineMode) {
                    await sock.sendPresenceUpdate("unavailable", jid);
                    await sock.sendMessage(jid, { text: `🔵 Offline Mode: ${autoReply.getReply(text)}` });
                    return;
                }

                // Auto‑react
                const emojis = ["🔥", "❤️", "👋", "😊", "✨", "👍", "💯", "⚡", "🤖"];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                await sock.sendMessage(jid, {
                    react: { text: randomEmoji, key: msg.key }
                });

                await sock.sendPresenceUpdate("composing", jid);
                await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

                const lower = text.toLowerCase().trim();
                const isGreeting = lower === "hi" || lower === "hello" || lower === "hey" || lower === "greetings" || lower === "salam" || lower === "hola";
                if (isGreeting) {
                    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
                    await sock.sendMessage(jid, { text: greeting });
                }

                // Commands (same as before)
                if (text === ".menu" || text === "/menu") {
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║          🤖 VELDRIX BOT           ║
╠══════════════════════════════════════╣
║                                    ║
║  ✨ AVAILABLE COMMANDS ✨          ║
║                                    ║
║  🟢 .menu     - Show menu         ║
║  🟢 .ping     - Test bot          ║
║  🟢 .owner    - Bot owner         ║
║  🟢 .status   - Bot status        ║
║  🟢 .groupinfo- Group info        ║
║  🟢 .tagall   - Tag members       ║
║  🟢 .help     - Help menu         ║
║  🟢 .offline  - Toggle offline    ║
║  🟢 .antiban  - Anti-ban status   ║
║                                    ║
║  🛡️ Anti-Ban: Active              ║
║  🌐 Type: Public Bot              ║
║  🤖 AI: Enabled                   ║
║                                    ║
╚══════════════════════════════════════╝`
                    });
                }
                if (text === ".ping" || text === "/ping") {
                    const p = Math.round(Date.now() - msg.messageTimestamp * 1000);
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║           🏓 PONG!                ║
╠══════════════════════════════════════╣
║  ⏱️ Response: ${p}ms                 ║
║  📱 Status: Online                ║
║  🛡️ Anti-Ban: Active              ║
╚══════════════════════════════════════╝`
                    });
                }
                if (text === ".owner" || text === "/owner") {
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║           👑 BOT OWNER             ║
╠══════════════════════════════════════╣
║  👤 Name: Veldrix                 ║
║  🛡️ Anti-Ban: Active              ║
║  ✅ Status: Online                ║
║  🌐 Type: Public Bot              ║
╚══════════════════════════════════════╝`
                    });
                }
                if (text === ".status" || text === "/status") {
                    const uptime = process.uptime();
                    const h = Math.floor(uptime / 3600);
                    const m = Math.floor((uptime % 3600) / 60);
                    const ab = antiBan.getStatus();
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║           📊 BOT STATUS            ║
╠══════════════════════════════════════╣
║  📱 Connected: Yes                 ║
║  ⏱️ Uptime: ${h}h ${m}m                 ║
║  📴 Offline Mode: ${offlineMode ? 'ON' : 'OFF'}   ║
║  🛡️ Anti-Ban: Active              ║
║  📊 Rate: ${ab.minute} (min)          ║
║  📊 Rate: ${ab.hour} (hour)           ║
║  🔒 Locked: ${ab.locked ? 'Yes' : 'No'}    ║
╚══════════════════════════════════════╝`
                    });
                }
                if (text === ".groupinfo" || text === "/groupinfo") {
                    if (!jid.endsWith("@g.us")) {
                        await sock.sendMessage(jid, { text: "❌ This command only works in groups!" });
                        return;
                    }
                    const meta = await sock.groupMetadata(jid);
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║           📌 GROUP INFO            ║
╠══════════════════════════════════════╣
║  📛 Name: ${meta.subject}              ║
║  👥 Members: ${meta.participants.length}      ║
║  👑 Admins: ${meta.participants.filter(p => p.admin).length}       ║
╚══════════════════════════════════════╝`
                    });
                }
                if (text === ".tagall" || text === "/tagall") {
                    if (!jid.endsWith("@g.us")) {
                        await sock.sendMessage(jid, { text: "❌ This command only works in groups!" });
                        return;
                    }
                    const meta = await sock.groupMetadata(jid);
                    const mentions = meta.participants.map(p => p.id);
                    if (mentions.length > 30) {
                        await sock.sendMessage(jid, { text: `⚠️ ${mentions.length} members. Max 15.` });
                        return;
                    }
                    let t = "📢 TAG ALL\n\n";
                    const s = mentions.sort(() => Math.random() - 0.5).slice(0, 15);
                    for (let m of s) t += `@${m.split("@")[0]}\n`;
                    await sock.sendMessage(jid, { text: t, mentions: s });
                }
                if (text === ".help" || text === "/help") {
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║           🆘 HELP MENU            ║
╠══════════════════════════════════════╣
║  ✅ .menu     - Show menu         ║
║  ✅ .ping     - Test bot          ║
║  ✅ .owner    - Bot owner         ║
║  ✅ .status   - Bot status        ║
║  ✅ .groupinfo- Group info        ║
║  ✅ .tagall   - Tag members       ║
║  ✅ .help     - This menu         ║
║  ✅ .offline  - Toggle offline    ║
║  ✅ .antiban  - Anti-ban status   ║
╚══════════════════════════════════════╝`
                    });
                }
                if (text === ".offline" || text === "/offline") {
                    offlineMode = !offlineMode;
                    await sock.sendMessage(jid, {
                        text: `📴 Offline mode ${offlineMode ? 'ENABLED' : 'DISABLED'}`
                    });
                }
                if (text === ".antiban" || text === "/antiban") {
                    const ab = antiBan.getStatus();
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║         🛡️ ANTI-BAN STATUS        ║
╠══════════════════════════════════════╣
║  📊 Status: Active                ║
║  📱 Messages/min: ${ab.minute}          ║
║  📱 Messages/hour: ${ab.hour}          ║
║  🔒 Locked: ${ab.locked ? 'Yes' : 'No'}          ║
╚══════════════════════════════════════╝`
                    });
                }

            } catch (e) {
                console.log("Message error:", e);
            }
        });

        // ------ Pairing Check ------
        if (state.creds.registered) {
            console.log("✅ Session found – waiting for connection...");
            console.log("📱 Bot is ready! Send commands on WhatsApp.");
        } else if (!isPairing) {
            // Wait for socket to be ready and then start pairing
            setTimeout(() => {
                if (!state.creds.registered && !isPairing && sock) {
                    startPairing();
                }
            }, 3000);
        }

    } catch (error) {
        console.log("❌ Start error:", error.message);
        setTimeout(startBot, 5000);
    }
}

// ------ Improved Pairing Function ------
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
            // Remove non‑digits
            number = number.replace(/[^0-9]/g, '');
            
            // Ensure country code (default to 255 for Tanzania, but you can change)
            if (number.length === 9) {
                number = "255" + number; // assuming Tanzanian
            } else if (number.length === 10 && number.startsWith("0")) {
                number = "255" + number.slice(1);
            } else if (!number.startsWith("255") && number.length > 9) {
                // already has country code, keep as is
            }
            
            if (!number || number.length < 9) {
                console.log("❌ Invalid number! Please include country code (e.g., 255...).");
                isPairing = false;
                rl.close();
                setTimeout(startPairing, 2000);
                return;
            }
            
            console.log(`⏳ Requesting pairing code for ${number}...`);
            
            // Ensure socket is ready
            if (!sock) {
                console.log("❌ Socket not ready. Retrying...");
                isPairing = false;
                rl.close();
                setTimeout(startPairing, 3000);
                return;
            }
            
            // Wait a bit for socket to be fully initialised
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const code = await sock.requestPairingCode(number);
            
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
            console.log("💡 Retry in 5 seconds...");
            isPairing = false;
            rl.close();
            setTimeout(() => {
                if (!isConnected) {
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
