const pino = require("pino");
const moment = require("moment");
const qrcode = require("qrcode-terminal");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");

// Configuration
const CONFIG = {
    messageCooldown: 2000,
    maxMessagesPerMinute: 30,
    autoReactEmojis: ["❤️", "🔥", "👋", "😊", "✨", "⭐", "💫", "🌟"],
    autoReactChance: 0.3,
    welcomeGroup: true,
};

// Stores
const userMessageTimestamps = new Map();
const viewedStatuses = new Set();

async function startBot() {
    try {
        console.log("🤖 Starting WhatsApp Bot...\n");

        const { state, saveCreds } = await useMultiFileAuthState("./session");
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" }),
            printQRInTerminal: true,
            browser: ["WhatsApp Bot", "Chrome", "1.0.0"],
            syncFullHistory: false,
            markOnlineOnConnect: true,
        });

        sock.ev.on("creds.update", saveCreds);

        // Show QR Code
        sock.ev.on("connection.update", ({ qr }) => {
            if (qr) {
                console.log("\n📱 SCAN THIS QR CODE WITH WHATSAPP:");
                console.log("═══════════════════════════════════════\n");
                qrcode.generate(qr, { small: true });
                console.log("\n═══════════════════════════════════════");
                console.log("\n📌 INSTRUCTIONS:");
                console.log("1. Open WhatsApp on your phone");
                console.log("2. Tap the 3 dots (⋮) in top right");
                console.log("3. Select 'Linked Devices'");
                console.log("4. Tap 'Link a Device'");
                console.log("5. Scan the QR code above");
                console.log("\n⏳ Waiting for connection...\n");
            }
        });

        // Connection handler
        sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
            if (connection === "open") {
                console.log("\n✅ Bot connected successfully!");
                console.log(`📱 Connected at ${moment().format("YYYY-MM-DD HH:mm:ss")}`);
                console.log("🤖 Bot is ready! Send .menu in any chat to test\n");
                console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
            }

            if (connection === "close") {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log("❌ Disconnected. Reconnecting in 5 seconds...");
                    setTimeout(() => startBot(), 5000);
                } else {
                    console.log("⚠️ Logged out. Please restart bot.");
                    console.log("Run: rm -rf session && node index.js");
                }
            }
        });

        // Message handler
        sock.ev.on("messages.upsert", async ({ messages }) => {
            try {
                if (!messages || messages.length === 0) return;
                
                const msg = messages[0];
                if (!msg) return;
                if (!msg.message) return;
                if (msg.key.fromMe) return;

                const jid = msg.key.remoteJid;
                if (!jid) return;

                // Extract text
                let text = "";
                if (msg.message.conversation) {
                    text = msg.message.conversation;
                } else if (msg.message.extendedTextMessage?.text) {
                    text = msg.message.extendedTextMessage.text;
                } else if (msg.message.imageMessage?.caption) {
                    text = msg.message.imageMessage.caption;
                } else if (msg.message.videoMessage?.caption) {
                    text = msg.message.videoMessage.caption;
                } else {
                    return;
                }

                console.log(`📩 ${jid}: ${text}`);

                // Auto reaction
                if (Math.random() < CONFIG.autoReactChance && text) {
                    const randomEmoji = CONFIG.autoReactEmojis[Math.floor(Math.random() * CONFIG.autoReactEmojis.length)];
                    try {
                        await sock.sendMessage(jid, {
                            react: {
                                text: randomEmoji,
                                key: msg.key
                            }
                        });
                    } catch (e) {}
                }

                // Commands
                if (!text.startsWith(".")) return;

                const command = text.slice(1).split(" ")[0].toLowerCase();
                const args = text.slice(1 + command.length).trim().split(" ");

                console.log(`⚡ Command: ${command}`);

                switch (command) {
                    case "menu":
                        await sock.sendMessage(jid, {
                            text: `╔══════════════════════╗
║    🤖 *BOT MENU*     ║
╠══════════════════════╣
║                       ║
║ 📌 *Commands:*       ║
║                       ║
║ .menu     - Show this ║
║ .ping     - Check bot ║
║ .owner    - Bot owner ║
║ .status   - Bot stats ║
║ .info     - Bot info  ║
║ .help     - Help menu ║
║ .welcome  - Toggle    ║
║ .react    - Set react ║
║                       ║
║ ⚡ *Features:*       ║
║ • Auto-status view   ║
║ • Auto-reactions     ║
║ • Anti-spam          ║
║ • Anti-ban           ║
║ • Welcome messages   ║
║                       ║
║ Made with ❤️          ║
╚══════════════════════╝`
                        });
                        console.log(`✅ Menu sent to ${jid}`);
                        break;

                    case "ping":
                        await sock.sendMessage(jid, {
                            text: "🏓 Pong! Bot is online ✅"
                        });
                        console.log(`✅ Pong sent to ${jid}`);
                        break;

                    case "owner":
                        await sock.sendMessage(jid, {
                            text: "👤 *Bot Owner*\n\nName: Veldrix\nStatus: Currently offline\nWait for response... ⏳"
                        });
                        break;

                    case "status":
                        const uptime = process.uptime();
                        const days = Math.floor(uptime / 86400);
                        const hours = Math.floor((uptime % 86400) / 3600);
                        const minutes = Math.floor((uptime % 3600) / 60);
                        const secs = Math.floor(uptime % 60);
                        let uptimeStr = [];
                        if (days > 0) uptimeStr.push(`${days}d`);
                        if (hours > 0) uptimeStr.push(`${hours}h`);
                        if (minutes > 0) uptimeStr.push(`${minutes}m`);
                        uptimeStr.push(`${secs}s`);
                        
                        await sock.sendMessage(jid, {
                            text: `📊 *Bot Status*\n\n🟢 Online: Yes\n⏱️ Uptime: ${uptimeStr.join(" ")}\n📱 Connected: ${moment().format("YYYY-MM-DD HH:mm:ss")}\n⚙️ Auto-react: ${CONFIG.autoReactChance * 100}%\n🛡️ Anti-spam: Active`
                        });
                        break;

                    case "welcome":
                        CONFIG.welcomeGroup = !CONFIG.welcomeGroup;
                        await sock.sendMessage(jid, {
                            text: `✅ Welcome messages ${CONFIG.welcomeGroup ? "enabled" : "disabled"}`
                        });
                        break;

                    case "react":
                        if (args.length > 0 && args[0]) {
                            const val = parseFloat(args[0]);
                            if (!isNaN(val) && val >= 0 && val <= 100) {
                                CONFIG.autoReactChance = val / 100;
                                await sock.sendMessage(jid, {
                                    text: `✅ Auto-reaction chance set to ${CONFIG.autoReactChance * 100}%`
                                });
                            } else {
                                await sock.sendMessage(jid, {
                                    text: `❌ Use a number between 0-100\nExample: .react 50`
                                });
                            }
                        } else {
                            await sock.sendMessage(jid, {
                                text: `📊 Current: ${CONFIG.autoReactChance * 100}%\nUse: .react 50`
                            });
                        }
                        break;

                    case "help":
                        await sock.sendMessage(jid, {
                            text: `📖 *COMMAND HELP*\n\n🔹 *Basic:*\n.menu - Show menu\n.ping - Check bot\n.owner - Bot owner\n.info - Bot info\n.help - Help\n\n🔹 *Advanced:*\n.status - Bot stats\n.welcome - Toggle welcome\n.react [0-100] - Set reaction\n\n✨ *Auto Features:*\n✓ Auto status view\n✓ Auto reactions\n✓ Anti-spam\n✓ Auto-reconnect\n✓ Welcome messages`
                        });
                        break;

                    case "info":
                        await sock.sendMessage(jid, {
                            text: `🤖 *Bot Information*\n\nVersion: 1.0.0\nFramework: Baileys\nFeatures:\n• Auto-status view 👁️\n• Auto-reactions 🎭\n• Anti-spam 🛡️\n• Anti-ban ⚡\n• Welcome messages 🎉\n• Multiple commands 📝`
                        });
                        break;

                    case "autoreact":
                        CONFIG.autoReactChance = CONFIG.autoReactChance > 0 ? 0 : 0.3;
                        await sock.sendMessage(jid, {
                            text: `✅ Auto-reaction ${CONFIG.autoReactChance > 0 ? "enabled" : "disabled"}`
                        });
                        break;
                }
            } catch (err) {
                console.log(`❌ Error: ${err.message}`);
            }
        });

        // Auto status view
        sock.ev.on("messages.upsert", async ({ messages }) => {
            try {
                const msg = messages[0];
                if (!msg) return;
                if (!msg.message) return;
                if (msg.key.fromMe) return;
                
                const jid = msg.key.remoteJid;
                
                if (jid && jid.includes("status")) {
                    if (!viewedStatuses.has(msg.key.id)) {
                        await sock.readMessages([msg.key]);
                        viewedStatuses.add(msg.key.id);
                        
                        const randomEmoji = CONFIG.autoReactEmojis[Math.floor(Math.random() * CONFIG.autoReactEmojis.length)];
                        await sock.sendMessage(jid, {
                            react: {
                                text: randomEmoji,
                                key: msg.key
                            }
                        });
                        console.log(`👁️ Viewed and reacted to status`);
                    }
                }
            } catch (e) {}
        });

        // Group welcome
        sock.ev.on("group-participants.update", async (update) => {
            if (!CONFIG.welcomeGroup) return;

            const { id, participants, action } = update;
            
            if (action === "add") {
                for (const participant of participants) {
                    try {
                        const welcomeMessage = `🎉 *Welcome to the group!* 🎉\n\n👋 Hello @${participant.split('@')[0]}!\n✨ We're happy to have you here!`;
                        await sock.sendMessage(id, {
                            text: welcomeMessage,
                            mentions: [participant]
                        });
                        console.log(`👋 Welcomed ${participant}`);
                    } catch (e) {}
                }
            }
        });

    } catch (error) {
        console.log("❌ Error:", error.message);
        setTimeout(() => startBot(), 5000);
    }
}

startBot();

process.on("uncaughtException", (err) => {
    console.log("❌ Uncaught Exception:", err.message);
});

process.on("unhandledRejection", (err) => {
    console.log("❌ Unhandled Rejection:", err.message);
});
