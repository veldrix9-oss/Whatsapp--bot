const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

let sock, saveCreds;
let isConnected = false;
let offlineMode = false;
let isPairing = false;

// ========== YOUR PHONE NUMBER ==========
const YOUR_NUMBER = "255748529340";  // <-- YOUR NUMBER HERE

// ========== BOT FEATURES ==========
const GREETINGS = [
    "Hello! 👋 Welcome to the bot.",
    "Hi there! 😊 How can I help you?",
    "Hey! 👋 Glad to see you.",
    "Welcome! ✨ Happy to have you here.",
    "Salam! 🌟 Good to see you."
];

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
        if (now - this.lastMinuteReset > 60000) {
            this.messagesPerMinute = 0;
            this.lastMinuteReset = now;
        }
        if (now - this.lastHourReset > 3600000) {
            this.messagesPerHour = 0;
            this.lastHourReset = now;
        }
        if (this.messagesPerMinute >= this.maxPerMinute) {
            this.lock(30000);
            return false;
        }
        if (this.messagesPerHour >= this.maxPerHour) {
            this.lock(300000);
            return false;
        }
        this.messagesPerMinute++;
        this.messagesPerHour++;
        return true;
    },
    lock(d) {
        this.locked = true;
        this.lockUntil = Date.now() + d;
        setTimeout(() => {
            this.locked = false;
        }, d);
    },
    getStatus() {
        return {
            minute: `${this.messagesPerMinute}/${this.maxPerMinute}`,
            hour: `${this.messagesPerHour}/${this.maxPerHour}`,
            locked: this.locked
        };
    }
};

const autoReply = {
    responses: [
        "💬 I'm currently offline. Will reply when back!",
        "⏰ Thanks for your message! I'll reply soon.",
        "📱 Hey! I'm busy but will respond ASAP.",
        "💭 Message received! Will reply when available.",
        "🤖 I'm not available right now, but will reply later."
    ],
    getReply(msg) {
        return this.responses[Math.floor(Math.random() * this.responses.length)];
    }
};

// ========== AUTO-PAIRING ==========
async function autoPair() {
    console.log(`\n⏳ Auto-pairing for ${YOUR_NUMBER}...\n`);
    
    try {
        // Wait for socket to be ready
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const code = await sock.requestPairingCode(YOUR_NUMBER);
        
        console.log("\n╔══════════════════════════════════════╗");
        console.log("║    🔑 YOUR PAIRING CODE             ║");
        console.log("╠══════════════════════════════════════╣");
        console.log(`║  📱 ${YOUR_NUMBER}                    ║`);
        console.log(`║  🔑 Code: ${code}                    ║`);
        console.log("╠══════════════════════════════════════╣");
        console.log("║  📱 Open WhatsApp on your phone     ║");
        console.log("║  ➜ Settings → Linked Devices       ║");
        console.log("║  ➜ Link with phone number          ║");
        console.log(`║  ➜ Enter this code: ${code}         ║`);
        console.log("║  ⏰ Expires in 5 minutes            ║");
        console.log("╚══════════════════════════════════════╝\n");
        
        console.log("✅ Pairing code generated!");
        console.log("💡 Enter the code on WhatsApp now.\n");
        
        isPairing = false;
        
    } catch (err) {
        console.error("❌ Pairing error:", err.message);
        if (err.message.includes("Connection Closed")) {
            console.log("🔄 Connection issue. Retrying in 3s...");
            isPairing = false;
            setTimeout(startBot, 3000);
        } else {
            console.log("💡 QR code will appear as fallback.");
            isPairing = false;
        }
    }
}

// ========== BOT START ==========
async function startBot() {
    try {
        console.log("🚀 Starting WhatsApp bot...");

        const { state, saveCreds: save } = await useMultiFileAuthState("./session");
        saveCreds = save;

        sock = makeWASocket({
            version: [2, 3000, 1015906],
            auth: state,
            logger: pino({ level: "silent" }),
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeout: 30000,
            defaultQueryTimeoutMs: 30000
        });

        sock.ev.on("creds.update", saveCreds);

        // ========== CONNECTION HANDLER ==========
        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !state.creds.registered) {
                console.log("\n📱 QR Code fallback (if pairing fails)");
                console.log(qr);
            }

            if (connection === "open") {
                isConnected = true;
                isPairing = false;
                console.log("\n╔══════════════════════════════════════╗");
                console.log("║         ✅ CONNECTED!               ║");
                console.log("║  ✅ WhatsApp Linked Successfully    ║");
                console.log("║  🔗 Method: Auto-Pairing           ║");
                console.log("╚══════════════════════════════════════╝\n");
                console.log("📱 Bot is ready! Send commands on WhatsApp.\n");

                try {
                    await sock.sendMessage(state.creds.me?.id || "status@broadcast", {
                        text: `╔══════════════════════════════════════╗
║         🤖 VELDRIX BOT           ║
╠══════════════════════════════════════╣
║  ✨ CONNECTED SUCCESSFULLY ✨      ║
║  📋 Commands: .menu, .ping, etc. ║
║  🛡️ Anti-Ban: Active             ║
║  🔗 Method: Auto-Pairing         ║
╚══════════════════════════════════════╝`
                    });
                } catch (e) {}
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log("❌ Logged out. Delete session folder and restart.");
                } else if (!isPairing) {
                    console.log("🔄 Disconnected. Reconnecting in 5s...");
                    isConnected = false;
                    setTimeout(() => {
                        startBot();
                    }, 5000);
                }
            }
        });

        // ========== MESSAGE HANDLER ==========
        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const jid = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

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

                const emojis = ["🔥", "❤️", "👋", "😊", "✨", "👍", "💯", "⚡", "🤖"];
                await sock.sendMessage(jid, {
                    react: { text: emojis[Math.floor(Math.random() * emojis.length)], key: msg.key }
                });

                await sock.sendPresenceUpdate("composing", jid);
                await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

                const lower = text.toLowerCase().trim();
                const greetings = ["hi", "hello", "hey", "greetings", "salam", "hola"];
                if (greetings.includes(lower)) {
                    await sock.sendMessage(jid, {
                        text: GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
                    });
                }

                // ========== COMMANDS ==========
                if (text === ".menu" || text === "/menu") {
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║          🤖 VELDRIX BOT           ║
╠══════════════════════════════════════╣
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
║  🔗 Method: Auto-Pairing          ║
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
║  🔗 Method: Auto-Pairing          ║
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
║  🔗 Method: Auto-Pairing          ║
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

        // ========== AUTO-PAIRING LOGIC ==========
        if (state.creds.registered) {
            console.log("✅ Session found. Waiting for connection...");
        } else if (!isPairing) {
            isPairing = true;
            console.log("\n⏳ Auto-pairing in 3 seconds...");
            
            setTimeout(async () => {
                await autoPair();
            }, 3000);
        }

    } catch (error) {
        console.log("❌ Start error:", error.message);
        setTimeout(startBot, 5000);
    }
}

// ========== START ==========
console.log("╔══════════════════════════════════════╗");
console.log("║        🤖 VELDRIX BOT              ║");
console.log("║  Auto-Pairing WhatsApp Bot          ║");
console.log("║  📱 Number: 255748529340           ║");
console.log("╚══════════════════════════════════════╝\n");
console.log("🚀 Starting with auto-pairing...\n");

startBot();
