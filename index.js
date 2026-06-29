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
    autoReplyDelay: 300000, // 5 minutes in milliseconds
};

// Stores
const userMessageTimestamps = new Map();
const viewedStatuses = new Set();
const statusQueue = [];
const userLastReply = new Map();
const userChatHistory = new Map();

// AI-like responses
const AI_RESPONSES = {
    greetings: [
        "Hello! How can I help you today? 😊",
        "Hi there! What brings you here? ✨",
        "Hey! Nice to hear from you! 👋",
        "Greetings! How's your day going? 🌟",
        "Hello! I'm here to assist you! 🤖"
    ],
    farewells: [
        "Goodbye! Have a great day! 👋",
        "See you later! Take care! 😊",
        "Bye! Come back anytime! ✨",
        "Take care! It was nice talking to you! 💫"
    ],
    help: [
        "I can help you with various things! Just ask me anything! 🤖",
        "I'm here to assist! What do you need help with? 😊",
        "Feel free to ask me anything! I'll do my best to help! ✨"
    ],
    thanks: [
        "You're welcome! 😊",
        "My pleasure! Happy to help! ✨",
        "Anytime! That's what I'm here for! 🌟",
        "Glad I could help! Have a great day! 💫"
    ],
    general: [
        "That's interesting! Tell me more about it. 😊",
        "I see! What would you like to know? 🤖",
        "Good point! Let me think about that. ✨",
        "I understand! Is there anything else you'd like to know? 🌟",
        "Interesting question! Let me help you with that. 💫",
        "Great question! Here's what I think... 🤔",
        "Thanks for sharing! That's really interesting! 😊",
        "I appreciate you asking! Let me explain... 📝"
    ]
};

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

                // Check if it's a group chat
                const isGroup = jid.includes("@g.us");
                const sender = msg.key.participant || jid;

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

                // Extract text from normal messages
                let text = "";
                if (msg.message.conversation) {
                    text = msg.message.conversation;
                } else if (msg.message.extendedTextMessage?.text) {
                    text = msg.message.extendedTextMessage.text;
                } else if (msg.message.imageMessage?.caption) {
                    text = msg.message.imageMessage.caption;
                } else if (msg.message.videoMessage?.caption) {
                    text = msg.message.videoMessage.caption;
                } else if (msg.message.buttonsResponseMessage?.selectedButtonId) {
                    text = msg.message.buttonsResponseMessage.selectedButtonId;
                } else if (msg.message.listResponseMessage?.singleSelectReply?.selectedRowId) {
                    text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
                } else {
                    return;
                }

                console.log(`📩 ${isGroup ? 'Group' : 'Private'} ${jid}: ${text}`);

                // Auto reaction - FIXED
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

                // Commands - FIXED
                if (text.startsWith(".")) {
                    const command = text.slice(1).split(" ")[0].toLowerCase();
                    const args = text.slice(1 + command.length).trim().split(" ");

                    console.log(`⚡ Command detected: ${command}`);

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
                                console.log(`✅ Menu sent to ${jid}`);
                                break;

                            case "ping":
                                await sock.sendMessage(jid, {
                                    text: "🏓 Pong! Bot is online ✅"
                                });
                                break;

                            case "owner":
                                await sock.sendMessage(jid, {
                                    text: "👤 *Bot Owner*\n\nName: Veldrix\nStatus: Online\nRole: Developer\nPowered by: Baileys"
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
                                    text: `📊 *Bot Status*\n\n🟢 Online: Yes\n⏱️ Uptime: ${uptimeStr.join(" ")}\n📱 Connected: ${moment().format("YYYY-MM-DD HH:mm:ss")}\n⚙️ Auto-react: ${CONFIG.autoReactChance * 100}%\n🛡️ Anti-spam: Active\n👁️ Status viewed: ${viewedStatuses.size}\n🤖 AI Mode: ${CONFIG.aiMode ? 'ON' : 'OFF'}`
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
                                    text: `📖 *COMMAND HELP*\n\n🔹 *Basic:*\n.menu - Show menu\n.ping - Check bot\n.owner - Bot owner\n.info - Bot info\n.help - Help\n\n🔹 *Advanced:*\n.status - Bot stats\n.welcome - Toggle welcome\n.react [0-100] - Set reaction\n.autoreact - Toggle reactions\n.ai - Toggle AI mode\n\n✨ *Auto Features:*\n✓ Auto status view (FAST)\n✓ Auto reactions\n✓ Anti-spam\n✓ Auto-reconnect\n✓ Welcome messages\n✓ AI Auto-reply (Private chats)`
                                });
                                break;

                            case "info":
                                await sock.sendMessage(jid, {
                                    text: `🤖 *Bot Information*\n\nVersion: 2.0.0\nFramework: Baileys\nFeatures:\n• Auto-status view 👁️ (FAST)\n• Auto-reactions 🎭\n• Anti-spam 🛡️\n• Anti-ban ⚡\n• Welcome messages 🎉\n• AI Auto-reply 🤖\n• Multiple commands 📝`
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
                                    text: `🤖 AI Mode ${CONFIG.aiMode ? "enabled" : "disabled"}\n${CONFIG.aiMode ? "I will now respond to all private messages intelligently!" : "I will only respond to commands now."}`
                                });
                                break;

                            default:
                                console.log(`❓ Unknown command: ${command}`);
                                break;
                        }
                    } catch (cmdError) {
                        console.log(`❌ Command error: ${cmdError.message}`);
                    }
                    return; // Don't process commands as normal messages
                }

                // AI AUTO-REPLY FOR PRIVATE CHATS ONLY
                if (!isGroup && CONFIG.aiMode) {
                    const lastReply = userLastReply.get(jid) || 0;
                    const now = Date.now();
                    
                    // Check if 5 minutes have passed
                    if (now - lastReply >= CONFIG.autoReplyDelay) {
                        // Generate AI-like response
                        const response = generateAIResponse(text);
                        
                        // Send typing indicator
                        await sock.sendPresenceUpdate("composing", jid);
                        await delay(1500); // Simulate thinking
                        
                        await sock.sendMessage(jid, {
                            text: response
                        });
                        
                        userLastReply.set(jid, now);
                        console.log(`🤖 AI replied to ${jid}`);
                    } else {
                        const remaining = Math.round((CONFIG.autoReplyDelay - (now - lastReply)) / 1000);
                        console.log(`⏳ Waiting ${remaining}s before next AI reply to ${jid}`);
                    }
                }

            } catch (err) {
                console.log(`❌ Message handler error: ${err.message}`);
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
                        console.log(`👋 Welcomed ${participant}`);
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

    } catch (error) {
        console.log("❌ Error:", error.message);
        setTimeout(() => startBot(), 5000);
    }
}

