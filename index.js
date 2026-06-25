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
// ===== ANTI-BAN SYSTEM =====
// ============================================

class AntiBanSystem {
    constructor() {
        this.deviceFingerprints = [
            {
                appVersion: '2.24.8.78',
                os: 'Android',
                device: 'SM-G998B',
                platform: 'chrome',
                browserVersion: '120.0.6099.230'
            },
            {
                appVersion: '2.24.9.80',
                os: 'iOS',
                device: 'iPhone14,2',
                platform: 'safari',
                browserVersion: '16.5.1'
            },
            {
                appVersion: '2.24.7.75',
                os: 'Android',
                device: 'Pixel 6 Pro',
                platform: 'chrome',
                browserVersion: '119.0.6045.163'
            }
        ];

        this.conversations = new Map();
        this.activityLog = [];
    }

    getDeviceFingerprint() {
        const fp = this.deviceFingerprints[Math.floor(Math.random() * this.deviceFingerprints.length)];
        return {
            ...fp,
            browserVersion: `${Math.floor(Math.random() * 50) + 100}.0.${Math.floor(Math.random() * 5000)}.${Math.floor(Math.random() * 100)}`
        };
    }

    async humanDelay(type = 'typing') {
        const delays = {
            typing: 800 + Math.random() * 3500,
            reading: 1500 + Math.random() * 5000,
            reaction: 300 + Math.random() * 1200,
            send: 500 + Math.random() * 2500
        };
        const delay = delays[type] || 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    getKeepAliveInterval() {
        return 15000 + Math.random() * 10000;
    }
}

// ============================================
// ===== RATE LIMITER =====
// ============================================

class RateLimiter {
    constructor() {
        this.limits = {
            minute: { count: 0, reset: Date.now(), max: 10 },
            hour: { count: 0, reset: Date.now(), max: 50 },
            groups: { count: 0, reset: Date.now(), max: 5 }
        };
        this.locked = false;
        this.lockUntil = 0;
    }

    canSend(type = 'message') {
        const now = Date.now();
        
        if (this.locked && now < this.lockUntil) {
            return false;
        }
        
        ['minute', 'hour', 'groups'].forEach(key => {
            const limit = this.limits[key];
            const resetTime = key === 'minute' ? 60000 : key === 'hour' ? 3600000 : 3600000;
            if (now - limit.reset > resetTime) {
                limit.count = 0;
                limit.reset = now;
            }
        });

        const limit = this.limits[type === 'group' ? 'groups' : 'minute'];
        if (limit.count >= limit.max) {
            this.lock(30000);
            return false;
        }

        limit.count++;
        this.limits.hour.count++;
        return true;
    }

    lock(duration) {
        this.locked = true;
        this.lockUntil = Date.now() + duration;
        setTimeout(() => { this.locked = false; }, duration);
    }

    getStatus() {
        return {
            minute: `${this.limits.minute.count}/${this.limits.minute.max}`,
            hour: `${this.limits.hour.count}/${this.limits.hour.max}`,
            groups: `${this.limits.groups.count}/${this.limits.groups.max}`,
            locked: this.locked
        };
    }
}

// ============================================
// ===== BOT STATE =====
// ============================================

const antiBan = new AntiBanSystem();
const rateLimiter = new RateLimiter();
const sessions = new Map();
const activeUsers = new Map();
const pairingCodes = new Map();

// ============================================
// ===== START BOT - FIXED VERSION =====
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
        
