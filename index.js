#!/usr/bin/env node

process.env.NODE_NO_WARNINGS = '1';
process.env.NODE_ENV = 'production';

const readline = require("readline");
const pino = require("pino");
const fs = require("fs");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const sessions = new Map();
const activeUsers = new Map();
const pairingCodes = new Map();

async function startBot(userNumber) {
    try {
        console.log(`🔄 Setting up ${userNumber}...`);
        
        const sessionDir = `./session_${userNumber}`;
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            browser: ['Chrome (Linux)', '', ''],
            connectTimeoutMs: 60000
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                console.log(`\n✅ ${userNumber} Connected Successfully!\n`);
                activeUsers.set(userNumber, { 
                    status: 'connected', 
                    connectedAt: new Date().toISOString(),
                    socket: sock 
                });
                
                try {
                    await sock.sendMessage(userNumber + '@s.whatsapp.net', {
                        text: `✅ VELDRIX BOT CONNECTED\n\nCommands:\n.menu - Show menu\n.ping - Test bot\n.owner - Bot owner\n.status - Bot status`
                    });
                } catch (e) {}
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`⚠️ ${userNumber} Disconnected (Code: ${statusCode})`);
                activeUsers.delete(userNumber);
                
                if (statusCode !== 401) {
                    setTimeout(() => startBot(userNumber), 5000);
                }
            }
        });

        if (sock.authState.creds.registered) {
            console.log(`✅ ${userNumber} is already paired!`);
            activeUsers.set(userNumber, { 
                status: 'connected', 
                connectedAt: new Date().toISOString(),
                socket: sock 
            });
        } else {
            console.log(`📱 Requesting pairing code for ${userNumber}...`);
            
            try {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const code = await sock.requestPairingCode(userNumber);
                
                if (code) {
                    console.log(`\n╔══════════════════════════════════════╗`);
                    console.log(`║         🔑 PAIRING CODE              ║`);
                    console.log(`╠══════════════════════════════════════╣`);
                    console.log(`║  ${userNumber}: ${code}  ║`);
                    console.log(`╠══════════════════════════════════════╣`);
                    console.log(`║  📱 Open WhatsApp → Linked Devices  ║`);
                    console.log(`║  ➜ Link with code                   ║`);
                    console.log(`╚══════════════════════════════════════╝\n`);
                    
                    pairingCodes.set(userNumber, {
                        code: code,
                        timestamp: Date.now(),
                        expires: Date.now() + 300000
                    });
                }
            } catch (e) {
                console.log(`❌ Pairing error: ${e.message}`);
                setTimeout(() => startBot(userNumber), 3000);
            }
        }

        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages?.[0];
            if (!msg?.message) return;
            if (msg.key.fromMe) return;

            const jid = msg.key.remoteJid;
            
            const message = msg.message;
            let text =
                message?.conversation ||
                message?.extendedTextMessage?.text ||
                "";

            text = text.trim();
            const command = text.toLowerCase();

            console.log(`📨 ${userNumber}: ${text}`);

            try {
                if (command === ".menu" || command === "/menu") {
                    await sock.sendMessage(jid, {
                        text: `🤖 VELDRIX BOT\n\n📋 COMMANDS:\n.menu - Show menu\n.ping - Test bot\n.owner - Bot owner\n.status - Bot status\n.groupinfo - Group info\n.tagall - Tag members\n.help - Help menu`
                    });
                }

                if (command === ".ping" || command === "/ping") {
                    const ping = Math.round(Date.now() - msg.messageTimestamp * 1000);
                    await sock.sendMessage(jid, { 
                        text: `🏓 Pong!\n⏱️ ${ping}ms` 
                    });
                }

                if (command === ".owner" || command === "/owner") {
                    await sock.sendMessage(jid, {
                        text: `👑 Bot Owner: Veldrix\n📱 Connected to: ${userNumber}\n✅ Status: Online`
                    });
                }

                if (command === ".status" || command === "/status") {
                    const totalUsers = activeUsers.size;
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    
                    await sock.sendMessage(jid, {
                        text: `📊 BOT STATUS\nActive Users: ${totalUsers}\nUptime: ${hours}h ${minutes}m\nConnected to: ${userNumber}`
                    });
                }

                if (command === ".groupinfo" || command === "/groupinfo") {
                    if (!jid.endsWith("@g.us")) {
                        await sock.sendMessage(jid, { text: "❌ This command only works in groups!" });
                        return;
                    }
                    
                    const meta = await sock.groupMetadata(jid);
                    await sock.sendMessage(jid, {
                        text: `📌 GROUP INFO\nName: ${meta.subject}\nMembers: ${meta.participants.length}\nAdmins: ${meta.participants.filter(p => p.admin).length}`
                    });
                }

                if (command === ".tagall" || command === "/tagall") {
                    if (!jid.endsWith("@g.us")) {
                        await sock.sendMessage(jid, { text: "❌ This command only works in groups!" });
                        return;
                    }
                    
                    const meta = await sock.groupMetadata(jid);
                    const mentions = meta.participants.map(p => p.id);

                    if (mentions.length > 30) {
                        await sock.sendMessage(jid, {
                            text: `⚠️ Group has ${mentions.length} members. Max 15 tags allowed.`
                        });
                        return;
                    }

                    let tagText = "📢 TAG ALL\n\n";
                    const shuffled = mentions.sort(() => Math.random() - 0.5).slice(0, 15);
                    for (let m of shuffled) {
                        tagText += `@${m.split("@")[0]}\n`;
                    }

                    await sock.sendMessage(jid, {
                        text: tagText,
                        mentions: shuffled
                    });
                }

                if (command === ".help" || command === "/help" || text === "help") {
                    await sock.sendMessage(jid, {
                        text: `🤖 VELDRIX BOT HELP\n\nCOMMANDS:\n.menu - Show menu\n.ping - Test bot\n.owner - Bot owner\n.status - Bot status\n.groupinfo - Group info\n.tagall - Tag members\n.help - This menu`
                    });
                }

            } catch (error) {
                console.log(`❌ Error: ${error.message}`);
            }
        });

        sessions.set(userNumber, sock);
        console.log(`✅ ${userNumber} bot ready!\n`);
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log(`🤖 VELDRIX BOT\n`);

