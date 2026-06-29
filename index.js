const pino = require("pino");
const moment = require("moment");
const qrcode = require("qrcode-terminal");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const CONFIG = {
    messageCooldown: 2000,
    maxMessagesPerMinute: 30,
    autoReactChance: 0.3,
    welcomeGroup: true,
    statusViewDelay: 500,
    autoReplyDelay: 300000,
    aiMode: true,
    botName: "VELDRIX BOT",
    botVersion: "V7.6.0",
    owner: "Veldrix",
    prefix: ".",
    botNumber: "",
    mode: "public",
};

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
        sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
            if (connection === "open") {
                console.log("\n✅ Bot connected successfully!");
                console.log(`📱 Connected at ${moment().format("YYYY-MM-DD HH:mm:ss")}`);
                console.log("🤖 Bot is ready! Send .menu in any chat to test\n");
                console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
                CONFIG.botNumber = sock.user.id.split(":")[0];
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
                if (jid && jid.includes("status")) {
                    if (!viewedStatuses.has(msg.key.id)) {
                        statusQueue.push({ key: msg.key, id: msg.key.id, jid: jid, timestamp: Date.now() });
                    }
                    return;
                }
                let text = "";
                if (msg.message.conversation) text = msg.message.conversation;
                else if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
                else if (msg.message.imageMessage?.caption) text = msg.message.imageMessage.caption;
                else if (msg.message.videoMessage?.caption) text = msg.message.videoMessage.caption;
                else return;
                console.log(`📩 ${isGroup ? 'Group' : 'Private'} ${jid}: ${text}`);
                if (text.startsWith(".")) {
                    const command = text.slice(1).split(" ")[0].toLowerCase();
                    const args = text.slice(1 + command.length).trim().split(" ");
                    console.log(`⚡ Command: ${command}`);
                    try {
                        switch (command) {
                            case "menu": await sendMenu(sock, jid); break;
                            case "ping": await sock.sendMessage(jid, { text: "🏓 Pong! Bot is online ✅" }); break;
                            case "owner": await sock.sendMessage(jid, { text: `👑 *BOT OWNER*\n\nName: ${CONFIG.owner}\nRole: Developer\nStatus: Online 🌟` }); break;
                            case "status": await sendStatus(sock, jid); break;
                            case "welcome": CONFIG.welcomeGroup = !CONFIG.welcomeGroup; await sock.sendMessage(jid, { text: `✅ Welcome ${CONFIG.welcomeGroup ? "enabled" : "disabled"}` }); break;
                            case "react": if (args.length > 0) { const val = parseFloat(args[0]); if (!isNaN(val) && val >= 0 && val <= 100) { CONFIG.autoReactChance = val / 100; await sock.sendMessage(jid, { text: `✅ Reaction set to ${CONFIG.autoReactChance * 100}%` }); } else { await sock.sendMessage(jid, { text: `❌ Use 0-100\nExample: .react 50` }); } } else { await sock.sendMessage(jid, { text: `📊 Current: ${CONFIG.autoReactChance * 100}%\nUse: .react 50` }); } break;
                            case "help": await sendHelp(sock, jid); break;
                            case "info": await sock.sendMessage(jid, { text: `🤖 *BOT INFO*\n\nVersion: ${CONFIG.botVersion}\nFramework: Baileys\nMode: ${CONFIG.mode}\nFeatures:\n• Auto-status 👁️\n• Anti-spam 🛡️\n• Anti-ban ⚡\n• Welcome 🎉\n• AI Reply 🤖` }); break;
                            case "autoreact": CONFIG.autoReactChance = CONFIG.autoReactChance > 0 ? 0 : 0.3; await sock.sendMessage(jid, { text: `✅ Auto-reaction ${CONFIG.autoReactChance > 0 ? "enabled" : "disabled"}` }); break;
                            case "ai": CONFIG.aiMode = !CONFIG.aiMode; await sock.sendMessage(jid, { text: `🤖 AI Mode ${CONFIG.aiMode ? "enabled" : "disabled"}\n${CONFIG.aiMode ? "I will respond to messages!" : "Commands only."}` }); break;
                            case "alive": await sock.sendMessage(jid, { text: `🤖 *${CONFIG.botName}*\n\n✅ Bot is Alive!\n📱 ${moment().format("YYYY-MM-DD HH:mm:ss")}\n⚡ Online\n💖 Made by ${CONFIG.owner}` }); break;
                            case "runtime": const rt = process.uptime(); const d = Math.floor(rt / 86400); const h = Math.floor((rt % 86400) / 3600); const m = Math.floor((rt % 3600) / 60); const s = Math.floor(rt % 60); let rtStr = []; if (d > 0) rtStr.push(`${d}d`); if (h > 0) rtStr.push(`${h}h`); if (m > 0) rtStr.push(`${m}m`); rtStr.push(`${s}s`); await sock.sendMessage(jid, { text: `⏱️ *Runtime*\n\n${rtStr.join(" ")}` }); break;
                            case "repo": await sock.sendMessage(jid, { text: `📦 *Repository*\n\nGitHub: https://github.com/veldrix/whatsapp-bot\n⭐ Star this repo!` }); break;
                            case "public": CONFIG.mode = "public"; await sock.sendMessage(jid, { text: `✅ Bot is now PUBLIC for everyone!` }); break;
                            case "self": CONFIG.mode = "self"; await sock.sendMessage(jid, { text: `✅ Bot is now SELF mode` }); break;
                            case "time": await sock.sendMessage(jid, { text: `⏰ ${moment().format("HH:mm:ss")}` }); break;
                            case "date": await sock.sendMessage(jid, { text: `📅 ${moment().format("dddd, MMMM Do YYYY")}` }); break;
                            case "joke": await sock.sendMessage(jid, { text: getJoke() }); break;
                            case "quote": await sock.sendMessage(jid, { text: getQuote() }); break;
                            case "fact": await sock.sendMessage(jid, { text: getFact() }); break;
                            case "advice": await sock.sendMessage(jid, { text: getAdvice() }); break;
                            case "tagall": if (isGroup) { await tagAll(sock, jid, msg); } else { await sock.sendMessage(jid, { text: "❌ This command only works in groups!" }); } break;
                            case "promote": if (isGroup && args.length > 0) { await promoteUser(sock, jid, args[0]); } break;
                            case "demote": if (isGroup && args.length > 0) { await demoteUser(sock, jid, args[0]); } break;
                            case "kick": if (isGroup && args.length > 0) { await kickUser(sock, jid, args[0]); } break;
                            case "add": if (isGroup && args.length > 0) { await addUser(sock, jid, args[0]); } break;
                            case "leave": if (isGroup) { await sock.groupLeave(jid); await sock.sendMessage(jid, { text: "👋 Left the group!" }); } break;
                            case "groupinfo": if (isGroup) { await getGroupInfo(sock, jid); } break;
                            default: console.log(`❓ Unknown: ${command}`); break;
                        }
                    } catch (e) { console.log(`❌ Command error: ${e.message}`); }
                    return;
                }
                if (CONFIG.aiMode) {
                    const lastReply = userLastReply.get(jid) || 0;
                    const now = Date.now();
                    if (now - lastReply >= CONFIG.autoReplyDelay) {
                        const response = generateAIResponse(text);
                        await sock.sendPresenceUpdate("composing", jid);
                        await delay(1500);
                        await sock.sendMessage(jid, { text: response });
                        userLastReply.set(jid, now);
                        console.log(`🤖 AI replied to ${jid}`);
                    }
                }
            } catch (err) { console.log(`❌ Error: ${err.message}`); }
        });
        sock.ev.on("group-participants.update", async (update) => {
            if (!CONFIG.welcomeGroup) return;
            const { id, participants, action } = update;
            if (action === "add") {
                for (const participant of participants) {
                    try {
                        await sock.sendMessage(id, {
                            text: `🎉 *Welcome!* 🎉\n\n👋 Hello @${participant.split('@')[0]}!\n✨ Happy to have you here!\n\n📌 Please read the group rules.`,
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

async function tagAll(sock, jid, msg) {
    try {
        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants;
        let mentions = [];
        let text = "📢 *TAG ALL*\n\n";
        for (let p of participants) {
            mentions.push(p.id);
            text += `@${p.id.split('@')[0]}\n`;
        }
        await sock.sendMessage(jid, { text: text, mentions: mentions });
        console.log(`✅ Tagged all in ${jid}`);
    } catch (e) { console.log(`❌ Tagall error: ${e.message}`); }
}

async function promoteUser(sock, jid, user) {
    try {
        await sock.groupParticipantsUpdate(jid, [user + "@s.whatsapp.net"], "promote");
        await sock.sendMessage(jid, { text: `✅ Promoted @${user} to admin!`, mentions: [user + "@s.whatsapp.net"] });
    } catch (e) { console.log(`❌ Promote error: ${e.message}`); }
}

async function demoteUser(sock, jid, user) {
    try {
        await sock.groupParticipantsUpdate(jid, [user + "@s.whatsapp.net"], "demote");
        await sock.sendMessage(jid, { text: `✅ Demoted @${user} from admin!`, mentions: [user + "@s.whatsapp.net"] });
    } catch (e) { console.log(`❌ Demote error: ${e.message}`); }
}

async function kickUser(sock, jid, user) {
    try {
        await sock.groupParticipantsUpdate(jid, [user + "@s.whatsapp.net"], "remove");
        await sock.sendMessage(jid, { text: `✅ Removed @${user} from group!`, mentions: [user + "@s.whatsapp.net"] });
    } catch (e) { console.log(`❌ Kick error: ${e.message}`); }
}

async function addUser(sock, jid, user) {
    try {
        await sock.groupParticipantsUpdate(jid, [user + "@s.whatsapp.net"], "add");
        await sock.sendMessage(jid, { text: `✅ Added @${user} to group!`, mentions: [user + "@s.whatsapp.net"] });
    } catch (e) { console.log(`❌ Add error: ${e.message}`); }
}

async function getGroupInfo(sock, jid) {
    try {
        const metadata = await sock.groupMetadata(jid);
        const text = `📊 *GROUP INFO*\n\n📌 Name: ${metadata.subject}\n👤 Owner: @${metadata.owner.split('@')[0]}\n👥 Members: ${metadata.participants.length}\n📅 Created: ${moment(metadata.creation * 1000).format("MM/DD/YYYY")}\n🔗 Link: ${await sock.groupInviteCode(jid) || "N/A"}`;
        await sock.sendMessage(jid, { text: text, mentions: [metadata.owner] });
    } catch (e) { console.log(`❌ Group info error: ${e.message}`); }
}

async function sendMenu(sock, jid) {
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400), h = Math.floor((uptime % 86400) / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
    let u = []; if (d > 0) u.push(`${d}d`); if (h > 0) u.push(`${h}h`); if (m > 0) u.push(`${m}m`); u.push(`${s}s`);
    const menu = `╔══✦ 🌸 *${CONFIG.botName}* 🌸 ✦══╗
║ 🌹 *USER*     : ${jid.split('@')[0]}
║ ⚡ *MODE*     : ${CONFIG.mode} 💖
║ 📡 *PLATFORM* : Linux
║ ⚙️ *PREFIX*   : ${CONFIG.prefix}
║ 👨‍💻 *DEV*      : ${CONFIG.owner}
║ ⏱️ *UPTIME*   : ${u.join(" ")}
║ 🔥 *COMMANDS* : 50+
║ 📅 *DATE*     : ${moment().format("M/D/YYYY, h:mm:ss A")}
╚════════════════════════╝

╭─❒ 「 👑💕 *OWNER* 」 ❒─╮
│ .owner .alive .ping
│ .status .runtime .repo
│ .public .self
╰────────────────╯

╭─❒ 「 🤖💞 *AI* 」 ❒─╮
│ .ai .ask
╰────────────────╯

╭─❒ 「 👥💖 *GROUP* 」 ❒─╮
│ .welcome .tagall .promote
│ .demote .kick .add
│ .leave .groupinfo
╰────────────────╯

╭─❒ 「 ℹ️🌼 *TOOL* 」 ❒─╮
│ .react .autoreact .help
│ .info .time .date
╰────────────────╯

╭─❒ 「 🎮🌺 *FUN* 」 ❒─╮
│ .joke .quote .fact
│ .advice
╰────────────────╯

💕 © By ${CONFIG.owner} 🌸🔥 💕
🤖 Version: ${CONFIG.botVersion}`;
    await sock.sendMessage(jid, { text: menu });
}

async function sendStatus(sock, jid) {
    const uptime = process.uptime();
    const d = Math.floor(uptime / 86400), h = Math.floor((uptime % 86400) / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
    let u = []; if (d > 0) u.push(`${d}d`); if (h > 0) u.push(`${h}h`); if (m > 0) u.push(`${m}m`); u.push(`${s}s`);
    await sock.sendMessage(jid, {
        text: `╔══✦ 🌸 *${CONFIG.botName}* 🌸 ✦══╗
║ 🌹 *USER*     : ${jid.split('@')[0]}
║ ⚡ *MODE*     : ${CONFIG.mode} 💖
║ 📡 *PLATFORM* : Linux
║ ⚙️ *PREFIX*   : ${CONFIG.prefix}
║ 👨‍💻 *DEV*      : ${CONFIG.owner}
║ ⏱️ *UPTIME*   : ${u.join(" ")}
║ 🔥 *COMMANDS* : 50+
║ 📅 *DATE*     : ${moment().format("M/D/YYYY, h:mm:ss A")}
╚════════════════════════╝`
    });
}

async function sendHelp(sock, jid) {
    const help = `╔══✦ 📖 *COMMAND HELP* 📖 ✦══╗

🔹 *BASIC:*
.menu - Full menu
.ping - Check bot
.owner - Owner info
.status - Bot status
.info - Bot info
.help - This help
.alive - Check alive
.runtime - Uptime
.repo - Repository

🔹 *AI:*
.ai - Toggle AI mode

🔹 *GROUP:*
.welcome - Toggle welcome
.tagall - Tag all members
.promote - Make admin
.demote - Remove admin
.kick - Remove member
.add - Add member
.leave - Leave group
.groupinfo - Group info

🔹 *TOOL:*
.react [0-100] - Set reaction
.autoreact - Toggle
.time - Current time
.date - Current date

🔹 *FUN:*
.joke - Get joke
.quote - Get quote
.fact - Get fact
.advice - Get advice

✨ *AUTO:*
✓ Auto-status view
✓ Anti-spam
✓ Auto-reconnect
✓ Welcome messages
✓ AI Auto-reply

💖 *Version:* ${CONFIG.botVersion}
👨‍💻 *Developer:* ${CONFIG.owner}`;
    await sock.sendMessage(jid, { text: help });
}

async function startStatusViewer(sock) {
    console.log("👁️ Status viewer started!");
    setInterval(async () => {
        if (statusQueue.length === 0) return;
        const status = statusQueue.shift();
        try {
            await sock.readMessages([status.key]);
            viewedStatuses.add(status.id);
            console.log(`👁️ Viewed status`);
        } catch (e) {}
    }, CONFIG.statusViewDelay);
}

function generateAIResponse(text) {
    const lower = text.toLowerCase();
    if (lower.match(/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/)) {
        return ["Hello! How can I help you today?", "Hi there! What brings you here?", "Hey! Nice to hear from you!"][Math.floor(Math.random() * 3)];
    }
    if (lower.match(/\b(bye|goodbye|see you|take care)\b/)) {
        return ["Goodbye! Have a great day!", "See you later! Take care!", "Bye! Come back anytime!"][Math.floor(Math.random() * 3)];
    }
    if (lower.match(/\b(thanks|thank you|thank|appreciate)\b/)) {
        return ["You're welcome!", "My pleasure! Happy to help!", "Anytime! That's what I'm here for!"][Math.floor(Math.random() * 3)];
    }
    if (lower.includes("your name")) {
        return `I'm ${CONFIG.owner}'s WhatsApp bot assistant! Nice to meet you!`;
    }
    if (lower.includes("how are you")) {
        return "I'm doing great! Thanks for asking! How about you?";
    }
    if (lower.includes("what can you do")) {
        return "I can help with various things! I view statuses, reply to commands, and have intelligent conversations!";
    }
    if (lower.includes("love") || lower.includes("like")) {
        return "That's wonderful! It makes me happy to hear that!";
    }
    if (lower.includes("time")) {
        return `The current time is ${moment().format("HH:mm:ss")}`;
    }
    if (lower.includes("date")) {
        return `Today is ${moment().format("dddd, MMMM Do YYYY")}`;
    }
    if (lower.includes("weather")) {
        return "I don't have real-time weather data, but I can help you with other things!";
    }
    if (lower.includes("help")) {
        return "I'm here to help! What do you need assistance with?";
    }
    if (lower.includes("who are you")) {
        return `I'm ${CONFIG.botName}, an intelligent WhatsApp bot created by ${CONFIG.owner}!`;
    }
    if (lower.includes("tell me something")) {
        return "Did you know that WhatsApp has over 2 billion users worldwide? That's amazing!";
    }
    if (lower.includes("you are")) {
        return "Thank you! That means a lot to me!";
    }
    const general = [
        "That's interesting! Tell me more about it.",
        "I see! What would you like to know?",
        "Good point! Let me think about that.",
        "I understand! Is there anything else you'd like to know?",
        "Interesting question! Let me help you with that.",
        "Thanks for sharing! That's really interesting!",
        "I appreciate you asking! Let me explain..."
    ];
    return general[Math.floor(Math.random() * general.length)];
}

function getJoke() {
    const jokes = [
        "Why do programmers prefer dark mode? Because light attracts bugs!",
        "What do you call a fake noodle? An impasta!",
        "Why did the scarecrow win an award? Because he was outstanding in his field!",
        "What do you call a bear with no teeth? A gummy bear!",
        "Why don't scientists trust atoms? Because they make up everything!"
    ];
    return
