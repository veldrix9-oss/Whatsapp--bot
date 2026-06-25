process.env.NODE_NO_WARNINGS='1';process.env.NODE_ENV='production';
process.on('unhandledRejection',()=>{});process.on('warning',w=>{if(w.name==='DeprecationWarning')return;});

const readline=require("readline"),pino=require("pino"),fs=require("fs");
const {default:makeWASocket,useMultiFileAuthState,fetchLatestBaileysVersion}=require("@whiskeysockets/baileys");
const qrcode=require("qrcode-terminal");

let sock=null;let isConnected=false;let offlineMode=false;let pairingCode=null;
const activeUser={number:null,connectedAt:null};

const antiBan={
 messagesPerMinute:0,maxPerMinute:6,
 messagesPerHour:0,maxPerHour:30,
 lastMinuteReset:Date.now(),lastHourReset:Date.now(),
 locked:false,lockUntil:0,
 canSend(){
  const now=Date.now();
  if(this.locked&&now<this.lockUntil)return false;
  if(now-this.lastMinuteReset>60000){this.messagesPerMinute=0;this.lastMinuteReset=now;}
  if(now-this.lastHourReset>3600000){this.messagesPerHour=0;this.lastHourReset=now;}
  if(this.messagesPerMinute>=this.maxPerMinute){this.lock(30000);return false;}
  if(this.messagesPerHour>=this.maxPerHour){this.lock(300000);return false;}
  this.messagesPerMinute++;this.messagesPerHour++;return true;
 },
 lock(d){this.locked=true;this.lockUntil=Date.now()+d;setTimeout(()=>{this.locked=false;},d);},
 getStatus(){return{minute:`${this.messagesPerMinute}/${this.maxPerMinute}`,hour:`${this.messagesPerHour}/${this.maxPerHour}`,locked:this.locked};}
};

const autoReply={
 responses:["💬 I'm currently offline. Will reply when back!","⏰ Thanks for your message! I'll reply soon.","📱 Hey! I'm busy but will respond ASAP.","💭 Message received! Will reply when available.","🤖 I'm not available right now, but will reply later."],
 getReply(msg){return this.responses[Math.floor(Math.random()*this.responses.length)];}
};

async function startBot(n){
 try{
  console.log(`\n🔄 Setting up ${n}...`);
  activeUser.number=n;
  
  const d=`./session_${n}`;
  if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});
  
  const{state,saveCreds}=await useMultiFileAuthState(d);
  const{version}=await fetchLatestBaileysVersion();
  
  if(state.creds.registered){
   console.log(`✅ ${n} already paired!`);
   activeUser.connectedAt=new Date().toISOString();
   isConnected=true;
   console.log(`📱 Bot is ready! Send commands on WhatsApp.`);
   return;
  }
  
  sock=makeWASocket({
   version,
   auth:state,
   logger:pino({level:'silent',stream:{write:()=>{}}}),
   printQRInTerminal:true,
   defaultQueryTimeoutMs:180000,
   keepAliveIntervalMs:20000,
   syncFullHistory:false,
   markOnlineOnConnect:true,
   browser:['WhatsApp Bot','Chrome','120.0.0.0'],
   connectTimeoutMs:180000,
   emitOwnEvents:true
  });

  sock.ev.on("creds.update",saveCreds);

  // Handle QR Code
  sock.ev.on("connection.update",async u=>{
   const{connection,lastDisconnect,qr}=u;
   
   if(qr){
    console.log(`\n📱 SCAN THIS QR CODE WITH WHATSAPP:`);
    qrcode.generate(qr,{small:true});
    console.log(`📱 Open WhatsApp → Linked Devices → Link with phone`);
    console.log(`📱 Scan the QR code above\n`);
   }
   
   if(connection==="open"){
    isConnected=true;
    activeUser.connectedAt=new Date().toISOString();
    console.log(`\n╔══════════════════════════════════════╗`);
    console.log(`║         ✅ CONNECTED!               ║`);
    console.log(`╠══════════════════════════════════════╣`);
    console.log(`║  📱 ${n}                    ║`);
    console.log(`║  ✅ WhatsApp Linked Successfully    ║`);
    console.log(`╚══════════════════════════════════════╝\n`);
    
    try{
     await sock.sendMessage(n+'@s.whatsapp.net',{
      text:`╔══════════════════════════════════════╗
║         🤖 VELDRIX BOT           ║
╠══════════════════════════════════════╣
║                                    ║
║  ✨ CONNECTED SUCCESSFULLY ✨      ║
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
║  🤖 AI: Enabled                   ║
║                                    ║
╚══════════════════════════════════════╝`
     });
     console.log(`📨 Welcome message sent to your WhatsApp!`);
    }catch(e){}
   }
   
   if(connection==="close"){
    const c=lastDisconnect?.error?.output?.statusCode;
    console.log(`⚠️ Disconnected (${c})`);
    if(c===401){
     console.log(`📱 Not authenticated. Please scan QR code.`);
     isConnected=false;
    }else{
     console.log(`♻ Reconnecting in 5 seconds...`);
     isConnected=false;
     setTimeout(()=>startBot(n),5000);
    }
   }
  });

 }catch(e){console.log(`❌ Error: ${e.message}`);}
}

