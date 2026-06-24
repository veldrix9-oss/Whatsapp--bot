const pino = require("pino");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState("./session");
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: "silent" }),
        printQRInTerminal: true,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });
    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", (u) => {
        if (u.connection === "open") console.log("✅ Connected!");
    });
}
start();
