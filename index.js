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
    fetchLatestBaileysVersion,
    makeInMemoryStore
} = require("@whiskeysockets/baileys");

// ============================================
// ===== BOT STATE =====
// ============================================

const sessions = new Map();
const activeUsers = new Map();
const pairingCodes = new Map();
const store = makeInMemoryStore({});

// ============================================
// ===== PUBLIC BOT - FIXED VERSION =====
// ============================================

async function startBot(userNumber) {
    try {
        console.log(`🔄 Setting up ${userNumber}...`);
        
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
            connectTimeoutMs: 60000,
            emitOwnEvents: true
        });

        // Bind store
        store.bind(sock.ev);

        // ===== CREDENTIALS =====
        sock.ev.on("creds.update", saveCreds);

        // ===== CONNECTION HANDLER =====
        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                console.log(`\n✅ ${userNumber} Connected Successfully!`);
                console.log(`📱 WhatsApp is now linked!\n`);
                activeUsers.set(userNumber, { 
                    status: 'connected', 
                    connectedAt: new Date().toISOString(),
                    socket: sock 
                });
                
                // Send welcome message
                try {
                    await sock.sendMessage(userNumber + '@s.whatsapp.net', {
                        text: `╭───❍ VELDRIX BOT
│
├── ✅ CONNECTED SUCCESSFULLY
│   └ 📱 Your WhatsApp is now linked
│
├── 📋 COMMANDS
│   ├ .menu - Show all commands
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
                } catch (e) {}
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`⚠️ ${userNumber} Disconnected (Code: ${statusCode})`);
                
                if (statusCode === 401) {
                    console.log(`📱 ${userNumber} needs pairing. Waiting for user...`);
                    // Wait for pairing
                    setTimeout(() => {
                        if (!sock.authState.creds.registered) {
                            console.log(`🔄 Attempting to re-pair ${userNumber}...`);
                            startBot(userNumber);
                        }
                    }, 5000);
                } else {
                    activeUsers.delete(userNumber);
                    console.log(`♻ Reconnecting ${userNumber} in 5 seconds...`);
                    setTimeout(() => startBot(userNumber), 5000);
                }
            }
        });

        // ===== CHECK REGISTRATION =====
        if (sock.authState.creds.registered) {
            console.log(`✅ ${userNumber} is already paired!`);
            activeUsers.set(userNumber, { 
                status: 'connected', 
                connectedAt: new Date().toISOString(),
                socket: sock 
            });
        } else {
            // Request pairing code
            console.log(`📱 Requesting pairing code for ${userNumber}...`);
            
            try {
                // Wait for socket to be ready
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
                    console.log(`║  ⏰ Expires in 5 minutes            ║`);
                    console.log(`╚══════════════════════════════════════╝\n`);
                    
                    pairingCodes.set(userNumber, {
                        code: code,
                        timestamp: Date.now(),
                        expires: Date.now() + 300000
                    });
                    
                    // Wait for connection
                    console.log(`⏳ Waiting for ${userNumber} to link WhatsApp...`);
                    console.log(`💡 The bot will auto-detect when linked!\n`);
                }
            } catch (e) {
                console.log(`❌ Pairing error: ${e.message}`);
                console.log(`💡 Retrying in 3 seconds...`);
                setTimeout(() => startBot(userNumber), 3000);
            }
        }

        // ===== GROUP PARTICIPANTS =====
        sock.ev.on("group-participants.update", async (data) => {
            try {
                if (data.action === "add") {
                    for (let user of data.participants) {
                        await sock.sendMessage(data.id, {
                            text: `╭───❍ WELCOME
│
├ 👋 Welcome @${user.split("@")[0]}
│
├ 📌 Group: ${(await sock.groupMetadata(data.id)).subject}
│
╰──────────`,
                            mentions: [user]
                        });
                    }
                }

                if (data.action === "remove") {
                    for (let user of data.participants) {
                        await sock.sendMessage(data.id, {
                            text: `╭───❍ GOODBYE
│
├ 😢 Goodbye @${user.split("@")[0]}
│
├ 📌 Group: ${(await sock.groupMetadata(data.id)).subject}
│
╰──────────`,
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
                // ===== MENU =====
                if (command === ".menu" || command === "/menu" || command === "!menu") {
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║          🤖 VELDRIX BOT           ║
╠══════════════════════════════════════╣
║                                    ║
║  📋 AVAILABLE COMMANDS             ║
║                                    ║
║  🟢 .menu     - Show this menu     ║
║  🟢 .ping     - Test bot          ║
║  🟢 .owner    - Bot owner         ║
║  🟢 .status   - Bot status        ║
║  🟢 .groupinfo- Group info        ║
║  🟢 .tagall   - Tag members       ║
║  🟢 .help     - Help menu         ║
║                                    ║
║  🛡️ ANTI-BAN PROTECTION            ║
║  ├ Human-like behavior            ║
║  ├ Rate limiting                  ║
║  └ Random delays                  ║
║                                    ║
║  📱 Connected to: ${userNumber}     ║
║                                    ║
╚══════════════════════════════════════╝`
                    });
                }

                // ===== PING =====
                if (command === ".ping" || command === "/ping" || command === "!ping") {
                    const ping = Math.round(Date.now() - msg.messageTimestamp * 1000);
                    await sock.sendMessage(jid, { 
                        text: `╔══════════════════════════════════════╗
║           🏓 PONG!                ║
╠══════════════════════════════════════╣
║                                    ║
║  ⏱️ Response Time: ${ping}ms         ║
║  📱 Status: Online                ║
║  🛡️ Anti-Ban: Active              ║
║                                    ║
╚══════════════════════════════════════╝`
                    });
                }

                // ===== OWNER =====
                if (command === ".owner" || command === "/owner" || command === "!owner") {
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║           👑 BOT OWNER             ║
╠══════════════════════════════════════╣
║                                    ║
║  👤 Name: Veldrix                 ║
║  📱 Connected: ${userNumber}         ║
║  🛡️ Anti-Ban: Active              ║
║  ✅ Status: Online                ║
║  🌐 Type: Public Bot              ║
║                                    ║
╚══════════════════════════════════════╝`
                    });
                }

                // ===== STATUS =====
                if (command === ".status" || command === "/status" || command === "!status") {
                    const totalUsers = activeUsers.size;
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║           📊 BOT STATUS            ║
╠══════════════════════════════════════╣
║                                    ║
║  📱 Active Users: ${totalUsers}       ║
║  ⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s  ║
║  🔗 Connected to: ${userNumber}     ║
║  🛡️ Anti-Ban: Active              ║
║  ✅ Status: Running                ║
║  🌐 Type: Public Bot              ║
║                                    ║
╚══════════════════════════════════════╝`
                    });
                }

                // ===== GROUP INFO =====
                if (command === ".groupinfo" || command === "/groupinfo" || command === "!groupinfo") {
                    if (!jid.endsWith("@g.us")) {
                        await sock.sendMessage(jid, { 
                            text: `❌ This command only works in groups!` 
                        });
                        return;
                    }
                    
                    const meta = await sock.groupMetadata(jid);
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║           📌 GROUP INFO            ║
╠══════════════════════════════════════╣
║                                    ║
║  📛 Name: ${meta.subject}            ║
║  👥 Members: ${meta.participants.length}   ║
║  👑 Admins: ${meta.participants.filter(p => p.admin).length}    ║
║  📅 Created: ${new Date(meta.creation * 1000).toLocaleDateString()} ║
║  👤 Owner: ${meta.owner ? meta.owner.split("@")[0] : "Unknown"}  ║
║                                    ║
╚══════════════════════════════════════╝`
                    });
                }

                // ===== TAG ALL =====
                if (command === ".tagall" || command === "/tagall" || command === "!tagall") {
                    if (!jid.endsWith("@g.us")) {
                        await sock.sendMessage(jid, { 
                            text: `❌ This command only works in groups!` 
                        });
                        return;
                    }
                    
                    const meta = await sock.groupMetadata(jid);
                    const mentions = meta.participants.map(p => p.id);

                    if (mentions.length > 30) {
                        await sock.sendMessage(jid, {
                            text: `⚠️ Group has ${mentions.length} members. Max 15 tags allowed for safety.`
                        });
                        return;
                    }

                    let tagText = `╔══════════════════════════════════════╗
║           📢 TAG ALL              ║
╠══════════════════════════════════════╣
║                                    ║
`;
                    const shuffled = mentions.sort(() => Math.random() - 0.5).slice(0, 15);
                    for (let m of shuffled) {
                        tagText += `  @${m.split("@")[0]}\n`;
                    }
                    tagText += `║                                    ║
╚══════════════════════════════════════╝`;

                    await sock.sendMessage(jid, {
                        text: tagText,
                        mentions: shuffled
                    });
                }

                // ===== HELP =====
                if (command === ".help" || command === "/help" || command === "!help" || command === "help") {
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║           🆘 HELP MENU            ║
╠══════════════════════════════════════╣
║                                    ║
║  📋 ALL COMMANDS                   ║
║                                    ║
║  ✅ .menu     - Show menu         ║
║  ✅ .ping     - Test bot          ║
║  ✅ .owner    - Bot owner         ║
║  ✅ .status   - Bot status        ║
║  ✅ .groupinfo- Group info        ║
║  ✅ .tagall   - Tag members       ║
║  ✅ .help     - This menu         ║
║                                    ║
║  🛡️ ANTI-BAN PROTECTION            ║
║  ├ Human-like behavior            ║
║  ├ Rate limiting                  ║
║  └ Random delays                  ║
║                                    ║
║  📱 Connected to: ${userNumber}     ║
║                                    ║
╚══════════════════════════════════════╝`
                    });
                }

            } catch (error) {
                console.log(`❌ Error: ${error.message}`);
            }
        });

        sessions.set(userNumber, sock);
        console.log(`✅ ${userNumber} bot ready!\n`);
        
    } catch (error) {
        console.log(`❌ Error starting bot: ${error.message}`);
        console.log(`💡 Retrying in 3 seconds...`);
        setTimeout(() => startBot(userNumber), 3000);
    }
}

