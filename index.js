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
    name: "🔥 『 VELDRIX 』 🔥",
    ver: "V7.6.0",
    owner: "Veldrix 👑",
    prefix: ".",
    num: "255748529340",
    mode: "public",
    botNumber: "255748529340"
};

const ts = new Map();
const seen = new Set();
const q = [];

async function start() {
    try {
        console.log("🤖 Starting VELDRIX Bot...\n");

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
                    C.botNumber = w.user.id.split(":")[0];
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
                if (!a || !a.message) return;
                
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
                if (a.message.conversation) {
                    t = a.message.conversation;
                } else if (a.message.extendedTextMessage?.text) {
                    t = a.message.extendedTextMessage.text;
                } else if (a.message.imageMessage?.caption) {
                    t = a.message.imageMessage.caption;
                } else if (a.message.videoMessage?.caption) {
                    t = a.message.videoMessage.caption;
                } else {
                    return;
                }

                console.log(`📩 ${g ? "Group" : "Private"} from ${a.key.participant || j}: ${t}`);

                if (Math.random() < C.reactChance && t) {
                    const emojis = ["⭐", "✨", "💫", "🌟", "🔥", "👋", "😊"];
                    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
                    try {
                        await w.sendMessage(j, { react: { text: emoji, key: a.key } });
                    } catch (e) {}
                }

                if (t.startsWith(".")) {
                    const c = t.slice(1).split(" ")[0].toLowerCase();
                    const args = t.slice(1 + c.length).trim().split(" ");
                    console.log(`⚡ Command: ${c}`);

                    try {
                        switch (c) {
                            case "menu": await menu(w, j); break;
                            case "ping": await w.sendMessage(j, { text: "🏓 Pong! Online ✅" }); break;
                            case "owner": await w.sendMessage(j, { text: `👑 Owner: ${C.owner}\nPhone: ${C.botNumber}\nRole: Developer\nStatus: Online 🌟` }); break;
                            case "status": await status(w, j); break;
                            case "alive": await w.sendMessage(j, { text: `🤖 ${C.name}\n✅ Alive!\n📱 ${moment().format("YYYY-MM-DD HH:mm:ss")}\n💖 ${C.owner}` }); break;
                            case "runtime": const r = process.uptime(); await w.sendMessage(j, { text: `⏱️ ${Math.floor(r/86400)}d ${Math.floor((r%86400)/3600)}h ${Math.floor((r%3600)/60)}m ${Math.floor(r%60)}s` }); break;
                            case "repo": await w.sendMessage(j, { text: "📦 https://github.com/veldrix/whatsapp-bot" }); break;
                            case "public": C.mode = "public"; await w.sendMessage(j, { text: "✅ Bot is now PUBLIC for everyone!" }); break;
                            case "self": C.mode = "self"; await w.sendMessage(j, { text: "✅ Bot is now SELF mode" }); break;
                            case "tagall": if (g) { await tagAll(w, j); } else { await w.sendMessage(j, { text: "❌ Groups only" }); } break;
                            case "online": if (g) { await onlineMembers(w, j); } else { await w.sendMessage(j, { text: "❌ Groups only" }); } break;
                            case "listonline": if (g) { await onlineMembers(w, j); } else { await w.sendMessage(j, { text: "❌ Groups only" }); } break;
                            case "admins": if (g) { await listAdmins(w, j); } else { await w.sendMessage(j, { text: "❌ Groups only" }); } break;
                            case "listadmins": if (g) { await listAdmins(w, j); } else { await w.sendMessage(j, { text: "❌ Groups only" }); } break;
                            case "tagadmin": if (g) { await tagAdmin(w, j); } else { await w.sendMessage(j, { text: "❌ Groups only" }); } break;
                            case "promote": if (g && args.length > 0) { await promote(w, j, args[0]); } else { await w.sendMessage(j, { text: "❌ Usage: .promote @user" }); } break;
                            case "demote": if (g && args.length > 0) { await demote(w, j, args[0]); } else { await w.sendMessage(j, { text: "❌ Usage: .demote @user" }); } break;
                            case "kick": if (g && args.length > 0) { await kick(w, j, args[0]); } else { await w.sendMessage(j, { text: "❌ Usage: .kick @user" }); } break;
                            case "remove": if (g && args.length > 0) { await kick(w, j, args[0]); } else { await w.sendMessage(j, { text: "❌ Usage: .remove @user" }); } break;
                            case "add": if (g && args.length > 0) { await add(w, j, args[0]); } else { await w.sendMessage(j, { text: "❌ Usage: .add @user" }); } break;
                            case "leave": if (g) { await w.groupLeave(j); await w.sendMessage(j, { text: "👋 Left the group!" }); } else { await w.sendMessage(j, { text: "❌ Groups only" }); } break;
                            case "groupinfo": if (g) { await groupInfo(w, j); } else { await w.sendMessage(j, { text: "❌ Groups only" }); } break;
                            case "welcome": C.welcome = !C.welcome; await w.sendMessage(j, { text: `✅ Welcome ${C.welcome ? "enabled" : "disabled"}` }); break;
                            case "hidetag": if (g) { await hidetag(w, j); } else { await w.sendMessage(j, { text: "❌ Groups only" }); } break;
                            case "react": if (args.length > 0) { const v = parseFloat(args[0]); if (!isNaN(v) && v >= 0 && v <= 100) { C.reactChance = v / 100; await w.sendMessage(j, { text: `✅ Set to ${C.reactChance * 100}%` }); } else { await w.sendMessage(j, { text: "❌ Use 0-100" }); } } else { await w.sendMessage(j, { text: `📊 ${C.reactChance * 100}%` }); } break;
                            case "autoreact": C.reactChance = C.reactChance > 0 ? 0 : 0.3; await w.sendMessage(j, { text: `✅ Auto-react ${C.reactChance > 0 ? "enabled" : "disabled"}` }); break;
                            case "help": await help(w, j); break;
                            case "info": await w.sendMessage(j, { text: `🤖 ${C.name}\nVer: ${C.ver}\nMode: ${C.mode}\nFeatures: Auto-status, Anti-spam, Welcome, Group Mgmt, Fun` }); break;
                            case "time": await w.sendMessage(j, { text: `⏰ ${moment().format("HH:mm:ss")}` }); break;
                            case "date": await w.sendMessage(j, { text: `📅 ${moment().format("dddd, MMMM Do YYYY")}` }); break;
                            case "joke": await w.sendMessage(j, { text: joke() }); break;
                            case "quote": await w.sendMessage(j, { text: quote() }); break;
                            case "fact": await w.sendMessage(j, { text: fact() }); break;
                            case "advice": await w.sendMessage(j, { text: advice() }); break;
                            case "meme": await w.sendMessage(j, { text: meme() }); break;
                            case "truth": await w.sendMessage(j, { text: truth() }); break;
                            case "dare": await w.sendMessage(j, { text: dare() }); break;
                            default: console.log(`❓ Unknown: ${c}`); break;
                        }
                    } catch (e) { console.log(`❌ ${e.message}`); }
                    return;
                }
            } catch (e) { console.log(`❌ ${e.message}`); }
        });

        w.ev.on("group-participants.update", async (u) => {
            if (!C.welcome) return;
            const { id: p, participants: a, action: o } = u;
            if (o === "add") {
                for (const x of a) {
                    try {
                        await w.sendMessage(p, {
                            text: `🎉 *Welcome!* 🎉\n\n👋 Hello @${x.split('@')[0]}!\n✨ Happy to have you here!`,
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
                            text: `👋 Bye @${x.split('@')[0]}!`,
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

async function menu(w, j) {
    const r = process.uptime();
    await w.sendMessage(j, {
        text: `╔══✦ 🔥 『 VELDRIX 』 🔥 ✦══╗
║ 🌹 USER: ${j.split('@')[0]}
║ ⚡ MODE: ${C.mode} 💖
║ 📡 PLATFORM: Linux
║ ⚙️ PREFIX: ${C.prefix}
║ 👨‍💻 DEV: ${C.owner}
║ 📱 NUMBER: ${C.botNumber}
║ ⏱️ UPTIME: ${Math.floor(r/86400)}d ${Math.floor((r%86400)/3600)}h ${Math.floor((r%3600)/60)}m ${Math.floor(r%60)}s
║ 🔥 COMMANDS: 50+
║ 📅 DATE: ${moment().format("M/D/YYYY, h:mm:ss A")}
╚════════════════════════╝

╭─❒ 👑 OWNER ❒─╮
│ .owner .alive .ping .status .runtime .repo .public .self
╰────────────────╯

╭─❒ 👥 GROUP ❒─╮
│ .welcome .tagall .online .listonline .admins .listadmins .tagadmin
│ .promote .demote .kick .remove .add .leave .groupinfo .hidetag
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

async function status(w, j) {
    const r = process.uptime();
    await w.sendMessage(j, {
        text: `╔══✦ 🔥 『 VELDRIX 』 🔥 ✦══╗
║ 🌹 USER: ${j.split('@')[0]}
║ ⚡ MODE: ${C.mode} 💖
║ 📡 PLATFORM: Linux
║ ⚙️ PREFIX: ${C.prefix}
║ 👨‍💻 DEV: ${C.owner}
║ 📱 NUMBER: ${C.botNumber}
║ ⏱️ UPTIME: ${Math.floor(r/86400)}d ${Math.floor((r%86400)/3600)}h ${Math.floor((r%3600)/60)}m ${Math.floor(r%60)}s
║ 🔥 COMMANDS: 50+
║ 📅 DATE: ${moment().format("M/D/YYYY, h:mm:ss A")}
╚════════════════════════╝`
    });
}

async function help(w, j) {
    await w.sendMessage(j, {
        text: `╔══✦ 📖 COMMAND HELP 📖 ✦══╗

🔹 OWNER:
.menu .ping .owner .status .alive .runtime .repo .public .self

🔹 GROUP (WORKS FOR EVERYONE):
.welcome - Toggle welcome messages
.tagall - Tag all members
.online - Show online members
.listonline - List online members
.admins - List all admins
.listadmins - List all admins
.tagadmin - Tag all admins
.promote @user - Make admin
.demote @user - Remove admin
.kick @user - Remove member
.remove @user - Remove member
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

async function onlineMembers(w, j) {
    try {
        const m = await w.groupMetadata(j);
        const participants = m.participants;
        let online = [];
        let offline = [];
        
        for (const p of participants) {
            try {
                const presence = await w.presenceSubscribe(p.id);
                if (presence && presence.lastKnownPresence === "available") {
                    online.push(p.id);
                } else {
                    offline.push(p.id);
                }
            } catch (e) {
                offline.push(p.id);
            }
        }
        
        let text = "👥 *ONLINE MEMBERS*\n\n";
        if (online.length > 0) {
            text += "🟢 *Online:*\n";
            for (const o of online) {
                text += `• @${o.split('@')[0]}\n`;
            }
        } else {
            text += "🟢 No one is online right now\n";
        }
        
        text += `\n⚫ *Offline:* ${offline.length} members`;
        text += `\n📊 *Total:* ${participants.length} members`;
        
        await w.sendMessage(j, { text: text, mentions: online });
        console.log(`✅ Online members shown`);
    } catch (e) { console.log(`❌ Online error: ${e.message}`); }
}

async function tagAdmin(w, j) {
    try {
        const m = await w.groupMetadata(j);
        const admins = m.participants.filter(p => p.admin !== null);
        let text = "👑 *ADMINS*\n\n";
        let mentions = [];
        for (const a of admins) {
            mentions.push(a.id);
            text += `• @${a.id.split('@')[0]} (${a.admin})\n`;
        }
        text += `\n📊 Total Admins: ${admins.length}`;
        await w.sendMessage(j, { text: text, mentions: mentions });
    } catch (e) { console.log(`❌ Tagadmin error: ${e.message}`); }
}

async function listAdmins(w, j) {
    try {
        const m = await w.groupMetadata(j);
        const admins = m.participants.filter(p => p.admin !== null);
        let text = "👑 *GROUP ADMINS*\n\n";
        for (const a of admins) {
            text += `• @${a.id.split('@')[0]} (${a.admin})\n`;
        }
        text += `\n📊 Total Admins: ${admins.length}`;
        await w.sendMessage(j, { text: text, mentions: admins.map(a => a.id) });
    } catch (e) { console.log(`❌ Listadmins error: ${e.message}`); }
}

async function tagAll(w, j) {
    try {
        const m = await w.groupMetadata(j);
        const p = m.participants;
        let t = "📢 TAG ALL\n\n";
        let mts = [];
        for (const x of p) {
            mts.push(x.id);
            t += `@${x.id.split('@')[0]}\n`;
        }
        await w.sendMessage(j, { text: t, mentions: mts });
        console.log(`✅ Tagged all`);
    } catch (e) { console.log(`❌ ${e.message}`); }
}

async function hidetag(w, j) {
    try {
        const m = await w.groupMetadata(j);
        const p = m.participants;
        let mts = [];
        for (const x of p) mts.push(x.id);
        await w.sendMessage(j, { text: "🔇 Hidden tag", mentions: mts });
    } catch (e) {}
}

async function promote(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "promote");
        await w.sendMessage(j, { text: `✅ @${u} is now admin!`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) { await w.sendMessage(j, { text: `❌ Failed` }); }
}

async function demote(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "demote");
        await w.sendMessage(j, { text: `✅ @${u} demoted`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) { await w.sendMessage(j, { text: `❌ Failed` }); }
}

async function kick(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "remove");
        await w.sendMessage(j, { text: `✅ @${u} removed`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) { await w.sendMessage(j, { text: `❌ Failed` }); }
}

async function add(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "add");
        await w.sendMessage(j, { text: `✅ @${u} added!`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) { await w.sendMessage(j, { text: `❌ Failed` }); }
}

async function groupInfo(w, j) {
    try {
        const m = await w.groupMetadata(j);
        const c = await w.groupInviteCode(j) || "N/A";
        await w.sendMessage(j, {
            text: `📊 GROUP INFO\n\n📌 ${m.subject}\n👤 @${m.owner.split('@')[0]}\n👥 ${m.participants.length}\n📅 ${moment(m.creation * 1000).format("MM/DD/YYYY")}\n🔗 https://chat.whatsapp.com/${c}`,
            mentions: [m.owner]
        });
    } catch (e) {}
}

function joke() {
    const j = [
        "Why do programmers prefer dark mode? Light attracts bugs!",
        "What do you call a fake noodle? An impasta!",
        "Why did the scarecrow win? Outstanding in his field!",
        "What do you call a bear with no teeth? A gummy bear!",
        "Why don't scientists trust atoms? They make up everything!"
    ];
    return j[Math.floor(Math.random() * j.length)];
}

function quote() {
    const q = [
        "The only way to do great work is to love what you do. - Steve Jobs",
        "Innovation distinguishes between a leader and a follower. - Steve Jobs",
        "Life is what happens when you're busy making other plans. - John Lennon",
