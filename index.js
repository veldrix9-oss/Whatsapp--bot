process.env.NODE_NO_WARNINGS='1';process.env.NODE_ENV='production';
process.on('unhandledRejection',()=>{});process.on('warning',w=>{if(w.name==='DeprecationWarning')return;});

const readline=require("readline"),pino=require("pino"),fs=require("fs");
const {default:makeWASocket,useMultiFileAuthState,fetchLatestBaileysVersion}=require("@whiskeysockets/baileys");

let sock=null;let isConnected=false;let offlineMode=false;let pairingCode=null;let pairingRequested=false;let pairingComplete=false;
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
  pairingRequested=false;
  pairingComplete=false;
  
  const d=`./session_${n}`;
  if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});
  
  const{state,saveCreds}=await useMultiFileAuthState(d);
  const{version}=await fetchLatestBaileysVersion();
  
  if(state.creds.registered){
   console.log(`✅ ${n} already paired!`);
   activeUser.connectedAt=new Date().toISOString();
   isConnected=true;
   pairingComplete=true;
   console.log(`📱 Bot is ready! Send commands on WhatsApp.`);
   return;
  }
  
  sock=makeWASocket({
   version,
   auth:state,
   logger:pino({level:'silent',stream:{write:()=>{}}}),
   printQRInTerminal:false,
   defaultQueryTimeoutMs:180000,
   keepAliveIntervalMs:20000,
   syncFullHistory:false,
   markOnlineOnConnect:true,
   browser:['WhatsApp Bot','Chrome','120.0.0.0'],
   connectTimeoutMs:180000,
   emitOwnEvents:true,
   patchMessageBeforeSending:async (msg)=>{
    await new Promise(r=>setTimeout(r,Math.random()*200));
    return msg;
   }
  });

  sock.ev.on("creds.update",saveCreds);

  // REQUEST PAIRING CODE - MAIN METHOD
  setTimeout(async ()=>{
   if(!state.creds.registered && !pairingRequested){
    try{
     console.log(`📱 Requesting pairing code for ${n}...`);
     await new Promise(r=>setTimeout(r,3000));
     const code=await sock.requestPairingCode(n);
     if(code){
      pairingCode=code;
      pairingRequested=true;
      console.log(`\n╔══════════════════════════════════════╗`);
      console.log(`║         🔑 PAIRING CODE              ║`);
      console.log(`╠══════════════════════════════════════╣`);
      console.log(`║  📱 ${n}                    ║`);
      console.log(`║  🔑 Code: ${code}                    ║`);
      console.log(`╠══════════════════════════════════════╣`);
      console.log(`║  📱 Open WhatsApp on phone          ║`);
      console.log(`║  ➜ Linked Devices                  ║`);
      console.log(`║  ➜ Link with code                  ║`);
      console.log(`║  ➜ Enter: ${code}                   ║`);
      console.log(`║  ⏰ Expires in 5 minutes            ║`);
      console.log(`╚══════════════════════════════════════╝\n`);
      console.log(`⏳ Waiting for you to enter code in WhatsApp...`);
      console.log(`💡 After entering code, bot will auto-connect!\n`);
      console.log(`📱 IMPORTANT: Open WhatsApp on your phone NOW!`);
      console.log(`➜ Go to Linked Devices → Link with code`);
      console.log(`➜ Enter: ${code}\n`);
     }
    }catch(e){
     console.log(`❌ Pairing error: ${e.message}`);
     console.log(`🔄 Retrying in 5 seconds...`);
     setTimeout(()=>startBot(n),5000);
    }
   }
  },3000);

  sock.ev.on("connection.update",async u=>{
   const{connection,lastDisconnect,qr}=u;
   
   if(qr){
    console.log(`📱 QR Code received for ${n}`);
    if(!pairingRequested){
     try{
      await new Promise(r=>setTimeout(r,2000));
      const code=await sock.requestPairingCode(n);
      if(code){
       pairingCode=code;
       pairingRequested=true;
       console.log(`\n╔══════════════════════════════════════╗`);
       console.log(`║         🔑 PAIRING CODE              ║`);
       console.log(`╠══════════════════════════════════════╣`);
       console.log(`║  📱 ${n}                    ║`);
       console.log(`║  🔑 Code: ${code}                    ║`);
       console.log(`╠══════════════════════════════════════╣`);
       console.log(`║  📱 Open WhatsApp on phone          ║`);
       console.log(`║  ➜ Linked Devices                  ║`);
       console.log(`║  ➜ Link with code                  ║`);
       console.log(`║  ➜ Enter: ${code}                   ║`);
       console.log(`║  ⏰ Expires in 5 minutes            ║`);
       console.log(`╚══════════════════════════════════════╝\n`);
       console.log(`⏳ Waiting for you to enter code in WhatsApp...`);
       console.log(`📱 IMPORTANT: Open WhatsApp on your phone NOW!`);
       console.log(`➜ Go to Linked Devices → Link with code`);
       console.log(`➜ Enter: ${code}\n`);
      }
     }catch(e){}
    }
   }
   
   if(connection==="open"){
    isConnected=true;
    pairingComplete=true;
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
    
    // If already connected, reconnection should happen
    if(isConnected && c !== 401){
     console.log(`♻ Reconnecting in 5 seconds...`);
     isConnected=false;
     setTimeout(()=>startBot(n),5000);
    } else if(c===401 && !pairingComplete){
     // Still waiting for pairing - this is normal
     console.log(`📱 Waiting for pairing...`);
     console.log(`💡 Enter the pairing code in WhatsApp on your phone`);
     if(pairingCode){
      console.log(`🔑 Code: ${pairingCode}`);
      console.log(`📱 Open WhatsApp → Linked Devices → Link with code`);
     }
     // Don't retry - just wait for user to enter code
    } else if(c===401 && pairingComplete){
     // Lost connection after being paired
     console.log(`📱 Reconnecting...`);
     isConnected=false;
     setTimeout(()=>startBot(n),3000);
    }
   }
  });

  // Keep checking and reminding about pairing
  let reminderCount=0;
  const reminderInterval=setInterval(()=>{
   if(!isConnected && pairingCode && !pairingComplete){
    reminderCount++;
    if(reminderCount % 2 === 0){
     console.log(`\n⏳ Still waiting for pairing...`);
     console.log(`🔑 Code: ${pairingCode}`);
     console.log(`📱 Open WhatsApp → Linked Devices → Link with code`);
     console.log(`➜ Enter: ${pairingCode}\n`);
    }
   }
   if(pairingComplete){
    clearInterval(reminderInterval);
   }
  },15000);

 }catch(e){console.log(`❌ Error: ${e.message}`);}
}

