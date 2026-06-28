const readline = require("readline");
const pino = require("pino");
const fs = require("fs");
const moment = require("moment");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");

// Configuration
const CONFIG = {
    // Anti-ban settings
    messageCooldown: 2000, // 2 seconds between messages
    maxMessagesPerMinute: 30,
    // Auto reactions
    autoReactEmojis: ["❤️", "🔥", "👋", "😊", "✨", "⭐", "💫", "🌟"],
    autoReactChance: 0.3, // 30% chance to auto-react
    // Welcome message settings
    welcomeGroup: true,
    // Status view delay
    statusViewDelay: 1000, // 1 second between status views
};

// Store user message timestamps for anti-spam
const userMessageTimestamps = new Map();
const userMessageCounts = new Map();

// Store recent statuses to avoid duplicate viewing
const viewedStatuses = new Set();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState("./session");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        browser: ["WhatsApp Bot", "Chrome", "1.0.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
    });

    sock.ev.on("creds.update", saveCreds);

    // Handle pairing code generation
    if (!sock.authState.creds.registered) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question("Enter phone number with country code (e.g., 1234567890): ", async (number) => {
            try {
                console.log("⏳ Requesting pairing code...");
                const code = await sock.requestPairingCode(number);
                console.log("\n🔐 PAIRING CODE:");
                console.log(`📱 ${code}`);
                console.log("\n📌 INSTRUCTIONS:");
                console.log("1. Open WhatsApp on your phone");
                console.log("2. Go to Settings > Linked Devices");
                console.log("3. Tap 'Link a Device'");
                console.log("4. Enter the pairing code above\n");
            } catch (err) {
                console.log("❌ Error:", err.message);
            }
            rl.close();
        });
    }

    // Connection handling with auto-reconnect
    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
            console.log("✅ Bot connected successfully!");
            console.log(`📱 Connected at ${moment().format("YYYY-MM-DD HH:mm:ss")}`);
        }

        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("❌ Disconnected. Reconnecting...");
            if (shouldReconnect) {
                setTimeout(() => startBot(), 5000);
            } else {
                console.log("⚠️ Logged out. Please restart bot.");
            }
        }
    });

    // Auto status view feature
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        if (msg.key.fromMe) return;

        // Auto view status updates (view once messages)
        if (msg.message?.viewOnceMessage) {
            try {
                const viewOnceMsg = msg.message.viewOnceMessage.message;
                await sock.sendMessage(msg.key.remoteJid, {
                    reaction: {
                        text: "👀",
                        key: msg.key
                    }
                });
                console.log(`✅ Viewed status from ${msg.key.remoteJid}`);
            } catch (e) {
                console.log("Error viewing status:", e);
            }
        }
    });

    // Auto status view for status updates (stories)
    sock.ev.on("status.update", async (status) => {
        try {
            const statusJid = status.key.remoteJid;
            if (!viewedStatuses.has(statusJid)) {
                await sock.readMessages([status.key]);
                viewedStatuses.add(statusJid);
                console.log(`👁️ Viewed status from ${statusJid}`);
                
                // Auto react to status
                const randomEmoji = CONFIG.autoReactEmojis[Math.floor(Math.random() * CONFIG.autoReactEmojis.length)];
                await sock.sendMessage(statusJid, {
                    reaction: {
                        text: randomEmoji,
                        key: status.key
                    }
                });
            }
        } catch (e) {
            console.log("Error viewing status:", e);
        }
    });

    // Group participant updates (welcome feature)
    sock.ev.on("group-participants.update", async (update) => {
        if (!CONFIG.welcomeGroup) return;

        const { id, participants, action } = update;
        
        if (action === "add") {
            for (const participant of participants) {
                try {
                    const welcomeMessage = `🎉 *Welcome to the group!* 🎉\n\n` +
                        `👋 Hello @${participant.split('@')[0]}!\n` +
                        `✨ We're happy to have you here!\n\n` +
                        `📌 Please read the group rules and enjoy your stay.`;
                    
                    await sock.sendMessage(id, {
                        text: welcomeMessage,
                        mentions: [participant]
                    });
                    
                    console.log(`👋 Welcomed ${participant} to group ${id}`);
                } catch (e) {
                    console.log("Error sending welcome message:", e);
                }
            }
        }
        
        if (action === "remove") {
            for (const participant of participants) {
                const goodbyeMessage = `👋 Goodbye @${participant.split('@')[0]}! We'll miss you! 😢`;
                try {
                    await sock.sendMessage(id, {
                        text: goodbyeMessage,
                        mentions: [participant]
                    });
                } catch (e) {
                    console.log("Error sending goodbye message:", e);
                }
            }
        }
    });

    // Main message handler
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;
        if (msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        const sender = msg.key.participant || jid;

        // Anti-spam check
        if (await checkAntiSpam(sender)) {
            console.log(`⚠️ Spam detected from ${sender}`);
            return;
        }

        // Extract text message
        let text = "";
        if (msg.message.conversation) {
            text = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
            text = msg.message.extendedTextMessage.text;
        } else {
            // Handle other message types
            return;
        }

        // Auto reaction with different emojis
        if (Math.random() < CONFIG.autoReactChance && text) {
            const randomEmoji = CONFIG.autoReactEmojis[Math.floor(Math.random() * CONFIG.autoReactEmojis.length)];
            try {
                await sock.sendMessage(jid, {
                    react: {
                        text: randomEmoji,
                        key: msg.key
                    }
                });
            } catch (e) {
                // Silently fail if reaction fails
            }
        }

        // Send typing indicator
        try {
            await sock.sendPresenceUpdate("composing", jid);
        } catch (e) {
            // Ignore presence errors
        }

        // Command handling
        const prefix = ".";
        if (!text.startsWith(prefix)) return;

        const command = text.slice(prefix.length).split(" ")[0].toLowerCase();
        const args = text.slice(prefix.length + command.length + 1).split(" ");

        try {
            switch (command) {
                case "menu":
                    await sendMenu(sock, jid);
                    break;

                case "ping":
                    await sock.sendMessage(jid, {
                        text: "🏓 Pong! Bot is online ✅"
                    });
                    break;

                case "owner":
                case "creator":
                    await sock.sendMessage(jid, {
                        text: "👤 *Bot Owner*\n\n" +
                              "Name: Veldrix\n" +
                              "Status: Currently offline\n" +
                              "Wait for response... ⏳"
                    });
                    break;

                case "status":
                    const uptime = process.uptime();
                    const uptimeStr = formatUptime(uptime);
                    await sock.sendMessage(jid, {
                        text: `📊 *Bot Status*\n\n` +
                              `🟢 Online: Yes\n` +
                              `⏱️ Uptime: ${uptimeStr}\n` +
                              `📱 Connected: ${moment().format("YYYY-MM-DD HH:mm:ss")}\n` +
                              `⚙️ Auto-react: ${CONFIG.autoReactChance * 100}%\n` +
                              `🛡️ Anti-spam: Active`
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
                            text: `📊 Current auto-reaction chance: ${CONFIG.autoReactChance * 100}%\n` +
                                  `Use: .react 50 (for 50% chance)`
                        });
                    }
                    break;

                case "help":
                    await sendHelp(sock, jid);
                    break;

                case "info":
                    await sock.sendMessage(jid, {
                        text: `🤖 *Bot Information*\n\n` +
                              `Version: 1.0.0\n` +
                              `Framework: Baileys\n` +
                              `Features:\n` +
                              `• Auto-status view 👁️\n` +
                              `• Auto-reactions 🎭\n` +
                              `• Anti-spam 🛡️\n` +
                              `• Anti-ban ⚡\n` +
                              `• Welcome messages 🎉\n` +
                              `• Multiple commands 📝`
                    });
                    break;

                default:
                    // Ignore unknown commands
                    break;
            }
        } catch (e) {
            console.log("Error handling command:", e);
        }
    });
}

