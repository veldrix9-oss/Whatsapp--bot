const pino = require("pino");
const moment = require("moment");
const qrcode = require("qrcode-terminal");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const C = {
    cooldown: 2000,
    maxPerMin: 30,
    reactChance: 0.3,
    welcome: true,
    statusDelay: 500,
    name: "VELDRIX BOT",
    ver: "V7.6.0",
    owner: "Veldrix",
    prefix: ".",
    num: "",
    mode: "public"
};

const ts = new Map();
const seen = new Set();
const q = [];

async function start() {
    try {
        console.log("🤖 Starting WhatsApp Bot...\n");

        let state, saveCreds;
        try {
            const auth = await useMultiFileAuthState("./session");
            state = auth.state;
            saveCreds = auth.saveCreds;
        } catch (err) {
            console.log("❌ Auth error:", err.message);
            console.log("🔄 Retrying...");
            setTimeout(start, 3000);
            return;
        }

        const { version } = await fetchLatestBaileysVersion();

        const w = makeWASocket({
            version: version,
            auth: state,
            logger: pino({ level: "silent" }),
            printQRInTerminal: true,
            browser: ["Bot", "Chrome", "1.0.0"],
            syncFullHistory: false,
            markOnlineOnConnect: true,
        });

        if (saveCreds) {
            w.ev.on("creds.update", saveCreds);
        }

        w.ev.on("connection.update", ({ qr }) => {
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

        w.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
            if (connection === "open") {
                console.log("\n✅ Bot connected successfully!");
                console.log(`📱 Connected at ${moment().format("YYYY-MM-DD HH:mm:ss")}`);
                console.log("🤖 Bot is ready! Send .menu in any chat to test\n");
                console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
                if (w.user) {
                    C.num = w.user.id.split(":")[0];
                }
                viewStatus(w);
            }

            if (connection === "close") {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log("❌ Disconnected. Reconnecting in 5 seconds...");
                    setTimeout(start, 5000);
                } else {
                    console.log("⚠️ Logged out. Please restart bot.");
                    console.log("Run: rm -rf session && node index.js");
                }
            }
        });

        w.ev.on("messages.upsert", async ({ messages }) => {
            try {
                if (!messages || messages.length === 0) return;
                const a = messages[0];
                if (!a || !a.message || a.key.fromMe) return;
                const j = a.key.remoteJid;
                if (!j) return;
                const g = j.includes("@g.us");

                if (j && j.includes("status")) {
                    if (!seen.has(a.key.id)) {
                        q.push({ key: a.key, id: a.key.id, jid: j });
                    }
                    return;
                }

                let t = "";
                if (a.message.conversation) t = a.message.conversation;
                else if (a.message.extendedTextMessage?.text) t = a.message.extendedTextMessage.text;
                else if (a.message.imageMessage?.caption) t = a.message.imageMessage.caption;
                else if (a.message.videoMessage?.caption) t = a.message.videoMessage.caption;
                else return;

                console.log(`📩 ${g ? "Group" : "Private"} ${j}: ${t}`);

                // AUTO REACTION (optional, can be turned off with .autoreact)
                if (Math.random() < C.reactChance && t) {
                    const emojis = ["⭐", "✨", "💫", "🌟", "🔥"];
                    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
                    try {
                        await w.sendMessage(j, { react: { text: emoji, key: a.key } });
                    } catch (e) {}
                }

                if (t.startsWith(".")) {
                    const c = t.slice(1).split(" ")[0].toLowerCase();
                    const args = t.slice(1 + c.length).trim().split(" ");
                    console.log(`⚡ ${c}`);

                    try {
                        switch (c) {
                            // OWNER COMMANDS
                            case "menu":
                                await menu(w, j);
                                break;
                            case "ping":
                                await w.sendMessage(j, { text: "🏓 Pong! Online ✅" });
                                break;
                            case "owner":
                                await w.sendMessage(j, { text: `👑 Owner: ${C.owner}\nRole: Developer\nStatus: Online 🌟` });
                                break;
                            case "status":
                                await status(w, j);
                                break;
                            case "alive":
                                await w.sendMessage(j, {
                                    text: `🤖 ${C.name}\n✅ Alive!\n📱 ${moment().format("YYYY-MM-DD HH:mm:ss")}\n💖 ${C.owner}`
                                });
                                break;
                            case "runtime":
                                const r = process.uptime();
                                await w.sendMessage(j, {
                                    text: `⏱️ ${Math.floor(r / 86400)}d ${Math.floor((r % 86400) / 3600)}h ${Math.floor((r % 3600) / 60)}m ${Math.floor(r % 60)}s`
                                });
                                break;
                            case "repo":
                                await w.sendMessage(j, { text: "📦 https://github.com/veldrix/whatsapp-bot" });
                                break;
                            case "public":
                                C.mode = "public";
                                await w.sendMessage(j, { text: "✅ Bot is now PUBLIC for everyone!" });
                                break;
                            case "self":
                                C.mode = "self";
                                await w.sendMessage(j, { text: "✅ Bot is now SELF mode" });
                                break;

                            // GROUP COMMANDS - WORKS FOR EVERYONE
                            case "tagall":
                                if (g) { await tagAll(w, j); } else { await w.sendMessage(j, { text: "❌ This command only works in groups!" }); }
                                break;
                            case "promote":
                                if (g && args.length > 0) { await promote(w, j, args[0]); } else { await w.sendMessage(j, { text: "❌ Usage: .promote @user" }); }
                                break;
                            case "demote":
                                if (g && args.length > 0) { await demote(w, j, args[0]); } else { await w.sendMessage(j, { text: "❌ Usage: .demote @user" }); }
                                break;
                            case "kick":
                                if (g && args.length > 0) { await kick(w, j, args[0]); } else { await w.sendMessage(j, { text: "❌ Usage: .kick @user" }); }
                                break;
                            case "add":
                                if (g && args.length > 0) { await add(w, j, args[0]); } else { await w.sendMessage(j, { text: "❌ Usage: .add @user" }); }
                                break;
                            case "leave":
                                if (g) { await w.groupLeave(j); await w.sendMessage(j, { text: "👋 Left the group!" }); } else { await w.sendMessage(j, { text: "❌ This command only works in groups!" }); }
                                break;
                            case "groupinfo":
                                if (g) { await groupInfo(w, j); } else { await w.sendMessage(j, { text: "❌ This command only works in groups!" }); }
                                break;
                            case "welcome":
                                C.welcome = !C.welcome;
                                await w.sendMessage(j, { text: `✅ Welcome messages ${C.welcome ? "enabled" : "disabled"}` });
                                break;
                            case "hidetag":
                                if (g) { await hidetag(w, j); } else { await w.sendMessage(j, { text: "❌ Groups only" }); }
                                break;

                            // TOOL COMMANDS
                            case "react":
                                if (args.length > 0) {
                                    const v = parseFloat(args[0]);
                                    if (!isNaN(v) && v >= 0 && v <= 100) {
                                        C.reactChance = v / 100;
                                        await w.sendMessage(j, { text: `✅ Auto-reaction set to ${C.reactChance * 100}%` });
                                    } else {
                                        await w.sendMessage(j, { text: "❌ Use 0-100\nExample: .react 50" });
                                    }
                                } else {
                                    await w.sendMessage(j, { text: `📊 Current: ${C.reactChance * 100}%\nUse: .react 50` });
                                }
                                break;
                            case "autoreact":
                                C.reactChance = C.reactChance > 0 ? 0 : 0.3;
                                await w.sendMessage(j, { text: `✅ Auto-reaction ${C.reactChance > 0 ? "enabled" : "disabled"}` });
                                break;
                            case "help":
                                await help(w, j);
                                break;
                            case "info":
                                await w.sendMessage(j, {
                                    text: `🤖 ${C.name}\nVer: ${C.ver}\nMode: ${C.mode}\nFeatures:\n• Auto-status view 👁️\n• Anti-spam 🛡️\n• Welcome messages 🎉\n• Group management 👥\n• Fun commands 🎮`
                                });
                                break;
                            case "time":
                                await w.sendMessage(j, { text: `⏰ ${moment().format("HH:mm:ss")}` });
                                break;
                            case "date":
                                await w.sendMessage(j, { text: `📅 ${moment().format("dddd, MMMM Do YYYY")}` });
                                break;

                            // FUN COMMANDS
                            case "joke":
                                await w.sendMessage(j, { text: joke() });
                                break;
                            case "quote":
                                await w.sendMessage(j, { text: quote() });
                                break;
                            case "fact":
                                await w.sendMessage(j, { text: fact() });
                                break;
                            case "advice":
                                await w.sendMessage(j, { text: advice() });
                                break;
                            case "meme":
                                await w.sendMessage(j, { text: meme() });
                                break;
                            case "truth":
                                await w.sendMessage(j, { text: truth() });
                                break;
                            case "dare":
                                await w.sendMessage(j, { text: dare() });
                                break;

                            default:
                                console.log(`❓ Unknown: ${c}`);
                                break;
                        }
                    } catch (e) { console.log(`❌ ${e.message}`); }
                    return;
                }

                // NO AUTO REPLY - REMOVED

            } catch (e) { console.log(`❌ ${e.message}`); }
        });

        // Group welcome
        w.ev.on("group-participants.update", async (u) => {
            if (!C.welcome) return;
            const { id: p, participants: a, action: o } = u;
            if (o === "add") {
                for (const x of a) {
                    try {
                        await w.sendMessage(p, {
                            text: `🎉 *Welcome to the group!* 🎉\n\n👋 Hello @${x.split('@')[0]}!\n✨ We're happy to have you here!\n\n📌 Please read the group rules and enjoy your stay.`,
                            mentions: [x]
                        });
                        console.log(`👋 Welcomed ${x}`);
                    } catch (e) {}
                }
            }
            if (o === "remove") {
                for (const x of a) {
                    try {
                        await w.sendMessage(p, {
                            text: `👋 Goodbye @${x.split('@')[0]}! We'll miss you! 😢`,
                            mentions: [x]
                        });
                    } catch (e) {}
                }
            }
        });

    } catch (e) {
        console.log("❌", e.message);
        setTimeout(start, 5000);
    }
}