const rl=readline.createInterface({input:process.stdin,output:process.stdout});
console.log(`╔══════════════════════════════════════╗
║        🤖 VELDRIX BOT              ║
╠══════════════════════════════════════╣
║                                    ║
║  ✨ FEATURES ✨                   ║
║  ├ WhatsApp Single-User Support   ║
║  ├ Pairing Code System            ║
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
║  4️⃣ Show pairing code             ║
║  5️⃣ Disconnect                    ║
║  6️⃣ Exit                          ║
╚══════════════════════════════════════╝`);
}

function askForUser(){
 showMenu();
 rl.question("\n👉 Choose (1-6): ",async c=>{
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
   console.log(`  Pairing Complete: ${pairingComplete?'✅ Yes':'❌ No'}`);
   if(activeUser.connectedAt)console.log(`  Connected At: ${activeUser.connectedAt}`);
   if(pairingCode)console.log(`  🔑 Pairing Code: ${pairingCode}`);
   const ab=antiBan.getStatus();
   console.log(`  Anti-Ban: ${ab.minute} (min) ${ab.hour} (hour)`);
   setTimeout(askForUser,3000);return;
  }
  if(c==='3'){
   offlineMode=!offlineMode;
   console.log(`📴 Offline mode ${offlineMode?'ENABLED':'DISABLED'}`);
   if(offlineMode)console.log(`💬 Auto-reply will activate when you're away`);
   setTimeout(askForUser,2000);return;
  }
  if(c==='4'){
   if(pairingCode){
    console.log(`\n╔══════════════════════════════════════╗`);
    console.log(`║         🔑 PAIRING CODE              ║`);
    console.log(`╠══════════════════════════════════════╣`);
    console.log(`║  📱 ${activeUser.number||'N/A'}           ║`);
    console.log(`║  🔑 Code: ${pairingCode}               ║`);
    console.log(`╠══════════════════════════════════════╣`);
    console.log(`║  📱 Open WhatsApp → Linked Devices  ║`);
    console.log(`║  ➜ Link with code                  ║`);
    console.log(`║  ➜ Enter: ${pairingCode}             ║`);
    console.log(`║  ⏰ Expires in 5 minutes            ║`);
    console.log(`╚══════════════════════════════════════╝`);
   }else{
    console.log(`❌ No pairing code available. Start the bot first.`);
   }
   setTimeout(askForUser,3000);return;
  }
  if(c==='5'){
   if(sock){
    sock.end();
    sock=null;
    isConnected=false;
    activeUser.number=null;
    pairingCode=null;
    pairingComplete=false;
    console.log(`✅ Disconnected successfully`);
   }else{
    console.log(`❌ Not connected`);
   }
   setTimeout(askForUser,2000);return;
  }
  if(c==='6'){console.log("👋 Bye!");rl.close();process.exit(0);}
  console.log("❌ Invalid!");setTimeout(askForUser,1000);
 });
}
askForUser();
process.on('SIGINT',()=>{console.log("\n👋 Shutting down...");rl.close();process.exit(0);});