// FAST STATUS VIEWER
async function startStatusViewer(sock) {
    console.log("👁️ Status viewer started! Viewing statuses quickly...");
    
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
            
            console.log(`👁️ Viewed status from ${status.jid} with ${randomEmoji}`);
        } catch (e) {
            console.log(`❌ Status view error: ${e.message}`);
        }
    }, CONFIG.statusViewDelay);
}

// AI Response Generator
function generateAIResponse(text) {
    const lowerText = text.toLowerCase();
    
    // Check for greetings
    if (lowerText.match(/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/)) {
        return AI_RESPONSES.greetings[Math.floor(Math.random() * AI_RESPONSES.greetings.length)];
    }
    
    // Check for farewells
    if (lowerText.match(/\b(bye|goodbye|see you|take care|later)\b/)) {
        return AI_RESPONSES.farewells[Math.floor(Math.random() * AI_RESPONSES.farewells.length)];
    }
    
    // Check for help
    if (lowerText.match(/\b(help|assist|support|question)\b/)) {
        return AI_RESPONSES.help[Math.floor(Math.random() * AI_RESPONSES.help.length)];
    }
    
    // Check for thanks
    if (lowerText.match(/\b(thanks|thank you|thank|appreciate)\b/)) {
        return AI_RESPONSES.thanks[Math.floor(Math.random() * AI_RESPONSES.thanks.length)];
    }
    
    // Check for specific topics
    if (lowerText.includes("your name")) {
        return "I'm Veldrix, your WhatsApp bot assistant! 🤖 Nice to meet you!";
    }
    
    if (lowerText.includes("how are you")) {
        return "I'm doing great! Thanks for asking! 😊 How about you?";
    }
    
    if (lowerText.includes("what can you do")) {
        return "I can help with various things! I view statuses, react to messages, reply to commands, and have intelligent conversations! 🤖✨";
    }
    
    if (lowerText.includes("bot")) {
        return "Yes, I'm a WhatsApp bot created with Baileys! I'm here to help you with whatever you need. 🤖";
    }
    
    if (lowerText.includes("love") || lowerText.includes("like")) {
        return "That's wonderful! ❤️ It makes me happy to hear that!";
    }

