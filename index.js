const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

let sock, saveCreds;
let isConnected = false;
let offlineMode = false;

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

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log("\n╔══════════════════════════════════════╗");
                console.log("║    📱 SCAN THIS QR CODE              ║");
                console.log("║    Open WhatsApp → Linked Devices   ║");
                console.log("║    Scan with your phone             ║");
                console.log("╚══════════════════════════════════════╝\n");
                console.log(qr);
                console.log("\n💡 QR code above – scan it with WhatsApp!\n");
            }

            if (connection === "open") {
                isConnected = true;
                console.log("\n╔══════════════════════════════════════╗");
                console.log("║         ✅ CONNECTED!               ║");
                console.log("║  ✅ WhatsApp Linked Successfully    ║");
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
╚══════════════════════════════════════╝`
                    });
                } catch (e) {
                    // Ignore
                }
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log("❌ Logged out. Delete session folder and restart.");
                } else {
                    console.log("🔄 Disconnected. Reconnecting in 5s...");
                    isConnected = false;
                    setTimeout(() => {
                        startBot();
                    }, 5000);
                }
            }
        });

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
║  🌐 Type: Public Bot              ║
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

        // If no session exists, QR code will be printed automatically
        if (!state.creds.registered) {
            console.log("📱 No session found. QR code will appear below.");
            console.log("📱 Scan it with WhatsApp → Linked Devices");
        } else {
            console.log("✅ Session found. Waiting for connection...");
        }

    } catch (error) {
        console.log("❌ Start error:", error.message);
        setTimeout(startBot, 5000);
    }
}

console.log("╔══════════════════════════════════════╗");
console.log("║        🤖 VELDRIX BOT              ║");
console.log("║  WhatsApp Bot with QR Code & Pairing║");
console.log("╚══════════════════════════════════════╝\n");
console.log("🚀 Starting...\n");

startBot();
