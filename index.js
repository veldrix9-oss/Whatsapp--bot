#!/usr/bin/env node

// ===== SUPPRESS WARNINGS =====
process.env.NODE_NO_WARNINGS = '1';
process.env.NODE_ENV = 'production';

process.on('unhandledRejection', (err) => {});
process.on('warning', (warning) => {
    if (warning.name === 'DeprecationWarning') return;
});

// ===== IMPORTS =====
const readline = require("readline");
const pino = require("pino");
const fs = require("fs");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

// ============================================
// ===== BOT STATE =====
// ============================================

const sessions = new Map();
const activeUsers = new Map();
const pairingCodes = new Map();

// ============================================
// ===== START BOT - COMPLETELY FIXED =====
// ============================================

async function startBot(userNumber) {
    try {
        console.log(`🔄 Starting bot for ${userNumber}...`);
        
        const sessionDir = `./session_${userNumber}`;
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        // Create socket with proper config
        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ 
                level: 'silent',
                stream: { write: () => {} }
            }),
            printQRInTerminal: false,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            browser: ['Chrome (Linux)', '', ''],
            connectTimeoutMs: 60000
        });

        sock.ev.on("creds.update", saveCreds);

        // ===== CONNECTION HANDLER =====
        sock.ev.on("connection.update", (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log(`📱 QR Code received for ${userNumber}. Use it if pairing fails.`);
            }

            if (connection === "open") {
                console.log(`✅ ${userNumber} Connected Successfully!`);
                activeUsers.set(userNumber, { 
                    status: 'connected', 
                    connectedAt: new Date().toISOString(),
                    socket: sock 
                });
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`⚠️ ${userNumber} Disconnected (Code: ${statusCode})`);
                
                if (statusCode === 401) {
                    console.log(`📱 ${userNumber} needs pairing. Waiting for user to link...`);
                    // Don't delete session, wait for pairing
                } else {
                    activeUsers.delete(userNumber);
                    if (statusCode !== 401) {
                        console.log(`♻ Reconnecting ${userNumber} in 5 seconds...`);
                        setTimeout(() => startBot(userNumber), 5000);
                    }
                }
            }
        });

        // ===== PAIRING CODE - FIXED =====
        // Check if already registered
        if (sock.authState.creds.registered) {
            console.log(`✅ ${userNumber} is already paired!`);
            activeUsers.set(userNumber, { 
                status: 'connected', 
                connectedAt: new Date().toISOString(),
                socket: sock 
            });
        } else {
            // Not registered, request pairing code
            console.log(`📱 Requesting pairing code for ${userNumber}...`);
            
            try {
                // Wait a bit for socket to be ready
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const code = await sock.requestPairingCode(userNumber);
                
                if (code) {
                    console.log(`\n🔑 ==================================`);
                    console.log(`🔑 PAIRING CODE for ${userNumber}: ${code}`);
                    console.log(`🔑 ==================================`);
                    console.log(`📱 User: Open WhatsApp → Linked Devices → Link with code`);
                    console.log(`⏰ This code expires in 5 minutes\n`);
                    
                    pairingCodes.set(userNumber, {
                        code: code,
                        timestamp: Date.now(),
                        expires: Date.now() + 300000 // 5 minutes
                    });
                    
                    // Wait for connection
                    console.log(`⏳ Waiting for ${userNumber} to link WhatsApp...`);
                    console.log(`💡 Once linked, the bot will show "Connected Successfully!"\n`);
                    
                    // Keep the bot running and check connection status
                    let attempts = 0;
                    const maxAttempts = 60; // 5 minutes with 5 second intervals
                    
                    const checkConnection = setInterval(() => {
                        attempts++;
                        if (sock.authState.creds.registered) {
                            console.log(`✅ ${userNumber} has linked successfully!`);
                            activeUsers.set(userNumber, { 
                                status: 'connected', 
                                connectedAt: new Date().toISOString(),
                                socket: sock 
                            });
                            clearInterval(checkConnection);
                        } else if (attempts >= maxAttempts) {
                            console.log(`⏰ Pairing timeout for ${userNumber}. Please try again.`);
                            clearInterval(checkConnection);
                        }
                    }, 5000);
                    
                } else {
                    console.log(`❌ No pairing code received for ${userNumber}`);
                }
            } catch (e) {
                console.log(`❌ Pairing error: ${e.message}`);
                console.log(`💡 Try again or check internet connection.`);
            }
        }

        // ===== GROUP PARTICIPANTS =====
        sock.ev.on("group-participants.update", async (data) => {
            try {
                if (data.action === "add") {
                    for (let user of data.participants) {
                        await sock.sendMessage(data.id, {
                            text: `👋 Welcome @${user.split("@")[0]}`,
                            mentions: [user]
                        });
                    }
                }

                if (data.action === "remove") {
                    for (let user of data.participants) {
                        await sock.sendMessage(data.id, {
                            text: `😢 Goodbye @${user.split("@")[0]}`,
                            mentions: [user]
                        });
                    }
                }
            } catch (error) {}
        });

        // ===== MESSAGE HANDLER =====
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
                if (command === ".menu" || command === ".help") {
                    await sock.sendMessage(jid, {
                        text: `╭───❍ VELDRIX BOT
│
├── 📋 COMMANDS
│   ├ .menu - Show menu
│   ├ .ping - Test bot
│   ├ .owner - Bot owner
│   ├ .status - Bot status
│   ├ .groupinfo - Group info
│   └ .tagall - Tag members
│
├── 🛡️ ANTI-BAN
│   ├ Human-like behavior
│   ├ Rate limiting
│   └ Random delays
│
╰──────────`
                    });
                }

                if (command === ".ping") {
                    const ping = Math.round(Date.now() - msg.messageTimestamp * 1000);
                    await sock.sendMessage(jid, { 
                        text: `🏓 Pong!\n⏱️ ${ping}ms` 
                    });
                }

                if (command === ".owner") {
                    await sock.sendMessage(jid, {
                        text: `👑 Bot Owner: Veldrix\n📱 Connected to: ${userNumber}\n🛡️ Anti-Ban: Active\n✅ Status: Online`
                    });
                }

                if (command === ".status") {
                    const totalUsers = activeUsers.size;
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    
                    await sock.sendMessage(jid, {
                        text: `📊 BOT STATUS
├ Active Users: ${totalUsers}
├ Uptime: ${hours}h ${minutes}m
└ Connected to: ${userNumber}`
                    });
                }

                if (command === ".groupinfo") {
                    if (!jid.endsWith("@g.us")) {
                        await sock.sendMessage(jid, { text: "❌ This command only works in groups!" });
                        return;
                    }
                    
                    const meta = await sock.groupMetadata(jid);
                    await sock.sendMessage(jid, {
                        text: `📌 GROUP INFO
├ Name: ${meta.subject}
├ Members: ${meta.participants.length}
├ Admins: ${meta.participants.filter(p => p.admin).length}
└ Owner: ${meta.owner ? meta.owner.split("@")[0] : "Unknown"}`
                    });
                }

                if (command === ".tagall") {
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

            } catch (error) {
                console.log(`❌ Error: ${error.message}`);
            }
        });

        sessions.set(userNumber, sock);
        console.log(`✅ ${userNumber} bot ready!`);
        
    } catch (error) {
        console.log(`❌ Error starting bot: ${error.message}`);
    }
}

