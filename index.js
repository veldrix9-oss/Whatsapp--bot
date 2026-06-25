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
// ===== CONFIGURATION =====
// ============================================

const config = {
    antiBan: {
        enabled: true,
        messagesPerMinute: 8,
        messagesPerHour: 40,
        groupsPerHour: 5,
        newChatsPerHour: 5,
        tagAllLimit: 15
    },
    autoReply: {
        enabled: true,
        delayMin: 1000,
        delayMax: 5000,
        typingDuration: 2000,
        offlineMessage: "🔵 I'm currently offline. Will reply when back!"
    },
    status: {
        autoReact: true,
        reactEmojis: ['⚡', '👍', '👀', '✨', '🔥', '❤️', '💪', '🤖'],
        changeStatus: true,
        statusInterval: 300000 // 5 minutes
    },
    humanBehavior: {
        typingSpeed: { min: 800, max: 3500 },
        readingTime: { min: 1500, max: 5000 },
        reactionDelay: { min: 300, max: 1200 },
        sendDelay: { min: 500, max: 2500 },
        typoChance: 0.03,
        breakChance: 0.05,
        breakDuration: { min: 60000, max: 180000 }
    }
};

// ============================================
// ===== BOT STATE =====
// ============================================

const sessions = new Map();
const activeUsers = new Map();
const pairingCodes = new Map();
const pendingUsers = new Map();
const offlineMessages = new Map();
const rateLimits = {
    minute: { count: 0, reset: Date.now() },
    hour: { count: 0, reset: Date.now() },
    groups: { count: 0, reset: Date.now() }
};

let botStatus = {
    online: true,
    lastActivity: Date.now(),
    totalMessages: 0,
    totalUsers: 0
};

// ============================================
// ===== ANTI-BAN SYSTEM =====
// ============================================

class AntiBanSystem {
    constructor() {
        this.deviceFingerprints = [
            { appVersion: '2.24.8.78', os: 'Android', device: 'SM-G998B', platform: 'chrome', browserVersion: '120.0.6099.230' },
            { appVersion: '2.24.9.80', os: 'iOS', device: 'iPhone14,2', platform: 'safari', browserVersion: '16.5.1' },
            { appVersion: '2.24.7.75', os: 'Android', device: 'Pixel 6 Pro', platform: 'chrome', browserVersion: '119.0.6045.163' },
            { appVersion: '2.24.10.82', os: 'Windows', device: 'Windows 11', platform: 'firefox', browserVersion: '121.0.1' }
        ];
        this.conversations = new Map();
        this.breaks = [];
    }

    getDeviceFingerprint() {
        const fp = this.deviceFingerprints[Math.floor(Math.random() * this.deviceFingerprints.length)];
        return {
            ...fp,
            browserVersion: `${Math.floor(Math.random() * 50) + 100}.0.${Math.floor(Math.random() * 5000)}.${Math.floor(Math.random() * 100)}`
        };
    }

    canSend(type = 'message') {
        const now = Date.now();
        
        ['minute', 'hour', 'groups'].forEach(key => {
            const limit = rateLimits[key];
            const resetTime = key === 'minute' ? 60000 : key === 'hour' ? 3600000 : 3600000;
            if (now - limit.reset > resetTime) {
                limit.count = 0;
                limit.reset = now;
            }
        });

        const maxKey = type === 'group' ? 'groupsPerHour' : 'messagesPerMinute';
        const maxValue = type === 'group' ? config.antiBan.groupsPerHour : config.antiBan.messagesPerMinute;
        
        if (rateLimits[type === 'group' ? 'groups' : 'minute'].count >= maxValue) {
            return false;
        }

        rateLimits[type === 'group' ? 'groups' : 'minute'].count++;
        rateLimits.hour.count++;
        return true;
    }