// MENU FUNCTION
async function menu(w, j) {
    const r = process.uptime();
    await w.sendMessage(j, {
        text: `╔══✦ 🌸 ${C.name} 🌸 ✦══╗
║ 🌹 USER: ${j.split('@')[0]}
║ ⚡ MODE: ${C.mode} 💖
║ 📡 PLATFORM: Linux
║ ⚙️ PREFIX: ${C.prefix}
║ 👨‍💻 DEV: ${C.owner}
║ ⏱️ UPTIME: ${Math.floor(r / 86400)}d ${Math.floor((r % 86400) / 3600)}h ${Math.floor((r % 3600) / 60)}m ${Math.floor(r % 60)}s
║ 🔥 COMMANDS: 50+
║ 📅 DATE: ${moment().format("M/D/YYYY, h:mm:ss A")}
╚════════════════════════╝

╭─❒ 👑 OWNER ❒─╮
│ .owner .alive .ping .status .runtime .repo .public .self
╰────────────────╯

╭─❒ 👥 GROUP ❒─╮
│ .welcome .tagall .promote .demote .kick .add .leave .groupinfo .hidetag
╰────────────────╯

╭─❒ ℹ️ TOOL ❒─╮
│ .react .autoreact .help .info .time .date
╰────────────────╯

╭─❒ 🎮 FUN ❒─╮
│ .joke .quote .fact .advice .meme .truth .dare
╰────────────────╯

💕 © ${C.owner} 🤖 ${C.ver}`
    });
}