// Helper function: Anti-spam check
async function checkAntiSpam(sender) {
    const now = Date.now();
    const userTimestamps = userMessageTimestamps.get(sender) || [];
    const recentMessages = userTimestamps.filter(t => now - t < 60000);
    
    if (recentMessages.length >= CONFIG.maxMessagesPerMinute) {
        return true;
    }
    
    // Check cooldown between messages
    if (userTimestamps.length > 0) {
        const lastMessage = userTimestamps[userTimestamps.length - 1];
        if (now - lastMessage < CONFIG.messageCooldown) {
            return true;
        }
    }
    
    recentMessages.push(now);
    userMessageTimestamps.set(sender, recentMessages);
    return false;
}

// Helper function: Format uptime
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    let result = [];
    if (days > 0) result.push(`${days}d`);
    if (hours > 0) result.push(`${hours}h`);
    if (minutes > 0) result.push(`${minutes}m`);
    result.push(`${secs}s`);
    
    return result.join(" ");
}

// Helper function: Send menu
async function sendMenu(sock, jid) {
    const menu = `╔══════════════════════╗
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
╚══════════════════════╝`;

    await sock.sendMessage(jid, { text: menu });
}

// Helper function: Send help
async function sendHelp(sock, jid) {
    const help = `📖 *COMMAND HELP*

🔹 *Basic Commands:*
  .menu - Display bot menu
  .ping - Check if bot is online
  .owner - Show bot owner info
  .info - Display bot information
  .help - Show this help menu

🔹 *Advanced Commands:*
  .status - Show bot status and uptime
  .welcome - Toggle welcome messages
  .react [0-100] - Set auto-reaction chance

✨ *Auto Features:*
  ✓ Auto view status updates
  ✓ Auto react to messages
  ✓ Anti-spam protection
  ✓ Auto-reconnect on disconnect

📱 *Need help?*
  Contact: Veldrix (Owner)`;

    await sock.sendMessage(jid, { text: help });
}

// Start the bot
startBot().catch(console.error);

// Error handling for uncaught exceptions
process.on("uncaughtException", (err) => {
    console.log("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
    console.log("Unhandled Rejection:", err);
});
