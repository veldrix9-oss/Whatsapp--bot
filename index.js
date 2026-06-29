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
    aiDelay: 300000,
    aiMode: true,
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
const last = new Map();

async function start() {
    try {
        console.log("🤖 Starting WhatsApp Bot...\n");

        // Get auth state with proper error handling
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

                if (t.startsWith(".")) {
                    const c = t.slice(1).split(" ")[0].toLowerCase();
                    const args = t.slice(1 + c.length).trim().split(" ");
                    console.log(`⚡ ${c}`);

                    try {
                        switch (c) {
                            case "menu":
                                await menu(w, j);
                                break;
                            case "ping":
                                await w.sendMessage(j, { text: "🏓 Pong! Online ✅" });
                                break;
                            case "owner":
                                await w.sendMessage(j, { text: `👑 Owner: ${C.owner}\nRole: Developer` });
                                break;
                            case "status":
                                await status(w, j);
                                break;
                            case "welcome":
                                C.welcome = !C.welcome;
                                await w.sendMessage(j, { text: `✅ Welcome ${C.welcome ? "enabled" : "disabled"}` });
                                break;
                            case "react":
                                if (args.length > 0) {
                                    const v = parseFloat(args[0]);
                                    if (!isNaN(v) && v >= 0 && v <= 100) {
                                        C.reactChance = v / 100;
                                        await w.sendMessage(j, { text: `✅ Set to ${C.reactChance * 100}%` });
                                    } else {
                                        await w.sendMessage(j, { text: "❌ Use 0-100" });
                                    }
                                } else {
                                    await w.sendMessage(j, { text: `📊 ${C.reactChance * 100}%` });
                                }
                                break;
                            case "help":
                                await help(w, j);
                                break;
                            case "info":
                                await w.sendMessage(j, {
                                    text: `🤖 ${C.name}\nVer: ${C.ver}\nMode: ${C.mode}\nFeatures: Auto-status, Anti-spam, Welcome, AI`
                                });
                                break;
                            case "autoreact":
                                C.reactChance = C.reactChance > 0 ? 0 : 0.3;
                                await w.sendMessage(j, { text: `✅ Auto-react ${C.reactChance > 0 ? "enabled" : "disabled"}` });
                                break;
                            case "ai":
                                C.aiMode = !C.aiMode;
                                await w.sendMessage(j, { text: `🤖 AI ${C.aiMode ? "enabled" : "disabled"}` });
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
                                await w.sendMessage(j, { text: "✅ PUBLIC mode" });
                                break;
                            case "self":
                                C.mode = "self";
                                await w.sendMessage(j, { text: "✅ SELF mode" });
                                break;
                            case "time":
                                await w.sendMessage(j, { text: `⏰ ${moment().format("HH:mm:ss")}` });
                                break;
                            case "date":
                                await w.sendMessage(j, { text: `📅 ${moment().format("dddd, MMMM Do YYYY")}` });
                                break;
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
                            case "tagall":
                                if (g) { await tagAll(w, j); } else { await w.sendMessage(j, { text: "❌ Groups only" }); }
                                break;
                            case "promote":
                                if (g && args.length > 0) { await promote(w, j, args[0]); }
                                break;
                            case "demote":
                                if (g && args.length > 0) { await demote(w, j, args[0]); }
                                break;
                            case "kick":
                                if (g && args.length > 0) { await kick(w, j, args[0]); }
                                break;
                            case "add":
                                if (g && args.length > 0) { await add(w, j, args[0]); }
                                break;
                            case "leave":
                                if (g) { await w.groupLeave(j); await w.sendMessage(j, { text: "👋 Left" }); }
                                break;
                            case "groupinfo":
                                if (g) { await groupInfo(w, j); }
                                break;
                        }
                    } catch (e) { console.log(`❌ ${e.message}`); }
                    return;
                }

                if (C.aiMode) {
                    const r = last.get(j) || 0;
                    const n = Date.now();
                    if (n - r >= C.aiDelay) {
                        const res = ai(t);
                        await w.sendPresenceUpdate("composing", j);
                        await delay(1500);
                        await w.sendMessage(j, { text: res });
                        last.set(j, n);
                        console.log(`🤖 AI to ${j}`);
                    }
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
                            text: `🎉 Welcome!\n👋 @${x.split('@')[0]}\n✨ Happy to have you!`,
                            mentions: [x]
                        });
                        console.log(`👋 ${x}`);
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
        text: `╔══✦ 🌸 ${C.name} 🌸 ✦══╗
║ 🌹 USER: ${j.split('@')[0]}
║ ⚡ MODE: ${C.mode}
║ 📡 PLATFORM: Linux
║ ⚙️ PREFIX: ${C.prefix}
║ 👨‍💻 DEV: ${C.owner}
║ ⏱️ UPTIME: ${Math.floor(r / 86400)}d ${Math.floor((r % 86400) / 3600)}h ${Math.floor((r % 3600) / 60)}m ${Math.floor(r % 60)}s
║ 📅 DATE: ${moment().format("M/D/YYYY, h:mm:ss A")}
╚════════════════════════╝

╭─❒ 👑 OWNER ❒─╮
│ .owner .alive .ping .status .runtime .repo .public .self
╰────────────────╯

╭─❒ 🤖 AI ❒─╮
│ .ai
╰────────────────╯

╭─❒ 👥 GROUP ❒─╮
│ .welcome .tagall .promote .demote .kick .add .leave .groupinfo
╰────────────────╯

╭─❒ ℹ️ TOOL ❒─╮
│ .react .autoreact .help .info .time .date
╰────────────────╯

╭─❒ 🎮 FUN ❒─╮
│ .joke .quote .fact .advice
╰────────────────╯

💕 © ${C.owner} 🤖 ${C.ver}`
    });
}

