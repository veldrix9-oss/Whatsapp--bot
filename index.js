const readline = require("readline");
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

let sock, saveCreds;
let isPairing = false,
    isConnected = false,
    offlineMode = false,
    isReconnecting = false;

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
        if (now - this.lastMinuteReset > 60000) { this.messagesPerMinute = 0;
            this.lastMinuteReset = now; }
        if (now - this.lastHourReset > 3600000) { this.messagesPerHour = 0;
            this.lastHourReset = now; }
        if (this.messagesPerMinute >= this.maxPerMinute) { this.lock(30000); return false; }
        if (this.messagesPerHour >= this.maxPerHour) { this.lock(300000); return false; }
        this.messagesPerMinute++;
        this.messagesPerHour++;
        return true;
    },
    lock(d) { this.locked = true;
        this.lockUntil = Date.now() + d;
        setTimeout(() => { this.locked = false; }, d); },
    getStatus() { return { minute: `${this.messagesPerMinute}/${this.maxPerMinute}`, hour: `${this.messagesPerHour}/${this.maxPerHour}`, locked: this.locked }; }
};

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
        if (isPairing) return;
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
                try {
                    await sock.sendMessage(state.creds.me?.id || "status@broadcast", {
                        text: `╔══════════════════════════════════════╗
║         🤖 VELDRIX BOT           ║
╠══════════════════════════════════════╣
║  ✨ CONNECTED SUCCESSFULLY ✨      ║
║  📋 Commands: .menu, .ping, etc. ║
╚══════════════════════════════════════╝`
                    });
                } catch (e) {}
            }
            if (connection === "close") {
                if (isPairing) return;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut && !isReconnecting) {
                    isReconnecting = true;
                    console.log("🔄 Reconnecting in 5s...");
                    isConnected = false;
                    setTimeout(async () => {
                        isReconnecting = false;
                        if (!isPairing) await startBot();
                    }, 5000);
                } else if (statusCode === DisconnectReason.loggedOut) {
                    console.log("❌ Logged out. Delete session folder and restart.");
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
                    await sock.sendMessage(jid, { text: "⏳ Rate limit reached." });
                    return;
                }
                if (offlineMode) {
                    await sock.sendPresenceUpdate("unavailable", jid);
                    await sock.sendMessage(jid, { text: `🔵 Offline Mode: ${autoReply.getReply(text)}` });
                    return;
                }
                const emojis = ["🔥", "❤️", "👋", "😊", "✨", "👍", "💯", "⚡", "🤖"];
                await sock.sendMessage(jid, { react: { text: emojis[Math.floor(Math.random() * emojis.length)], key: msg.key } });
                await sock.sendPresenceUpdate("composing", jid);
                await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

                const lower = text.toLowerCase().trim();
                if (["hi", "hello", "hey", "greetings", "salam", "hola"].includes(lower)) {
                    await sock.sendMessage(jid, { text: GREETINGS[Math.floor(Math.random() * GREETINGS.length)] });
                }

                const cmds = {
                    ".menu": `╔══════════════════════════════════════╗\n║          🤖 VELDRIX BOT           ║\n╠══════════════════════════════════════╣\n║  .menu .ping .owner .status        ║\n║  .groupinfo .tagall .help          ║\n║  .offline .antiban                 ║\n╚══════════════════════════════════════╝`,
                    ".ping": `🏓 PONG! ${Math.round(Date.now() - msg.messageTimestamp * 1000)}ms`,
                    ".owner": `👑 Owner: Veldrix`,
                    ".status": `📊 Uptime: ${Math.floor(process.uptime()/3600)}h ${Math.floor((process.uptime()%3600)/60)}m\n🛡️ Anti-Ban: Active\n📴 Offline: ${offlineMode?'ON':'OFF'}`,
                    ".groupinfo": "Use in group only.",
                    ".tagall": "Use in group only.",
                    ".help": `Available: .menu .ping .owner .status .groupinfo .tagall .offline .antiban`,
                    ".offline": `📴 Offline mode ${(offlineMode=!offlineMode)?'ENABLED':'DISABLED'}`,
                    ".antiban": `🛡️ Anti-Ban: ${antiBan.getStatus().minute} (min), ${antiBan.getStatus().hour} (hour)`
                };
                if (cmds[text]) {
                    await sock.sendMessage(jid, { text: cmds[text] });
                }
                // Group-specific commands
                if (text === ".groupinfo" && jid.endsWith("@g.us")) {
                    const meta = await sock.groupMetadata(jid);
                    await sock.sendMessage(jid, { text: `📌 ${meta.subject}\n👥 ${meta.participants.length} members` });
                }
                if (text === ".tagall" && jid.endsWith("@g.us")) {
                    const meta = await sock.groupMetadata(jid);
                    const mentions = meta.participants.map(p => p.id).slice(0, 15);
                    let t = "📢 TAG ALL\n\n";
                    for (let m of mentions) t += `@${m.split("@")[0]}\n`;
                    await sock.sendMessage(jid, { text: t, mentions });
                }
            } catch (e) { console.log("Msg error:", e); }
        });

        if (state.creds.registered) {
            console.log("✅ Session found – waiting for connection...");
        } else if (!isPairing) {
            console.log("⏳ Waiting for WebSocket connection (max 15s)...");
            let opened = false;
            const handler = (u) => { if (u.connection === "open") { sock.ev.off("connection.update", handler);
                    opened = true; } };
            sock.ev.on("connection.update", handler);
            await new Promise(resolve => setTimeout(resolve, 15000));
            sock.ev.off("connection.update", handler);
            if (opened) console.log("✅ Connection open. Starting pairing...");
            else console.log("⚠️ Connection not open, attempting pairing anyway...");
            startPairing();
        }
    } catch (error) {
        console.log("❌ Start error:", error.message);
        setTimeout(startBot, 5000);
    }
}