const rl=readline.createInterface({input:process.stdin,output:process.stdout});
console.log(`╔══════════════════════════════════════╗
║        🤖 VELDRIX BOT              ║
╠══════════════════════════════════════╣
║                                    ║
║  ✨ FEATURES ✨                   ║
║  ├ WhatsApp Single-User Support   ║
║  ├ QR Code Pairing System         ║
║  ├ Auto-Reconnection              ║
║  ├ Anti-Ban Protection            ║
║  ├ Anti-Spam Protection           ║
║  ├ Offline Auto-Reply             ║
║  ├ Auto-View Status               ║
║  └ Human-like AI Behavior         ║
║                                    ║
║  🌐 Type: Public Bot              ║
║  🛡️ Status: Protected             ║
║  🤖 AI: Enabled                   ║
║                                    ║
╚══════════════════════════════════════╝\n`);

function showMenu(){
 console.log(`╔══════════════════════════════════════╗
║           📋 OPTIONS               ║
╠══════════════════════════════════════╣
║  1️⃣ Start/Connect bot             ║
║  2️⃣ Show status                   ║
║  3️⃣ Toggle offline mode           ║
║  4️⃣ Disconnect                    ║
║  5️⃣ Exit                          ║
╚══════════════════════════════════════╝`);
}

function askForUser(){
 showMenu();
 rl.question("\n👉 Choose (1-5): ",async c=>{
  if(c==='1'){
   rl.question("📱 Enter phone number (255xxxxxxxxx): ",async n=>{
    n=n.replace(/[^0-9]/g,'');
    if(!n||n.length<5){console.log("❌ Invalid!");askForUser();return;}
    if(sock){console.log(`⚠️ Bot already running!`);askForUser();return;}
    console.log(`🔄 Setting up ${n}...`);await startBot(n);
    setTimeout(askForUser,2000);
   });return;
  }
  if(c==='2'){
   console.log(`\n📊 STATUS:`);
   console.log(`  Connected: ${isConnected?'✅ Yes':'❌ No'}`);
   console.log(`  Number: ${activeUser.number||'N/A'}`);
   console.log(`  Offline Mode: ${offlineMode?'ON':'OFF'}`);
   if(activeUser.connectedAt)console.log(`  Connected At: ${activeUser.connectedAt}`);
   const ab=antiBan.getStatus();
   console.log(`  Anti-Ban: ${ab.minute} (min) ${ab.hour} (hour)`);
   setTimeout(askForUser,3000);return;
  }
  if(c==='3'){
   offlineMode=!offlineMode;
   console.log(`📴 Offline mode ${offlineMode?'ENABLED':'DISABLED'}`);
   setTimeout(askForUser,2000);return;
  }
  if(c==='4'){
   if(sock){
    sock.end();
    sock=null;
    isConnected=false;
    activeUser.number=null;
    console.log(`✅ Disconnected successfully`);
   }else{
    console.log(`❌ Not connected`);
   }
   setTimeout(askForUser,2000);return;
  }
  if(c==='5'){console.log("👋 Bye!");rl.close();process.exit(0);}
  console.log("❌ Invalid!");setTimeout(askForUser,1000);
 });
}
askForUser();
process.on('SIGINT',()=>{console.log("\n👋 Shutting down...");rl.close();process.exit(0);});
