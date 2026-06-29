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
    statusViewDelay: 500,
    autoReplyDelay: 300000,
    aiMode: true,
};

// Stores
const userMessageTimestamps = new Map();
const viewedStatuses = new Set();
const statusQueue = [];
const userLastReply = new Map();

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
                startStatusViewer(sock);
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

                const isGroup = jid.includes("@g.us");

                // Check if it's a status update
                if (jid && jid.includes("status")) {
                    if (!viewedStatuses.has(msg.key.id)) {
                        statusQueue.push({
                            key: msg.key,
                            id: msg.key.id,
                            jid: jid,
                            timestamp: Date.now()
                        });
                    }
                    return;
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

                console.log(`📩 ${isGroup ? 'Group' : 'Private'} ${jid}: ${text}`);

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
                        console.log(`😊 Auto-reacted with ${randomEmoji}`);
                    } catch (e) {}
                }

                // Commands
                if (text.startsWith(".")) {
                    const command = text.slice(1).split(" ")[0].toLowerCase();
                    const args = text.slice(1 + command.length).trim().split(" ");

                    console.log(`⚡ Command: ${command}`);

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
║ .autoreact - Toggle   ║
║ .ai       - AI mode   ║
║                       ║
║ ⚡ *Features:*       ║
║ • Auto-status view   ║
║ • Auto-reactions     ║
║ • Anti-spam          ║
║ • Anti-ban           ║
║ • Welcome messages   ║
║ • AI Auto-reply      ║
║                       ║
║ Made with ❤️          ║
╚══════════════════════╝`
                                });
                                console.log(`✅ Menu sent`);
                                break;

                            case "ping":
                                await sock.sendMessage(jid, {
                                    text: "🏓 Pong! Bot is online ✅"
                                });
                                break;

                            case "owner":
                                await sock.sendMessage(jid, {
                                    text: "👤 *Bot Owner*\n\nName: Veldrix\nStatus: Online\nRole: Developer"
                                });
                                break;

                            case "status":
                                const uptime = process.uptime();
                                const days = Math.floor(uptime / 86400);
                                const hours = Math.floor((uptime % 86400) / 3600);
                                const mins = Math.floor((uptime % 3600) / 60);
                                const secs = Math.floor(uptime % 60);
                                let uptimeStr = [];
                                if (days > 0) uptimeStr.push(`${days}d`);
                                if (hours > 0) uptimeStr.push(`${hours}h`);
                                if (mins > 0) uptimeStr.push(`${mins}m`);
                                uptimeStr.push(`${secs}s`);
                                
                                await sock.sendMessage(jid, {
                                    text: `📊 *Bot Status*\n\n🟢 Online: Yes\n⏱️ Uptime: ${uptimeStr.join(" ")}\n📱 Connected: ${moment().format("HH:mm:ss")}\n⚙️ Auto-react: ${CONFIG.autoReactChance * 100}%\n🛡️ Anti-spam: Active\n👁️ Status viewed: ${viewedStatuses.size}\n🤖 AI Mode: ${CONFIG.aiMode ? 'ON' : 'OFF'}`
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
                                            text: `✅ Auto-reaction set to ${CONFIG.autoReactChance * 100}%`
                                        });
                                    } else {
                                        await sock.sendMessage(jid, {
                                            text: `❌ Use number 0-100\nExample: .react 50`
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
                                    text: `📖 *COMMAND HELP*\n\n🔹 *Basic:*\n.menu - Show menu\n.ping - Check bot\n.owner - Bot owner\n.info - Bot info\n.help - Help\n\n🔹 *Advanced:*\n.status - Bot stats\n.welcome - Toggle welcome\n.react - Set reaction\n.autoreact - Toggle\n.ai - Toggle AI\n\n✨ *Auto Features:*\n✓ Auto status view\n✓ Auto reactions\n✓ Anti-spam\n✓ Auto-reconnect\n✓ Welcome messages\n✓ AI Auto-reply`
                                });
                                break;

                            case "info":
                                await sock.sendMessage(jid, {
                                    text: `🤖 *Bot Information*\n\nVersion: 2.0.0\nFramework: Baileys\nFeatures:\n• Auto-status view 👁️\n• Auto-reactions 🎭\n• Anti-spam 🛡️\n• Anti-ban ⚡\n• Welcome messages 🎉\n• AI Auto-reply 🤖`
                                });
                                break;

                            case "autoreact":
                                CONFIG.autoReactChance = CONFIG.autoReactChance > 0 ? 0 : 0.3;
                                await sock.sendMessage(jid, {
                                    text: `✅ Auto-reaction ${CONFIG.autoReactChance > 0 ? "enabled" : "disabled"}`
                                });
                                break;

                            case "ai":
                                CONFIG.aiMode = !CONFIG.aiMode;
                                await sock.sendMessage(jid, {
                                    text: `🤖 AI Mode ${CONFIG.aiMode ? "enabled" : "disabled"}\n${CONFIG.aiMode ? "I will respond to private messages!" : "I will only respond to commands."}`
                                });
                                break;
                        }
                    } catch (cmdError) {
                        console.log(`❌ Command error: ${cmdError.message}`);
                    }
                    return;
                }

                // AI AUTO-REPLY for private chats only
                if (!isGroup && CONFIG.aiMode) {
                    const lastReply = userLastReply.get(jid) || 0;
                    const now = Date.now();
                    
                    if (now - lastReply >= CONFIG.autoReplyDelay) {
                        const response = generateAIResponse(text);
                        
                        await sock.sendPresenceUpdate("composing", jid);
                        await delay(1500);
                        
                        await sock.sendMessage(jid, {
                            text: response
                        });
                        
                        userLastReply.set(jid, now);
                        console.log(`🤖 AI replied to ${jid}`);
                    }
                }

            } catch (err) {
                console.log(`❌ Error: ${err.message}`);
            }
        });

        // Group welcome
        sock.ev.on("group-participants.update", async (update) => {
            if (!CONFIG.welcomeGroup) return;

            const { id, participants, action } = update;
            
            if (action === "add") {
                for (const participant of participants) {
                    try {
                        const welcomeMessage = `🎉 *Welcome!* 🎉\n\n👋 Hello @${participant.split('@')[0]}!\n✨ Happy to have you here!`;
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

// Status viewer
async function startStatusViewer(sock) {
    console.log("👁️ Status viewer started!");
    
    setInterval(async () => {
        if (statusQueue.length === 0) return;
        
        const status = statusQueue.shift();
        try {
            await sock.readMessages([status.key]);
            viewedStatuses.add(status.id);
            
            const randomEmoji = CONFIG.autoReactEmojis[Math.floor(Math.random() * CONFIG.autoReactEmojis.length)];
            await sock.sendMessage(status.jid, {
                react: {
                    text: randomEmoji,
                    key: status.key
                }
            });
            
            console.log(`👁️ Viewed status with ${randomEmoji}`);
        } catch (e) {}
    }, CONFIG.statusViewDelay);
}

// AI Response Generator
function generateAIResponse(text) {
    const lowerText = text.toLowerCase();
    
    const responses = {
        greetings: ["Hello! How can I help you? 😊", "Hi there! What's on your mind? ✨", "Hey! Nice to hear from you! 👋"],
        farewells: ["Goodbye! Have a great day! 👋", "See you later! Take care! 😊"],
        thanks: ["You're welcome! 😊", "My pleasure! Happy to help! ✨"],
        help: ["I'm here to help! What do you need? 🤖", "Feel free to ask me anything! ✨"],
    };
    
    if (lowerText.match(/\b(hi|hello|hey|good morning)\b/)) {
        return responses.greetings[Math.floor(Math.random() * responses.greetings.length)];
    }
    if (lowerText.match(/\b(bye|goodbye|see you)\b/)) {
        return responses.farewells[Math.floor(Math.random() * responses.farewells.length)];
    }
    if (lowerText.match(/\b(thanks|thank you)\b/)) {
        return responses.thanks[Math.floor(Math.random() * responses.thanks.length)];
    }
    if (lowerText.match(/\b(help|assist)\b/)) {
        return responses.help[Math.floor(Math.random() * responses.help.length)];
    }
    if (lowerText.includes("your name")) {
        return "I'm Veldrix, your WhatsApp assistant! 🤖";
    }
    if (lowerText.includes("how are you")) {
        return "I'm doing great! Thanks for asking! 😊";
    }
    if (lowerText.includes("time")) {
        return `It's ${moment().format("HH:mm:ss")} 📱`;
    }
    if (lowerText.includes("date")) {
        return `Today is ${moment().format("dddd, MMMM Do")} 📅`;
    }
    
    return "That's interesting! Tell me more. 😊";
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

startBot();

process.on("uncaughtException", (err) => {
    console.log("❌ Error:", err.message);
});

process.on("unhandledRejection", (err) => {
    console.log("❌ Error:", err.message);
});