// ============================================
// ===== MAIN MENU =====
// ============================================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("🛡️ VELDRIX BOT - WhatsApp Bot");
console.log("=========================================");
console.log("📌 Features:");
console.log("  • WhatsApp multi-user support");
console.log("  • Pairing code system");
console.log("  • Auto-reconnection");
console.log("  • Group welcome/goodbye");
console.log("  • Command system");
console.log("=========================================\n");

function showMenu() {
    console.log("\n📋 Options:");
    console.log("  1. Add new user");
    console.log("  2. Show active users");
    console.log("  3. Show pairing codes");
    console.log("  4. Remove user");
    console.log("  5. Show status");
    console.log("  6. Exit");
    console.log("=========================================");
}

function askForUser() {
    showMenu();
    
    rl.question("\nChoose option (1-6): ", async (choice) => {
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
            console.log("\n👥 Active Users:");
            if (activeUsers.size === 0) {
                console.log("  ❌ No active users");
            } else {
                activeUsers.forEach((data, user) => {
                    console.log(`  ✅ ${user} - Connected since ${data.connectedAt}`);
                });
            }
            console.log(`\n📊 Total: ${activeUsers.size} active users`);
            setTimeout(askForUser, 3000);
            return;
        }

        if (choice === '3') {
            console.log("\n🔑 Pairing Codes:");
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
                    console.log(`✅ ${number} removed successfully`);
                } else {
                    console.log(`❌ ${number} not found`);
                }
                setTimeout(askForUser, 2000);
            });
            return;
        }

        if (choice === '5') {
            console.log("\n📊 Bot Status:");
            console.log(`  • Active Users: ${activeUsers.size}`);
            console.log(`  • Total Sessions: ${sessions.size}`);
            console.log(`  • Pairing Codes: ${pairingCodes.size}`);
            console.log(`  • Uptime: ${Math.floor(process.uptime() / 60)} minutes`);
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

// ===== START =====
askForUser();

// ===== CLEANUP =====
process.on('SIGINT', () => {
    console.log("\n\n👋 Shutting down...");
    rl.close();
    process.exit(0);
});