        const fingerprint = antiBan.getDeviceFingerprint();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ 
                level: 'silent',
                stream: { write: () => {} }
            }),
            printQRInTerminal: false,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: antiBan.getKeepAliveInterval(),
            syncFullHistory: false,
            markOnlineOnConnect: true,
            browser: [
                `WhatsApp Bot ${fingerprint.appVersion}`,
                fingerprint.platform,
                fingerprint.browserVersion
            ],
            userAgent: `Mozilla/5.0 (${fingerprint.os}; ${fingerprint.device}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fingerprint.browserVersion} Safari/537.36`
        });

        sock.ev.on("creds.update", saveCreds);

        // ===== CONNECTION HANDLER =====
        sock.ev.on("connection.update", (update) => {
            const { connection, lastDisconnect } = update;

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
                activeUsers.delete(userNumber);
                
                if (statusCode !== 401) {
                    console.log(`♻ Reconnecting ${userNumber} in 5 seconds...`);
                    setTimeout(() => startBot(userNumber), 5000);
                } else {
                    console.log(`❌ ${userNumber} needs re-pairing. Please add again.`);
                    activeUsers.delete(userNumber);
                    sessions.delete(userNumber);
                }
            }
        });

        // ===== PAIRING CODE - FIXED =====
        if (!sock.authState.creds.registered) {
            try {
                console.log(`📱 Requesting pairing code for ${userNumber}...`);
                
                // Wait for socket to be ready
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const code = await sock.requestPairingCode(userNumber);
                
                if (code) {
                    console.log(`\n🔑 ==================================`);
                    console.log(`🔑 PAIRING CODE for ${userNumber}: ${code}`);
                    console.log(`🔑 ==================================`);
                    console.log(`📱 Ask user to go to WhatsApp → Linked Devices → Link with code\n`);
                    
                    pairingCodes.set(userNumber, {
                        code: code,
                        timestamp: Date.now(),
                        expires: Date.now() + 300000 // 5 minutes
                    });
                } else {
                    console.log(`❌ No pairing code received for ${userNumber}`);
                }
            } catch (e) {
                console.log(`❌ Pairing error for ${userNumber}: ${e.message}`);
                console.log(`💡 Try again or check internet connection.`);
            }
        } else {
            console.log(`✅ ${userNumber} is already paired and connected!`);
            activeUsers.set(userNumber, { 
                status: 'connected', 
                connectedAt: new Date().toISOString(),
                socket: sock 
            });
        }

        // ===== GROUP PARTICIPANTS =====
        sock.ev.on("group-participants.update", async (data) => {
            try {
                if (!rateLimiter.canSend('group')) return;

                if (data.action === "add") {
                    for (let user of data.participants) {
                        await antiBan.humanDelay('reading');
                        await sock.sendMessage(data.id, {
                            text: `👋 Welcome @${user.split("@")[0]}`,
                            mentions: [user]
                        });
                        await antiBan.humanDelay('send');
                    }
                }

                if (data.action === "remove") {
                    for (let user of data.participants) {
                        await antiBan.humanDelay('reaction');
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
                if (!rateLimiter.canSend('message')) {
                    await sock.sendMessage(jid, { text: "⏳ Rate limit reached. Please wait a moment." });
                    return;
                }

                await sock.sendPresenceUpdate("composing", jid);
                await antiBan.humanDelay('typing');

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
                    const status = rateLimiter.getStatus();
                    
                    await sock.sendMessage(jid, {
                        text: `📊 BOT STATUS
├ Active Users: ${totalUsers}
├ Uptime: ${hours}h ${minutes}m
├─────────────────
├ 📊 RATE LIMITS
│  ├ Minute: ${status.minute}
│  ├ Hour: ${status.hour}
│  └ Groups: ${status.groups}
└ 🔒 Locked: ${status.locked ? 'Yes' : 'No'}`
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
├ Created: ${new Date(meta.creation * 1000).toLocaleDateString()}
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
                            text: `⚠️ Group has ${mentions.length} members. Max 15 tags allowed for safety.`
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
        console.log(`✅ ${userNumber} bot started successfully!`);
        
    } catch (error) {
        console.log(`❌ Error starting bot for ${userNumber}: ${error.message}`);
        console.log(`💡 Please try again or check your internet connection.`);
    }
}

// ============================================
// ===== MAIN MENU =====
// ============================================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("🛡️ VELDRIX BOT - Advanced Anti-Ban");
console.log("=========================================");
console.log("📌 Features:");
console.log("  • Advanced anti-ban protection");
console.log("  • Human-like behavior patterns");
console.log("  • Random device fingerprints");
console.log("  • Smart rate limiting");
console.log("  • Auto-reconnection");
console.log("=========================================\n");

function showMenu() {
    console.log("\n📋 Options:");
    console.log("  1. Add new user");
    console.log("  2. Show active users");
    console.log("  3. Show pairing codes");
    console.log("  4. Remove user");
    console.log("  5. Show rate limit status");
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
                    console.log("❌ Invalid number! Must be at least 5 digits.");
                    askForUser();
                    return;
                }

                if (sessions.has(number)) {
                    console.log(`ℹ️ ${number} is already connected`);
                    askForUser();
                    return;
                }

                console.log(`🔄 Connecting ${number}...`);
                console.log(`⏳ Please wait, this may take a few seconds...`);
                await startBot(number);
                console.log(`✅ ${number} added!`);
                
                // Show pairing code if available
                if (pairingCodes.has(number)) {
                    const data = pairingCodes.get(number);
                    console.log(`\n🔑 PAIRING CODE: ${data.code}`);
                    console.log(`⏰ Valid for 5 minutes\n`);
                }
                
                setTimeout(askForUser, 3000);
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
            const status = rateLimiter.getStatus();
            console.log("\n📊 Rate Limit Status:");
            console.log(`  • Per Minute: ${status.minute}`);
            console.log(`  • Per Hour: ${status.hour}`);
            console.log(`  • Groups: ${status.groups}`);
            console.log(`  • Locked: ${status.locked ? 'Yes' : 'No'}`);
            console.log(`  • Active Sessions: ${sessions.size}`);
            setTimeout(askForUser, 3000);
            return;
        }

        if (choice === '6') {
            console.log("👋 Goodbye! Shutting down...");
            rl.close();
            process.exit(0);
        }

        console.log("❌ Invalid option! Please choose 1-6.");
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

process.on('exit', () => {
    console.log("🛑 Bot stopped");
});