    async humanDelay(type = 'typing') {
        const delays = {
            typing: config.humanBehavior.typingSpeed,
            reading: config.humanBehavior.readingTime,
            reaction: config.humanBehavior.reactionDelay,
            send: config.humanBehavior.sendDelay
        };
        const d = delays[type] || config.humanBehavior.sendDelay;
        const delay = d.min + Math.random() * (d.max - d.min);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    addTypo(text) {
        if (Math.random() > config.humanBehavior.typoChance) return text;
        
        const typoMap = {
            'e': ['3', 'r', 'w'],
            'a': ['q', 's', 'z'],
            'i': ['u', 'o', 'p'],
            'o': ['i', 'p', 'l'],
            't': ['r', 'g', 'y'],
            'n': ['b', 'm', 'h'],
            's': ['a', 'd', 'z'],
            'h': ['j', 'g', 'n']
        };
        
        const chars = text.split('');
        for (let i = 0; i < chars.length; i++) {
            if (Math.random() < 0.02 && typoMap[chars[i].toLowerCase()]) {
                const typos = typoMap[chars[i].toLowerCase()];
                chars[i] = typos[Math.floor(Math.random() * typos.length)];
                break;
            }
        }
        return chars.join('');
    }

    shouldTakeBreak() {
        return Math.random() < config.humanBehavior.breakChance;
    }

    getBreakDuration() {
        return config.humanBehavior.breakDuration.min + 
               Math.random() * (config.humanBehavior.breakDuration.max - config.humanBehavior.breakDuration.min);
    }
}

// ============================================
// ===== AUTO-REPLY SYSTEM =====
// ============================================

class AutoReplySystem {
    constructor() {
        this.responses = new Map();
        this.offlineMode = false;
        this.timer = null;
        this.autoResponses = [
            "I'll get back to you shortly! 😊",
            "Thanks for your message! I'll reply soon. 📱",
            "Hey there! I'm currently busy but will respond ASAP. ⏰",
            "Message received! Will respond when available. 💬",
            "Hi! I'm not available right now, but will reply later. 👋"
        ];
        this.commandResponses = {
            '.menu': '📋 Menu command received! Type .help for available commands.',
            '.ping': '🏓 Pong! I\'m online and working!',
            '.owner': '👑 Bot Owner: Veldrix',
            '.status': '📊 Bot is running smoothly!',
            '.help': '🆘 Type .menu to see all commands.'
        };
    }

    setOfflineMode(enabled, userNumber) {
        this.offlineMode = enabled;
        if (enabled) {
            console.log(`📱 ${userNumber} set to OFFLINE MODE - Auto-reply active`);
        } else {
            console.log(`📱 ${userNumber} set to ONLINE MODE - Manual reply active`);
        }
    }

    getAutoReply(message) {
        const command = message.toLowerCase();
        if (this.commandResponses[command]) {
            return this.commandResponses[command];
        }
        return this.autoResponses[Math.floor(Math.random() * this.autoResponses.length)];
    }

    shouldAutoReply() {
        return this.offlineMode || Math.random() < 0.3;
    }
}

// ============================================
// ===== START BOT =====
// ============================================

const antiBan = new AntiBanSystem();
const autoReply = new AutoReplySystem();

async function startBot(userNumber) {
    try {
        console.log(`\n🔄 Setting up ${userNumber}...`);
        
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
            keepAliveIntervalMs: 15000 + Math.random() * 10000,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            browser: ['WhatsApp Bot', fingerprint.platform, fingerprint.browserVersion],
            connectTimeoutMs: 60000,
            emitOwnEvents: true,
            generateHighQualityLinkPreview: false,
            patchMessageBeforeSending: (message) => {
                return new Promise(resolve => {
                    setTimeout(() => resolve(message), Math.random() * 200);
                });
            }
        });

        sock.ev.on("creds.update", saveCreds);