// ============================================
// ===== MAIN MENU =====
// ============================================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log(`╔══════════════════════════════════════╗
║        🤖 VELDRIX BOT              ║
╠══════════════════════════════════════╣
║                                    ║
║  📌 FEATURES                      ║
║  ├ WhatsApp Multi-User Support    ║
║  ├ Pairing Code System            ║
║  ├ Auto-Reconnection              ║
║  ├ Group Welcome/Goodbye          ║
║  ├ Command System                 ║
║  └ Anti-Ban Protection            ║
║                                    ║
║  🌐 Type: Public Bot              ║
║  🛡️ Status: Protected             ║
║                                    ║
╚══════════════════════════════════════╝\n`);

function showMenu() {
    console.log(`╔══════════════════════════════════════╗
║           📋 OPTIONS               ║
╠══════════════════════════════════════╣
║                                    ║
║  1️⃣ Add new user                  ║
║  2️⃣ Show active users             ║
║  3️⃣ Show pairing codes            ║
║  4️⃣ Remove user                   ║
║  5️⃣ Show status                   ║
║  6️⃣ Exit                          ║
║                                    ║
╚══════════════════════════════════════╝`);
}

function askForUser() {
    showMenu();
    
    rl.question("\n👉 Choose option (1-6): ", async (choice) => {
        if (choice === '1') {
            rl.question("📱 Enter phone number (255xxxxxxxxx): ", async (number) => {
                number = number.replace(/[^0-9]/g, '');
                
                if (!number || number.length < 5) {
                    console.log(`❌ Invalid number! Must be at least 5 digits.`);
                    askForUser();
                    return;
                }

                if (sessions.has(number)) {
                    console.log(`ℹ️ ${number} is already connected`);
                    askForUser();
                    return;
                }

                console.log(`\n🔄 Setting up ${number}...`);
                await startBot(number);
                
                setTimeout(askForUser, 2000);
            });
            return;
        }

        if (choice === '2') {
            console.log(`\n╔══════════════════════════════════════╗
