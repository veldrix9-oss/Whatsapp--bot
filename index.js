const readline = require("readline");
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

let sock, saveCreds;
let isPairing = false;

// ----- Auto‑greeting messages -----
const GREETINGS = [
    "Hello! 👋 Welcome to the bot.",
    "Hi there! 😊 How can I help you?",
    "Hey! 👋 Glad to see you."
];

// ----- Main bot function -----
async function startBot() {
    const { state, saveCreds: save } = await useMultiFileAuthState("./session");
    saveCreds = save;

    // Use stable version for fast connection
    const version = [2, 3000, 1015906];

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeout: 30000,
        defaultQueryTimeoutMs: 30000
    });

    sock.ev.on("creds.update", saveCreds);

    // ----- Connection handler -----
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            console.log("✅ Bot connected.");
            if (!state.creds.registered && !isPairing) {
                setTimeout(startPairing, 2000);
            }
        }

        if (connection === "close") {
            if (isPairing) {
                console.log("⏳ Waiting for pairing...");
                return;
            }
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("🔄 Reconnecting in 5s...");
                setTimeout(startBot, 5000);
            } else {
                console.log("❌ Logged out. Delete session folder and restart.");
            }
        }
    });

    // ----- Message handler (greetings + auto‑react) -----
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const jid = msg.key.remoteJid;
        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        try {
            // 1. Auto‑react with a random emoji
            const emojis = ["🔥", "❤️", "👋", "😊", "✨", "👍", "💯"];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            await sock.sendMessage(jid, {
                react: { text: randomEmoji, key: msg.key }
            });

            // 2. Greet if it's a new chat (no previous messages in session)
            // We use a simple heuristic: if the message is "hi", "hello", or starts with a greeting.
            const lower = text.toLowerCase().trim();
            const isGreeting = lower === "hi" || lower === "hello" || lower === "hey" || lower === "greetings" || lower === "salam";
            if (isGreeting) {
                const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
                await sock.sendMessage(jid, { text: greeting });
            }

            // 3. Simple commands
            if (text === ".help") {
                await sock.sendMessage(jid, {
                    text: "🤖 Commands:\n.menu – show menu\n.ping – pong\n.owner – info\n.away – status"
                });
            }
            if (text === ".ping") {
                await sock.sendMessage(jid, { text: "🏓 Pong!" });
            }
            if (text === ".owner") {
                await sock.sendMessage(jid, { text: "👤 Bot owner: @your_name (change this)" });
            }
            if (text === ".away") {
                await sock.sendMessage(jid, { text: "⏳ I'm online and active." });
            }

        } catch (e) {
            console.log("Message error:", e);
        }
    });

    if (state.creds.registered) {
        console.log("✅ Session found – waiting for connection...");
    }
}

// ----- Pairing function (called only once) -----
function startPairing() {
    if (isPairing) return;
    isPairing = true;
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question("📱 Enter phone number with country code: ", async (number) => {
        try {
            console.log("⏳ Requesting pairing code...");
            const code = await sock.requestPairingCode(number);
            console.log("\n✅ PAIRING CODE:", code);
            console.log("\n📲 Open WhatsApp → Settings → Linked Devices → Link with phone number");
            console.log("➡️  Enter the code above within 30 seconds.\n");
        } catch (err) {
            console.error("❌ Pairing failed:", err.message);
            console.log("💡 Retry in 10 seconds...");
            setTimeout(() => {
                isPairing = false;
                startBot();
            }, 10000);
        }
        rl.close();
        isPairing = false;
    });
}

// ----- Start the bot -----
console.log("🚀 Starting WhatsApp bot...");
startBot();