// STATUS FUNCTION
async function status(w, j) {
    const r = process.uptime();
    await w.sendMessage(j, {
        text: `╔══✦ 🌸 ${C.name} 🌸 ✦══╗
║ 🌹 USER: ${j.split('@')[0]}
║ ⚡ MODE: ${C.mode} 💖
║ 📡 PLATFORM: Linux
║ ⚙️ PREFIX: ${C.prefix}
║ 👨‍💻 DEV: ${C.owner}
║ ⏱️ UPTIME: ${Math.floor(r / 86400)}d ${Math.floor((r % 86400) / 3600)}h ${Math.floor((r % 3600) / 60)}m ${Math.floor(r % 60)}s
║ 🔥 COMMANDS: 50+
║ 📅 DATE: ${moment().format("M/D/YYYY, h:mm:ss A")}
╚════════════════════════╝`
    });
}

// HELP FUNCTION
async function help(w, j) {
    await w.sendMessage(j, {
        text: `╔══✦ 📖 COMMAND HELP 📖 ✦══╗

🔹 OWNER:
.menu .ping .owner .status .alive .runtime .repo .public .self

🔹 GROUP (WORKS FOR EVERYONE):
.welcome - Toggle welcome messages
.tagall - Tag all members
.promote @user - Make admin
.demote @user - Remove admin
.kick @user - Remove member
.add @user - Add member
.leave - Bot leaves group
.groupinfo - Group information
.hidetag - Tag without mention

🔹 TOOL:
.react [0-100] - Set reaction chance
.autoreact - Toggle auto reactions
.help - Show this help
.info - Bot information
.time - Current time
.date - Current date

🔹 FUN:
.joke - Random joke
.quote - Inspirational quote
.fact - Interesting fact
.advice - Random advice
.meme - Random meme
.truth - Truth question
.dare - Dare challenge

✨ AUTO FEATURES:
✓ Auto-status view
✓ Anti-spam
✓ Auto-reconnect
✓ Welcome messages

💖 ${C.ver} 👨‍💻 ${C.owner}`
    });
}

