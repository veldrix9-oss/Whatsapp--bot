const readline = require("readline");
const pino = require("pino");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

async function startBot() {

    const { state, saveCreds } =
        await useMultiFileAuthState("./session");

    const { version } =
        await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" })
    });

    sock.ev.on("creds.update", saveCreds);

    if (!sock.authState.creds.registered) {

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(
            "Enter number (255xxxxxxxxx): ",
            async (number) => {

                try {
                    const code =
                        await sock.requestPairingCode(number);

                    console.log("\nPAIRING CODE:");
                    console.log(code);
                    console.log(
                        "\nWhatsApp > Linked Devices > Link with phone number\n"
                    );

                } catch (e) {
                    console.log(e);
                }

                rl.close();
            }
        );
    }

    sock.ev.on("connection.update", async (update) => {

        const { connection } = update;

        if (connection === "open") {
            console.log("✅ Connected");
        }

        if (connection === "close") {
            console.log("♻ Reconnecting...");
            startBot();
        }
    });

    sock.ev.on(
        "group-participants.update",
        async (data) => {

            try {

                if (data.action === "add") {

                    for (const user of data.participants) {

                        await sock.sendMessage(
                            data.id,
                            {
                                text:
                                `👋 Welcome @${user.split("@")[0]}`,
                                mentions: [user]
                            }
                        );
                    }
                }

                if (data.action === "remove") {

                    for (const user of data.participants) {

                        await sock.sendMessage(
                            data.id,
                            {
                                text:
                                `😢 Goodbye @${user.split("@")[0]}`,
                                mentions: [user]
                            }
                        );
                    }
                }

            } catch {}
        }
    );

    sock.ev.on(
        "messages.upsert",
        async ({ messages }) => {

            const msg = messages[0];

            if (!msg.message) return;
            if (msg.key.fromMe) return;

            const jid = msg.key.remoteJid;

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                "";

            try {

                await sock.sendPresenceUpdate(
                    "composing",
                    jid
                );

                await sock.sendMessage(jid, {
                    react: {
                        text: "⚡",
                        key: msg.key
                    }
                });

                if (text === ".menu") {

                    await sock.sendMessage(jid, {
                        text:
`╭───❍ VELDRIX BOT
├ .menu
├ .ping
├ .owner
├ .away
├ .tagall
├ .groupinfo
╰──────────`
                    });
                }

                if (text === ".ping") {

                    await sock.sendMessage(jid, {
                        text: "🏓 Pong"
                    });
                }

                if (
                    text === ".owner" ||
                    text === ".away"
                ) {

                    await sock.sendMessage(jid, {
                        text:
                        "Veldrix is currently away."
                    });
                }

                if (text === ".groupinfo") {

                    if (!jid.endsWith("@g.us"))
                        return;

                    const meta =
                        await sock.groupMetadata(jid);

                    await sock.sendMessage(jid, {
                        text:
`📌 ${meta.subject}
👥 Members: ${meta.participants.length}`
                    });
                }

                if (text === ".tagall") {

                    if (!jid.endsWith("@g.us"))
                        return;

                    const meta =
                        await sock.groupMetadata(jid);

                    const mentions =
                        meta.participants.map(
                            p => p.id
                        );

                    let txt = "📢 TAG ALL\n\n";

                    for (const m of mentions) {
                        txt +=
                        `@${m.split("@")[0]}\n`;
                    }

                    await sock.sendMessage(
                        jid,
                        {
                            text: txt,
                            mentions
                        }
                    );
                }

            } catch (e) {
                console.log(e);
            }
        }
    );
}

startBot();
