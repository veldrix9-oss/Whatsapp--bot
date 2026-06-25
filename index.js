process.env.NODE_NO_WARNINGS='1';process.env.NODE_ENV='production';
process.on('unhandledRejection',()=>{});process.on('warning',w=>{if(w.name==='DeprecationWarning')return;});

const readline=require("readline"),pino=require("pino"),fs=require("fs");
const {default:makeWASocket,useMultiFileAuthState,fetchLatestBaileysVersion}=require("@whiskeysockets/baileys");

let sock=null;let isConnected=false;let offlineMode=false;let pairingCode=null;let pairingRequested=false;
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
   printQRInTerminal:false,
   defaultQueryTimeoutMs:60000,
   keepAliveIntervalMs:10000,
   syncFullHistory:false,
   markOnlineOnConnect:true,
   browser:['WhatsApp Bot','Chrome','120.0.0.0'],
   connectTimeoutMs:60000,
   emitOwnEvents:true,
   patchMessageBeforeSending:async (msg)=>{
    await new Promise(r=>setTimeout(r,Math.random()*200));
    return msg;
   }
  });

  sock.ev.on("creds.update",saveCreds);

  sock.ev.on("connection.update",async u=>{
   const{connection,lastDisconnect,qr}=u;
   
   if(qr){
    console.log(`📱 QR Code received for ${n}`);
    if(!pairingRequested){
     try{
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
     }catch(e){console.log(`❌ Pairing error: ${e.message}`);}
    }
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
     if(!isConnected){
      console.log(`📱 Waiting for pairing...`);
      console.log(`💡 Enter the pairing code in WhatsApp on your phone`);
     }else{
      console.log(`📱 Needs re-pairing. Run option 1 again.`);
      isConnected=false;
     }
    }else{
     console.log(`♻ Reconnecting in 5 seconds...`);
     isConnected=false;
     setTimeout(()=>startBot(n),5000);
    }
   }
  });

  if(!state.creds.registered && !pairingRequested){
   console.log(`📱 Requesting pairing code for ${n}...`);
   try{
    await new Promise(r=>setTimeout(r,5000));
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
   }catch(e){console.log(`❌ Pairing error: ${e.message}`);}
  }

  sock.ev.on("group-participants.update",async d=>{
   try{
    if(d.action==="add"){
     for(let u of d.participants){
      await sock.sendMessage(d.id,{
       text:`╔══════════════════════════════════════╗
║           👋 WELCOME              ║
╠══════════════════════════════════════╣
║                                    ║
║  ✨ Welcome @${u.split("@")[0]} ✨    ║
║                                    ║
║  📌 Group: ${(await sock.groupMetadata(d.id)).subject} ║
║                                    ║
╚══════════════════════════════════════╝`,
       mentions:[u]
      });
     }
    }
    if(d.action==="remove"){
     for(let u of d.participants){
      await sock.sendMessage(d.id,{
       text:`╔══════════════════════════════════════╗
║           😢 GOODBYE               ║
╠══════════════════════════════════════╣
║                                    ║
║  💔 Goodbye @${u.split("@")[0]}      ║
║                                    ║
║  📌 Group: ${(await sock.groupMetadata(d.id)).subject} ║
║                                    ║
╚══════════════════════════════════════╝`,
       mentions:[u]
      });
     }
    }
   }catch(e){}
  });

  sock.ev.on("messages.upsert",async({messages})=>{
   const msg=messages?.[0];if(!msg?.message||msg.key.fromMe)return;
   const jid=msg.key.remoteJid;
   const message=msg.message;
   let text=message?.conversation||message?.extendedTextMessage?.text||"";
   text=text.trim();const cmd=text.toLowerCase();
   console.log(`📨 ${activeUser.number}: ${text}`);
   try{
    if(!antiBan.canSend()){
     await sock.sendMessage(jid,{text:`⏳ Rate limit reached. Please wait.`});
     return;
    }

    if(offlineMode){
     await sock.sendPresenceUpdate("unavailable",jid);
     await sock.sendMessage(jid,{text:`🔵 Offline Mode: ${autoReply.getReply(text)}`});
     return;
    }

    await sock.sendPresenceUpdate("composing",jid);
    await new Promise(r=>setTimeout(r,1000+Math.random()*2000));

    if(cmd===".menu"||cmd==="/menu"){
     await sock.sendMessage(jid,{
      text:`╔══════════════════════════════════════╗
║          🤖 VELDRIX BOT           ║
╠══════════════════════════════════════╣
║                                    ║
║  ✨ AVAILABLE COMMANDS ✨          ║
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
║                                    ║
║  🛡️ Anti-Ban: Active              ║
║  🌐 Type: Public Bot              ║
║  🤖 AI: Enabled                   ║
║                                    ║
║  📱 Connected: ${activeUser.number}  ║
║                                    ║
╚══════════════════════════════════════╝`
     });
    }

    if(cmd===".ping"||cmd==="/ping"){
     const p=Math.round(Date.now()-msg.messageTimestamp*1000);
     await sock.sendMessage(jid,{
      text:`╔══════════════════════════════════════╗
║           🏓 PONG!                ║
╠══════════════════════════════════════╣
║  ⏱️ Response: ${p}ms                 ║
║  📱 Status: Online                ║
║  🛡️ Anti-Ban: Active              ║
║  🤖 AI: Enabled                   ║
╚══════════════════════════════════════╝`
     });
    }

    if(cmd===".owner"||cmd==="/owner"){
     await sock.sendMessage(jid,{
      text:`╔══════════════════════════════════════╗
║           👑 BOT OWNER             ║
╠══════════════════════════════════════╣
║  👤 Name: Veldrix                 ║
║  📱 Connected: ${activeUser.number}  ║
║  🛡️ Anti-Ban: Active              ║
║  ✅ Status: Online                ║
║  🌐 Type: Public Bot              ║
║  🤖 AI: Enabled                   ║
╚══════════════════════════════════════╝`
     });
    }

    if(cmd===".status"||cmd==="/status"){
     const uptime=process.uptime();
     const h=Math.floor(uptime/3600),m=Math.floor((uptime%3600)/60);
     const ab=antiBan.getStatus();
     await sock.sendMessage(jid,{
      text:`╔══════════════════════════════════════╗
║           📊 BOT STATUS            ║
╠══════════════════════════════════════╣
║  📱 Connected: ${activeUser.number}  ║
║  ⏱️ Uptime: ${h}h ${m}m                 ║
║  📴 Offline Mode: ${offlineMode?'ON':'OFF'}   ║
║  🛡️ Anti-Ban: Active              ║
║  📊 Rate: ${ab.minute} (min)          ║
║  📊 Rate: ${ab.hour} (hour)           ║
║  🔒 Locked: ${ab.locked?'Yes':'No'}    ║
║  🤖 AI: Enabled                   ║
╚══════════════════════════════════════╝`
     });
    }

    if(cmd===".groupinfo"||cmd==="/groupinfo"){
     if(!jid.endsWith("@g.us")){await sock.sendMessage(jid,{text:"❌ Groups only!"});return;}
     const meta=await sock.groupMetadata(jid);
     await sock.sendMessage(jid,{
      text:`╔══════════════════════════════════════╗
║           📌 GROUP INFO            ║
╠══════════════════════════════════════╣
║  📛 Name: ${meta.subject}              ║
║  👥 Members: ${meta.participants.length}      ║
║  👑 Admins: ${meta.participants.filter(p=>p.admin).length}       ║
║  📅 Created: ${new Date(meta.creation*1000).toLocaleDateString()} ║
╚══════════════════════════════════════╝`
     });
    }

    if(cmd===".tagall"||cmd==="/tagall"){
     if(!jid.endsWith("@g.us")){await sock.sendMessage(jid,{text:"❌ Groups only!"});return;}
     const meta=await sock.groupMetadata(jid);
     const mentions=meta.participants.map(p=>p.id);
     if(mentions.length>30){await sock.sendMessage(jid,{text:`⚠️ ${mentions.length} members. Max 15.`});return;}
     let t="📢 TAG ALL\n\n";const s=mentions.sort(()=>Math.random()-0.5).slice(0,15);
     for(let m of s)t+=`@${m.split("@")[0]}\n`;
     await sock.sendMessage(jid,{text:t,mentions:s});
    }

    if(cmd===".help"||cmd==="/help"){
     await sock.sendMessage(jid,{
      text:`╔══════════════════════════════════════╗
║           🆘 HELP MENU            ║
╠══════════════════════════════════════╣
║  ✅ .menu     - Show menu         ║
║  ✅ .ping     - Test bot          ║
║  ✅ .owner    - Bot owner         ║
║  ✅ .status   - Bot status        ║
║  ✅ .groupinfo- Group info        ║
║  ✅ .tagall   - Tag members       ║
║  ✅ .help     - This menu         ║
║  ✅ .offline  - Toggle offline    ║
║  ✅ .antiban  - Anti-ban status   ║
╚══════════════════════════════════════╝`
     });
    }

    if(cmd===".offline"||cmd==="/offline"){
     offlineMode=!offlineMode;
     await sock.sendMessage(jid,{
      text:`╔══════════════════════════════════════╗
║           📴 OFFLINE MODE           ║
╠══════════════════════════════════════╣
║  📱 Status: ${offlineMode?'ENABLED':'DISABLED'}      ║
║  💬 Auto-Reply: ${offlineMode?'ON':'OFF'}          ║
╚══════════════════════════════════════╝`
     });
    }

    if(cmd===".antiban"||cmd==="/antiban"){
     const ab=antiBan.getStatus();
     await sock.sendMessage(jid,{
      text:`╔══════════════════════════════════════╗
║         🛡️ ANTI-BAN STATUS        ║
╠══════════════════════════════════════╣
║  📊 Status: Active                ║
║  📱 Messages/min: ${ab.minute}          ║
║  📱 Messages/hour: ${ab.hour}          ║
║  🔒 Locked: ${ab.locked?'Yes':'No'}          ║
║  🤖 AI: Enabled                   ║
╚══════════════════════════════════════╝`
     });
    }

   }catch(e){console.log(`❌ Error: ${e.message}`);}
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
   if(activeUser.connectedAt)console.log(`  Connected At: ${activeUser.connectedAt}`);
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
    console.log(`\n🔑 Pairing Code: ${pairingCode}`);
    console.log(`⏰ Expires in 5 minutes`);
    console.log(`📱 Open WhatsApp → Linked Devices → Link with code`);
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