function startPairing() {
    if (isPairing) return;
    isPairing = true;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("\n╔══════════════════════════════════════╗");
    console.log("║         🔑 PAIRING SETUP            ║");
    console.log("║  Format: 255xxxxxxxxx               ║");
    console.log("╚══════════════════════════════════════╝\n");
    rl.question("📱 Phone number (without +): ", async (number) => {
        try {
            number = number.replace(/[^0-9]/g, '');
            if (!number || number.length < 9) { console.log("❌ Invalid number.");
                isPairing = false;
                rl.close();
                setTimeout(startPairing, 2000); return; }
            if (!number.startsWith("255") && number.length === 9) number = "255" + number;
            console.log(`⏳ Requesting pairing code for ${number}...`);
            if (!sock || !isConnected) {
                console.log("❌ Socket not connected. Retrying...");
                isPairing = false;
                rl.close();
                setTimeout(() => { if (!isConnected) startBot();
                    else startPairing(); }, 3000);
                return;
            }
            const code = await sock.requestPairingCode(number);
            console.log("\n╔══════════════════════════════════════╗");
            console.log("║         🔑 PAIRING CODE              ║");
            console.log(`║  📱 ${number}                    ║`);
            console.log(`║  🔑 Code: ${code}                    ║`);
            console.log("╠══════════════════════════════════════╣");
            console.log("║  Enter this code on WhatsApp:       ║");
            console.log(`║  Settings → Linked Devices →        ║`);
            console.log(`║  Link with phone number → ${code}   ║`);
            console.log("╚══════════════════════════════════════╝\n");
            isPairing = false;
            rl.close();
        } catch (err) {
            console.error("❌ Pairing failed:", err.message);
            isPairing = false;
            rl.close();
            setTimeout(() => { if (!isConnected) startBot();
                else startPairing(); }, 5000);
        }
    });
}

console.log("╔══════════════════════════════════════╗");
console.log("║        🤖 VELDRIX BOT              ║");
console.log("║  WhatsApp bot with pairing code     ║");
console.log("╚══════════════════════════════════════╝\n");
console.log("🚀 Starting...\n");
startBot();