        // ===== CONNECTION HANDLER =====
        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log(`📱 QR Code received for ${userNumber}`);
            }

            if (connection === "open") {
                console.log(`\n╔══════════════════════════════════════╗`);
                console.log(`║         ✅ CONNECTED!               ║`);
                console.log(`╠══════════════════════════════════════╣`);
                console.log(`║  📱 ${userNumber}                    ║`);
                console.log(`║  ✅ WhatsApp Linked Successfully    ║`);
                console.log(`╚══════════════════════════════════════╝\n`);
                
                activeUsers.set(userNumber, { 
                    status: 'connected', 
                    connectedAt: new Date().toISOString(),
                    socket: sock,
                    offlineMode: false
                });
                botStatus.totalUsers = activeUsers.size;
                
                try {
                    await sock.sendMessage(userNumber + '@s.whatsapp.net', {
                        text: `╔══════════════════════════════════════╗
║         🤖 VELDRIX BOT           ║
╠══════════════════════════════════════╣
║                                    ║
║  ✅ CONNECTED SUCCESSFULLY         ║
║                                    ║
║  📋 COMMANDS:                     ║
║  ├ .menu   - Show menu           ║
║  ├ .ping   - Test bot            ║
║  ├ .owner  - Bot owner           ║
║  ├ .status - Bot status          ║
║  ├ .groupinfo - Group info       ║
║  ├ .tagall - Tag members         ║
║  ├ .help   - Help menu           ║
║  ├ .offline - Toggle offline mode║
║  └ .antiban - Anti-ban status    ║
║                                    ║
║  🛡️ Anti-Ban: Active              ║
║  🌐 Type: Public Bot              ║
║                                    ║
╚══════════════════════════════════════╝`
                    });
                    console.log(`📨 Welcome message sent to ${userNumber}`);
                } catch (e) {
                    console.log(`⚠️ Could not send welcome message: ${e.message}`);
                }
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`\n⚠️ ${userNumber} Disconnected (Code: ${statusCode})`);
                
                if (statusCode === 401) {
                    console.log(`📱 ${userNumber} needs re-pairing.`);
                    activeUsers.delete(userNumber);
                    setTimeout(() => {
                        console.log(`🔄 Re-pairing ${userNumber}...`);
                        startBot(userNumber);
                    }, 3000);
                } else {
                    activeUsers.delete(userNumber);
                    console.log(`♻ Reconnecting ${userNumber} in 5 seconds...`);
                    setTimeout(() => startBot(userNumber), 5000);
                }
            }
        });

        // ===== PAIRING CODE =====
        if (sock.authState.creds.registered) {
            console.log(`✅ ${userNumber} is already paired!`);
            activeUsers.set(userNumber, { 
                status: 'connected', 
                connectedAt: new Date().toISOString(),
                socket: sock,
                offlineMode: false
            });
        } else {
            console.log(`📱 Requesting pairing code for ${userNumber}...`);
            
            try {
                await new Promise(resolve => setTimeout(resolve, 3000));
                const code = await sock.requestPairingCode(userNumber);
                
                if (code) {
                    console.log(`\n╔══════════════════════════════════════╗`);
                    console.log(`║         🔑 PAIRING CODE              ║`);
                    console.log(`╠══════════════════════════════════════╣`);
                    console.log(`║  📱 ${userNumber}                    ║`);
                    console.log(`║  🔑 Code: ${code}                    ║`);
                    console.log(`╠══════════════════════════════════════╣`);
                    console.log(`║  📱 Open WhatsApp on phone          ║`);
                    console.log(`║  ➜ Linked Devices                  ║`);
                    console.log(`║  ➜ Link with code                  ║`);
                    console.log(`║  ➜ Enter this code                 ║`);
                    console.log(`║  ⏰ Expires in 5 minutes            ║`);
                    console.log(`╚══════════════════════════════════════╝\n`);
                    
                    pairingCodes.set(userNumber, { code, timestamp: Date.now(), expires: Date.now() + 300000 });
                    pendingUsers.set(userNumber, { code, timestamp: Date.now(), socket: sock });
                    
                    console.log(`⏳ Waiting for ${userNumber} to link WhatsApp...`);
                    console.log(`💡 The bot will auto-detect when linked!\n`);
                    
                    let attempts = 0;
                    const maxAttempts = 60;
                    
                    const checkConnection = setInterval(async () => {
                        attempts++;
                        if (sock.authState.creds.registered) {
                            console.log(`\n╔══════════════════════════════════════╗`);
                            console.log(`║         ✅ LINKED!                  ║`);
                            console.log(`╠══════════════════════════════════════╣`);
                            console.log(`║  📱 ${userNumber}                    ║`);
                            console.log(`║  ✅ WhatsApp linked successfully    ║`);
                            console.log(`╚══════════════════════════════════════╝\n`);
                            
                            activeUsers.set(userNumber, { 
                                status: 'connected', 
                                connectedAt: new Date().toISOString(),
                                socket: sock,
                                offlineMode: false
                            });
                            pendingUsers.delete(userNumber);
                            clearInterval(checkConnection);
                            
                            try {
                                await sock.sendMessage(userNumber + '@s.whatsapp.net', {
                                    text: `✅ VELDRIX BOT CONNECTED!\n\nCommands:\n.menu - Show menu\n.ping - Test bot\n.owner - Bot owner\n.status - Bot status\n.offline - Toggle offline mode`
                                });
                            } catch (e) {}
                        } else if (attempts >= maxAttempts) {
                            console.log(`\n⏰ Pairing timeout for ${userNumber}. Please try again.\n`);
                            pendingUsers.delete(userNumber);
                            clearInterval(checkConnection);
                        }
                    }, 5000);
                }
            } catch (e) {
                console.log(`❌ Pairing error: ${e.message}`);
                setTimeout(() => startBot(userNumber), 5000);
            }
        }

        // ===== GROUP PARTICIPANTS =====
        sock.ev.on("group-participants.update", async (data) => {
            try {
                if (!antiBan.canSend('group')) return;

                if (data.action === "add") {
                    for (let user of data.participants) {
                        await antiBan.humanDelay('reading');
                        const text = antiBan.addTypo(`👋 Welcome @${user.split("@")[0]}`);
                        await sock.sendMessage(data.id, { text, mentions: [user] });
                        await antiBan.humanDelay('send');
                    }
                }

                if (data.action === "remove") {
                    for (let user of data.participants) {
                        await antiBan.humanDelay('reaction');
                        const text = antiBan.addTypo(`😢 Goodbye @${user.split("@")[0]}`);
                        await sock.sendMessage(data.id, { text, mentions: [user] });
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
            let text = message?.conversation || message?.extendedTextMessage?.text || "";
            text = text.trim();
            const command = text.toLowerCase();

            console.log(`📨 ${userNumber}: ${text}`);

            try {
                if (!antiBan.canSend('message')) {
                    await sock.sendMessage(jid, { text: "⏳ Rate limit reached. Please wait a moment." });
                    return;
                }

                // ===== CHECK OFFLINE MODE =====
                const userData = activeUsers.get(userNumber);
                if (userData && userData.offlineMode) {
                    await sock.sendPresenceUpdate("unavailable", jid);
                    await sock.sendMessage(jid, { 
                        text: `🔵 I'm currently offline. ${autoReply.getAutoReply(text)}` 
                    });
                    return;
                }

                // ===== HUMAN BEHAVIOR =====
                await sock.sendPresenceUpdate("composing", jid);
                await antiBan.humanDelay('typing');
                await sock.sendPresenceUpdate("paused", jid);
                await antiBan.humanDelay('reading');

                // ===== AUTO REACTION =====
                if (config.status.autoReact && Math.random() < 0.3) {
                    await antiBan.humanDelay('reaction');
                    const emoji = config.status.reactEmojis[Math.floor(Math.random() * config.status.reactEmojis.length)];
                    await sock.sendMessage(jid, { react: { text: emoji, key: msg.key } });
                }

                // ===== COMMANDS =====
                if (command === ".menu") {
                    await sock.sendMessage(jid, {
                        text: `╔══════════════════════════════════════╗
║          🤖 VELDRIX BOT           ║
╠══════════════════════════════════════╣
║                                    ║
║  📋 AVAILABLE COMMANDS             ║
║                                    ║
║  🟢 .menu     - Show menu         ║
║  🟢 .ping     - Test bot          ║
║  🟢 .owner    - Bot owner         ║
║  🟢 .status   - Bot status        ║
║  🟢 .groupinfo- Group info        ║
║  🟢 .tagall   - Tag members       ║
║  🟢 .help     - Help menu         ║
║  🟢 .offline  - Toggle offline    ║
║  🟢 .antiban  - Anti-ban status   ║
║  🟢 .react    - Auto-react toggle ║
║  
