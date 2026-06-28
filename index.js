const readline = require("readline");
const pino = require("pino");
const qrcode = require("qrcode-terminal");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} = require("@whiskeysockets/baileys");

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

        // Show QR code
        sock.ev.on("connection.update", ({ qr }) => {
            if (qr) {
                console.log("\n📱 SCAN THIS QR CODE WITH WHATSAPP:");
                qrcode.generate(qr, { small: true });
                console.log("\n1. Open WhatsApp on your phone");
                console.log("2. Tap 3 dots menu > Linked Devices");
                console.log("3. Tap 'Link a Device'");
                console.log("4. Scan this QR code\n");
            }
        });

        // Connection handler
        sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
            if (connection === "open") {
                console.log("\n✅ Bot connected successfully!");
                console.log("🤖 Bot is ready! Send .menu in any chat\n");
            }

            if (connection === "close") {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log("❌ Disconnected. Reconnecting...");
                    setTimeout(() => startBot(), 5000);
                }
            }
        });

        // Message handler
        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message) return;
            if (msg.key.fromMe) return;

            const jid = msg.key.remoteJid;
            
            let text = "";
            if (msg.message.conversation) text = msg.message.conversation;
            else if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
            else return;

            if (text === ".menu") {
                await sock.sendMessage(jid, {
                    text: `╭─❍ BOT COMMANDS\n├ .menu - Show menu\n├ .ping - Check bot\n├ .owner - Bot owner\n├ .status - Bot status\n╰────────`
                });
            }

            if (text === ".ping") {
                await sock.sendMessage(jid, {
                    text: "Pong ⚡"
                });
            }

            if (text === ".owner") {
                await sock.sendMessage(jid, {
                    text: "Veldrix is not online."
                });
            }

            if (text === ".status") {
                await sock.sendMessage(jid, {
                    text: "✅ Bot is online and working!"
                });
            }
        });

    } catch (error) {
        console.log("Error:", error.message);
        setTimeout(() => startBot(), 5000);
    }
}

startBot();