function showMenu() {
    console.log(`📋 OPTIONS:\n1. Add new user\n2. Show active users\n3. Show pairing codes\n4. Remove user\n5. Show status\n6. Exit`);
}

function askForUser() {
    showMenu();
    
    rl.question("\n👉 Choose option (1-6): ", async (choice) => {
        if (choice === '1') {
            rl.question("📱 Enter phone number (255xxxxxxxxx): ", async (number) => {
                number = number.replace(/[^0-9]/g, '');
                
                if (!number || number.length < 5) {
                    console.log("❌ Invalid number!");
                    askForUser();
                    return;
                }

                if (sessions.has(number)) {
                    console.log(`ℹ️ ${number} is already connected`);
                    askForUser();
                    return;
                }

                console.log(`🔄 Setting up ${number}...`);
                await startBot(number);
                
                setTimeout(askForUser, 2000);
            });
            return;
        }

        if (choice === '2') {
            console.log(`\n👥 Active Users:`);
            if (activeUsers.size === 0) {
                console.log("  ❌ No active users");
            } else {
                activeUsers.forEach((data, user) => {
                    console.log(`  ✅ ${user}`);
                });
            }
            console.log(`\nTotal: ${activeUsers.size} users`);
            setTimeout(askForUser, 3000);
            return;
        }

        if (choice === '3') {
            console.log(`\n🔑 Pairing Codes:`);
            if (pairingCodes.size === 0) {
                console.log("  ❌ No pairing codes available");
            } else {
                pairingCodes.forEach((data, user) => {
                    const expired = Date.now() > data.expires;
                    console.log(`  ${expired ? '⏰' : '✅'} ${user}: ${data.code} ${expired ? '(EXPIRED)' : '(Valid)'}`);
                });
            }
            setTimeout(askForUser, 3000);
            return;
        }

        if (choice === '4') {
            rl.question("📱 Enter number to remove: ", async (number) => {
                number = number.replace(/[^0-9]/g, '');
                
                if (sessions.has(number)) {
                    sessions.delete(number);
                    activeUsers.delete(number);
                    pairingCodes.delete(number);
                    console.log(`✅ ${number} removed`);
                } else {
                    console.log(`❌ ${number} not found`);
                }
                setTimeout(askForUser, 2000);
            });
            return;
        }

        if (choice === '5') {
            console.log(`\n📊 Bot Status:`);
            console.log(`  Active Users: ${activeUsers.size}`);
            console.log(`  Total Sessions: ${sessions.size}`);
            console.log(`  Pairing Codes: ${pairingCodes.size}`);
            console.log(`  Uptime: ${Math.floor(process.uptime() / 60)} minutes`);
            setTimeout(askForUser, 3000);
            return;
        }

        if (choice === '6') {
            console.log("👋 Goodbye!");
            rl.close();
            process.exit(0);
        }

        console.log("❌ Invalid option!");
        setTimeout(askForUser, 1000);
    });
}

askForUser();

process.on('SIGINT', () => {
    console.log("\n\n👋 Shutting down...");
    rl.close();
    process.exit(0);
});