async function status(w, j) {
    const r = process.uptime();
    await w.sendMessage(j, {
        text: `╔══✦ 🌸 ${C.name} 🌸 ✦══╗
║ 🌹 USER: ${j.split('@')[0]}
║ ⚡ MODE: ${C.mode}
║ 📡 PLATFORM: Linux
║ ⚙️ PREFIX: ${C.prefix}
║ 👨‍💻 DEV: ${C.owner}
║ ⏱️ UPTIME: ${Math.floor(r / 86400)}d ${Math.floor((r % 86400) / 3600)}h ${Math.floor((r % 3600) / 60)}m ${Math.floor(r % 60)}s
║ 📅 DATE: ${moment().format("M/D/YYYY, h:mm:ss A")}
╚════════════════════════╝`
    });
}

async function help(w, j) {
    await w.sendMessage(j, {
        text: `╔══✦ 📖 HELP 📖 ✦══╗

🔹 BASIC: .menu .ping .owner .status .info .help .alive .runtime .repo
🔹 AI: .ai
🔹 GROUP: .welcome .tagall .promote .demote .kick .add .leave .groupinfo
🔹 TOOL: .react [0-100] .autoreact .time .date
🔹 FUN: .joke .quote .fact .advice

✨ AUTO: Auto-status, Anti-spam, Auto-reconnect, Welcome, AI Reply
💖 ${C.ver} 👨‍💻 ${C.owner}`
    });
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
    } catch (e) {}
}

async function promote(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "promote");
        await w.sendMessage(j, { text: `✅ @${u} admin`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) {}
}

async function demote(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "demote");
        await w.sendMessage(j, { text: `✅ @${u} demoted`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) {}
}

async function kick(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "remove");
        await w.sendMessage(j, { text: `✅ @${u} removed`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) {}
}

async function add(w, j, u) {
    try {
        await w.groupParticipantsUpdate(j, [u + "@s.whatsapp.net"], "add");
        await w.sendMessage(j, { text: `✅ @${u} added`, mentions: [u + "@s.whatsapp.net"] });
    } catch (e) {}
}

async function groupInfo(w, j) {
    try {
        const m = await w.groupMetadata(j);
        const c = await w.groupInviteCode(j) || "N/A";
        await w.sendMessage(j, {
            text: `📊 GROUP INFO\n\n📌 ${m.subject}\n👤 @${m.owner.split('@')[0]}\n👥 ${m.participants.length}\n📅 ${moment(m.creation * 1000).format("MM/DD/YYYY")}\n🔗 ${c}`,
            mentions: [m.owner]
        });
    } catch (e) {}
}

function ai(t) {
    const l = t.toLowerCase();
    if (l.match(/\b(hi|hello|hey|good morning)\b/))
        return ["Hello! How can I help?", "Hi there! What's up?", "Hey! Nice to hear from you!"][Math.floor(Math.random() * 3)];
    if (l.match(/\b(bye|goodbye|see you)\b/))
        return ["Goodbye! Have a great day!", "See you later!", "Bye! Come back anytime!"][Math.floor(Math.random() * 3)];
    if (l.match(/\b(thanks|thank you)\b/))
        return ["You're welcome!", "My pleasure!", "Anytime!"][Math.floor(Math.random() * 3)];
    if (l.includes("your name")) return `I'm ${C.owner}'s bot assistant!`;
    if (l.includes("how are you")) return "I'm doing great! Thanks!";
    if (l.includes("what can you do")) return "I help with status, commands, and conversations!";
    if (l.includes("time")) return `It's ${moment().format("HH:mm:ss")}`;
    if (l.includes("date")) return `Today is ${moment().format("dddd, MMMM Do YYYY")}`;
    if (l.includes("help")) return "I'm here to help! What do you need?";
    if (l.includes("who are you")) return `I'm ${C.name}, created by ${C.owner}!`;
    const g = ["That's interesting! Tell me more.", "I see! What would you like to know?", "Good point! Let me think.", "I understand! Anything else?", "Interesting! Let me help.", "Thanks for sharing!", "Let me explain..."];
    return g[Math.floor(Math.random() * g.length)];
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
        "Do great work by loving what you do. - Steve Jobs",
        "Innovation separates leaders. - Steve Jobs",
        "Life happens when making plans. - John Lennon",
        "Dream beautiful dreams. - Eleanor Roosevelt",
        "Be the change. - Gandhi"
    ];
    return q[Math.floor(Math.random() * q.length)];
}

function fact() {
    const f = [
        "Octopuses have 3 hearts!",
        "Honey never spoils!",
        "Bananas are berries!",
        "Venus day longer than year!",
        "Cows have best friends!"
    ];
    return f[Math.floor(Math.random() * f.length)];
}

function advice() {
    const a = [
        "Be kind to others.",
        "Take care of mental health.",
        "Learn daily.",
        "Save money.",
        "Spend time with loved ones."
    ];
    return a[Math.floor(Math.random() * a.length)];
}

async function viewStatus(w) {
    console.log("👁️ Status viewer started!");
    setInterval(async () => {
        if (q.length === 0) return;
        const s = q.shift();
        try {
            await w.readMessages([s.key]);
            seen.add(s.id);
            console.log("👁️ Viewed status");
        } catch (e) {}
    }, C.statusDelay);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

start();

process.on("uncaughtException", e => console.log("❌", e.message));
process.on("unhandledRejection", e => console.log("❌", e.message));
