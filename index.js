const readline = require("readline");
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

        // Handle pairing
        if (!sock.authState.creds.registered) {
            console.log("\n📱 SCAN QR CODE WITH WHATSAPP:");
            console.log("Open WhatsApp > Settings > Linked Devices > Link a Device\n");
            
            // Show QR code
            sock.ev.on("connection.update", ({ qr }) => {
                if (qr) {
                    qrcode.generate(qr, { small: true });
                    console.log("\n📱 OR Enter phone number for pairing code:\n");
                }
            });

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question("Enter phone number (e.g., 1234567890) or press Enter for QR: ", async (number) => {
                if (number && number.trim()) {
                    try {
                        console.log("⏳ Requesting pairing code...");
                        const code = await sock.requestPairingCode(number.trim());
                        console.log("\n🔐 PAIRING CODE:");
                        console.log(`📱 ${code}`);
                        console.log("\n📌 INSTRUCTIONS:");
                        console.log("1. Open WhatsApp on your phone");
                        console.log("2. Go to Settings > Linked Devices");
                        console.log("3. Tap 'Link a Device'");
                        console.log("4. Enter the pairing code above\n");
                    } catch (err) {
                        console.log("❌ Error:", err.message);
                        console.log("Please try QR code method instead.");
                    }
                } else {
                    console.log("📱 Waiting for QR scan...");
                }
                rl.close();
            });
        }

        // Connection handler
        sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
            if (connection === "open") {
                console.log("\n✅ Bot connected successfully!");
                console.log(`📱 Connected at ${moment().format("YYYY-MM-DD HH:mm:ss")}`);
                console.log("🤖 Bot is ready! Use .menu to see commands\n");
            }

            if (connection === "close") {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log("❌ Disconnected. Reconnecting in 5 seconds...");
                    setTimeout(() => startBot(), 5000);
                } else {
                    console.log("⚠️ Logged out. Please restart bot.");
                }
            }
        });

        // Handle messages
        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message) return;
            if (msg.key.fromMe) return;

            const jid = msg.key.remoteJid;
            const sender = msg.key.participant || jid;

            // Anti-spam
            const now = Date.now();
            const userTimestamps = userMessageTimestamps.get(sender) || [];
            const recentMessages = userTimestamps.filter(t => now - t < 60000);
            
            if (recentMessages.length >= CONFIG.maxMessagesPerMinute) {
                return;
            }
            
            if (userTimestamps.length > 0) {
                const lastMessage = userTimestamps[userTimestamps.length - 1];
                if (now - lastMessage < CONFIG.messageCooldown) {
                    return;
                }
            }
            
            recentMessages.push(now);
            userMessageTimestamps.set(sender, recentMessages);

            // Auto view status
            if (msg.message?.viewOnceMessage || msg.message?.viewOnceMessageV2) {
                try {
                    await sock.sendMessage(jid, {
                        react: {
                            text: "👀",
                            key: msg.key
                        }
                    });
                    console.log(`👁️ Viewed status from ${jid}`);
                } catch (e) {}
            }

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

            // Send typing
            try {
                await sock.sendPresenceUpdate("composing", jid);
            } catch (e) {}

            // Commands
            const prefix = ".";
            if (!text.startsWith(prefix)) return;

            const command = text.slice(prefix.length).split(" ")[0].toLowerCase();
            const args = text.slice(prefix.length + command.length + 1).split(" ");

            try {
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
                        console.log(`📱 Menu sent to ${jid}`);
                        break;

                    case "ping":
                        await sock.sendMessage(jid, {
                            text: "🏓 Pong! Bot is online ✅"
                        });
                        break;

                    case "owner":
                    case "creator":
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
                        if (args.length > 0) {
                            CONFIG.autoReactChance = Math.min(1, Math.max(0, parseFloat(args[0]) / 100));
                            await sock.sendMessage(jid, {
                                text: `✅ Auto-reaction chance set to ${CONFIG.autoReactChance * 100}%`
                            });
                        } else {
                            await sock.sendMessage(jid, {
                                text: `📊 Current auto-reaction chance: ${CONFIG.autoReactChance * 100}%\nUse: .react 50 (for 50% chance)`
                            });
                        }
                        break;

                    case "help":
                        await sock.sendMessage(jid, {
                            text: `📖 *COMMAND HELP*\n\n🔹 *Basic Commands:*\n.menu - Display bot menu\n.ping - Check if bot is online\n.owner - Show bot owner info\n.info - Display bot information\n.help - Show this help menu\n\n🔹 *Advanced Commands:*\n.status - Show bot status and uptime\n.welcome - Toggle welcome messages\n.react [0-100] - Set auto-reaction chance\n\n✨ *Auto Features:*\n✓ Auto view status updates\n✓ Auto react to messages\n✓ Anti-spam protection\n✓ Auto-reconnect on disconnect\n\n📱 *Need help?*\nContact: Veldrix (Owner)`
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

                    case "antispam":
                        const newMax = args.length > 0 ? parseInt(args[0]) : CONFIG.maxMessagesPerMinute;
                        if (newMax > 0 && newMax <= 100) {
                            CONFIG.maxMessagesPerMinute = newMax;
                            await sock.sendMessage(jid, {
                                text: `✅ Anti-spam limit set to ${CONFIG.maxMessagesPerMinute} messages per minute`
                            });
                        } else {
                            await sock.sendMessage(jid, {
                                text: `📊 Current anti-spam limit: ${CONFIG.maxMessagesPerMinute} messages/minute\nUse: .antispam 20`
                            });
                        }
                        break;
                }
            } catch (e) {
                console.log("Error:", e.message);
            }
        });

        // Group welcome
        sock.ev.on("group-participants.update", async (update) => {
            if (!CONFIG.welcomeGroup) return;

            const { id, participants, action } = update;
            
            if (action === "add") {
                for (const participant of participants) {
                    try {
                        const welcomeMessage = `🎉 *Welcome to the group!* 🎉\n\n👋 Hello @${participant.split('@')[0]}!\n✨ We're happy to have you here!\n\n📌 Please read the group rules and enjoy your stay.`;
                        await sock.sendMessage(id, {
                            text: welcomeMessage,
                            mentions: [participant]
                        });
                        console.log(`👋 Welcomed ${participant} to group`);
                    } catch (e) {}
                }
            }
            
            if (action === "remove") {
                for (const participant of participants) {
                    try {
                        const goodbyeMessage = `👋 Goodbye @${participant.split('@')[0]}! We'll miss you! 😢`;
                        await sock.sendMessage(id, {
                            text: goodbyeMessage,
                            mentions: [participant]
                        });
                    } catch (e) {}
                }
            }
        });

        // Auto status view
        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message) return;
            if (msg.key.fromMe) return;
            
            const jid = msg.key.remoteJid;
            
            // Check if it's a status update
            if (jid && jid.includes("status")) {
                try {
                    if (!viewedStatuses.has(msg.key.id)) {
                        await sock.readMessages([msg.key]);
                        viewedStatuses.add(msg.key.id);
                        
                        // Auto react to status
                        const randomEmoji = CONFIG.autoReactEmojis[Math.floor(Math.random() * CONFIG.autoReactEmojis.length)];
                        await sock.sendMessage(jid, {
                            react: {
                                text: randomEmoji,
                                key: msg.key
                            }
                        });
                        console.log(`👁️ Viewed and reacted to status`);
                    }
                } catch (e) {}
            }
        });

    } catch (error) {
        console.log("Error starting bot:", error.message);
        setTimeout(() => startBot(), 5000);
    }
}

startBot();

process.on("uncaughtException", (err) => {
    console.log("Uncaught Exception:", err.message);
});

process.on("unhandledRejection", (err) => {
    console.log("Unhandled Rejection:", err.message);
});