║        👥 ACTIVE USERS           ║
╠══════════════════════════════════════╣`);
            if (activeUsers.size === 0) {
                console.log(`║  ❌ No active users                ║`);
            } else {
                activeUsers.forEach((data, user) => {
                    console.log(`║  ✅ ${user}                        ║`);
                    console.log(`║     Connected: ${data.connectedAt}  ║`);
                });
            }
            console.log(`╠══════════════════════════════════════╣
║  Total: ${activeUsers.size} users           ║
╚══════════════════════════════════════╝`);
            setTimeout(askForUser, 3000);
            return;
        }

        if (choice === '3') {
            console.log(`\n╔══════════════════════════════════════╗
║        🔑 PAIRING CODES           ║
╠══════════════════════════════════════╣`);
            if (pairingCodes.size === 0) {
                console.log(`║  ❌ No pairing codes available     ║`);
            } else {
                pairingCodes.forEach((data, user) => {
                    const expired = Date.now() > data.expires;
                    console.log(`║  ${expired ? '⏰' : '✅'} ${user}: ${data.code}  ║`);
                    console.log(`║     ${expired ? 'EXPIRED' : 'Valid'}                  ║`);
                });
            }
            console.log(`╚══════════════════════════════════════╝`);
            setTimeout(askForUser, 3000);
            return;
        }

        if (choice === '4') {
            rl.question("📱 Enter number to remove: ", async (number) => {
                number = number.replace(/[^0-9]/g, '');
                
                if (sessions.has(number)) {
                    sessions.delete(number);
                    activeUsers.delete(number);
                    pairin