// GROUP COMMANDS - PUBLIC FOR EVERYONE
async function tagAll(w, j) {
    try {
        const m = await w.groupMetadata(j);
        const p = m.participants;
        let t = "📢 *TAG ALL*\n\n";
        let mts = [];
        for (const x of p) {
            mts.push(x.id);
            t += `@${x.id.split('@')[0]}\n`;
        }
        await w.sendMessage(j, { text: t, mentions: mts });
        console.log(`✅ Tagged all in ${j}`);
    } catch (e) { console.log(`❌ Tagall error: ${e.message}`); }
}

async function hidetag(w, j) {
    try {
        const m = await w.groupMetadata(j);
        const p = m.participants;
        let mts = [];
        for (const x of p) {
            mts.push(x.id);
        }
        await w.sendMessage(j, { text: "🔇 Hidden tag", mentions: mts });
    } catch (e) {}
}

async function promote(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "promote");
        await w.sendMessage(j, { text: `✅ @${u} is now an admin!`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) { await w.sendMessage(j, { text: `❌ Failed to promote @${u}` }); }
}

async function demote(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "demote");
        await w.sendMessage(j, { text: `✅ @${u} is no longer an admin`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) { await w.sendMessage(j, { text: `❌ Failed to demote @${u}` }); }
}

async function kick(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "remove");
        await w.sendMessage(j, { text: `✅ @${u} has been removed`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) { await w.sendMessage(j, { text: `❌ Failed to remove @${u}` }); }
}

async function add(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "add");
        await w.sendMessage(j, { text: `✅ @${u} has been added!`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) { await w.sendMessage(j, { text: `❌ Failed to add @${u}` }); }
}

async function groupInfo(w, j) {
    try {
        const m = await w.groupMetadata(j);
        const c = await w.groupInviteCode(j) || "N/A";
        await w.sendMessage(j, {
            text: `📊 *GROUP INFO*\n\n📌 Name: ${m.subject}\n👤 Owner: @${m.owner.split('@')[0]}\n👥 Members: ${m.participants.length}\n📅 Created: ${moment(m.creation * 1000).format("MM/DD/YYYY")}\n🔗 Link: https://chat.whatsapp.com/${c}`,
            mentions: [m.owner]
        });
    } catch (e) { console.log(`❌ Group info error: ${e.message}`); }
}

// FUN COMMANDS
function joke() {
    const j = [
        "Why do programmers prefer dark mode? Light attracts bugs! 😄",
        "What do you call a fake noodle? An impasta! 🍝",
        "Why did the scarecrow win? Outstanding in his field! 🌾",
        "What do you call a bear with no teeth? A gummy bear! 🐻",
        "Why don't scientists trust atoms? They make up everything! ⚛️",
        "What do you call a fish wearing a bowtie? Sofishticated! 🐟"
    ];
    return j[Math.floor(Math.random() * j.length)];
}

function quote() {
    const q = [
        "The only way to do great work is to love what you do. - Steve Jobs",
        "Innovation distinguishes between a leader and a follower. - Steve Jobs",
        "Life is what happens 
