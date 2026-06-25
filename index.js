#!/usr/bin/env node
process.env.NODE_NO_WARNINGS='1';process.env.NODE_ENV='production';
process.on('unhandledRejection',()=>{});process.on('warning',w=>{if(w.name==='DeprecationWarning')return;});

const readline=require("readline"),pino=require("pino"),fs=require("fs");
const {default:makeWASocket,useMultiFileAuthState,fetchLatestBaileysVersion}=require("@whiskeysockets/baileys");

const sessions=new Map(),activeUsers=new Map(),pairingCodes=new Map(),pendingUsers=new Map();

async function startBot(n){
 try{
  console.log(`\n🔄 Setting up ${n}...`);
  const d=`./session_${n}`;if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});
  const{state,saveCreds}=await useMultiFileAuthState(d);
  const{version}=await fetchLatestBaileysVersion();
  const sock=makeWASocket({
   version,auth:state,logger:pino({level:'silent',stream:{write:()=>{}}}),
   printQRInTerminal:false,defaultQueryTimeoutMs:60000,keepAliveIntervalMs:15000,
   syncFullHistory:false,markOnlineOnConnect:true,browser:['WhatsApp Bot','Chrome','120.0.0.0'],
   connectTimeoutMs:60000,emitOwnEvents:true,generateHighQualityLinkPreview:false,
   patchMessageBeforeSending:m=>new Promise(r=>setTimeout(()=>r(m),Math.random()*200))
  });
  sock.ev.on("creds.update",saveCreds);
  sock.ev.on("connection.update",async u=>{
   const{connection,lastDisconnect,qr}=u;
   if(qr)console.log(`📱 QR Code for ${n}`);
   if(connection==="open"){
    console.log(`\n✅ ${n} Connected!`);
    activeUsers.set(n,{status:'connected',connectedAt:new Date().toISOString(),socket:sock});
    try{await sock.sendMessage(n+'@s.whatsapp.net',{text:`✅ VELDRIX BOT CONNECTED!\n\nCommands:\n.menu\n.ping\n.owner\n.status\n.groupinfo\n.tagall\n.help\n.offline`});}catch(e){}
   }
   if(connection==="close"){
    const c=lastDisconnect?.error?.output?.statusCode;
    console.log(`⚠️ ${n} Disconnected (${c})`);
    if(c===401){activeUsers.delete(n);setTimeout(()=>startBot(n),3000);}
    else{activeUsers.delete(n);setTimeout(()=>startBot(n),5000);}
   }
  });
  if(sock.authState.creds.registered){
   console.log(`✅ ${n} already paired!`);
   activeUsers.set(n,{status:'connected',connectedAt:new Date().toISOString(),socket:sock});
  }else{
   console.log(`📱 Requesting pairing code for ${n}...`);
   try{
    await new Promise(r=>setTimeout(r,3000));
    const code=await sock.requestPairingCode(n);
    if(code){
     console.log(`\n╔══════════════════════════════════════╗`);
     console.log(`║         🔑 PAIRING CODE              ║`);
     console.log(`╠══════════════════════════════════════╣`);
     console.log(`║  📱 ${n}                    ║`);
     console.log(`║  🔑 Code: ${code}                    ║`);
     console.log(`╠══════════════════════════════════════╣`);
     console.log(`║  📱 Open WhatsApp → Linked Devices  ║`);
     console.log(`║  ➜ Link with code                   ║`);
     console.log(`║  ⏰ Expires in 5 minutes            ║`);
     console.log(`╚══════════════════════════════════════╝\n`);
     pairingCodes.set(n,{code,timestamp:Date.now(),expires:Date.now()+300000});
     pendingUsers.set(n,{code,timestamp:Date.now(),socket:sock});
     console.log(`⏳ Waiting for ${n} to link...`);
     let a=0,m=60;
     const ci=setInterval(async()=>{
      a++;
      if(sock.authState.creds.registered){
       console.log(`\n✅ ${n} LINKED!`);
       activeUsers.set(n,{status:'connected',connectedAt:new Date().toISOString(),socket:sock});
       pendingUsers.delete(n);clearInterval(ci);
       try{await sock.sendMessage(n+'@s.whatsapp.net',{text:`✅ VELDRIX BOT CONNECTED!\n\nCommands:\n.menu\n.ping\n.owner\n.status\n.groupinfo\n.tagall\n.help\n.offline`});}catch(e){}
      }else if(a>=m){console.log(`\n⏰ Pairing timeout for ${n}\n`);pendingUsers.delete(n);clearInterval(ci);}
     },5000);
    }
   }catch(e){console.log(`❌ Pairing error: ${e.message}`);setTimeout(()=>startBot(n),5000);}
  }
  sock.ev.on("group-participants.update",async d=>{
   try{
    if(d.action==="add"){for(let u of d.participants){await sock.sendMessage(d.id,{text:`👋 Welcome @${u.split("@")[0]}`,mentions:[u]});}}
    if(d.action==="remove"){for(let u of d.participants){await sock.sendMessage(d.id,{text:`😢 Goodbye @${u.split("@")[0]}`,mentions:[u]});}}
   }catch(e){}
  });
  sock.ev.on("messages.upsert",async({messages})=>{
   const msg=messages?.[0];if(!msg?.message||msg.key.fromMe)return;
   const jid=msg.key.remoteJid;
   const message=msg.message;
   let text=message?.conversation||message?.extendedTextMessage?.text||"";
   text=text.trim();const cmd=text.toLowerCase();
   console.log(`📨 ${n}: ${text}`);
   try{
    const userData=activeUsers.get(n);
    if(userData&&userData.offlineMode){
     await sock.sendPresenceUpdate("unavailable",jid);
     await sock.sendMessage(jid,{text:`🔵 Offline. I'll reply when back.`});
     return;
    }
    if(cmd===".menu"||cmd==="/menu"){
     await sock.sendMessage(jid,{text:`🤖 VELDRIX BOT\n\n📋 COMMANDS:\n.menu\n.ping\n.owner\n.status\n.groupinfo\n.tagall\n.help\n.offline`});
    }
    if(cmd===".ping"||cmd==="/ping"){
     const p=Math.round(Date.now()-msg.messageTimestamp*1000);
     await sock.sendMessage(jid,{text:`🏓 Pong!\n⏱️ ${p}ms`});
    }
    if(cmd===".owner"||cmd==="/owner"){
     await sock.sendMessage(jid,{text:`👑 Bot Owner: Veldrix\n📱 Connected: ${n}\n✅ Online`});
    }
    if(cmd===".status"||cmd==="/status"){
     const total=activeUsers.size,uptime=process.uptime(),h=Math.floor(uptime/3600),m=Math.floor((uptime%3600)/60);
     await sock.sendMessage(jid,{text:`📊 STATUS\nUsers: ${total}\nUptime: ${h}h ${m}m\nConnected: ${n}`});
    }
    if(cmd===".groupinfo"||cmd==="/groupinfo"){
     if(!jid.endsWith("@g.us")){await sock.sendMessage(jid,{text:"❌ Groups only!"});return;}
     const meta=await sock.groupMetadata(jid);
     await sock.sendMessage(jid,{text:`📌 GROUP INFO\nName: ${meta.subject}\nMembers: ${meta.participants.length}\nAdmins: ${meta.participants.filter(p=>p.admin).length}`});
    }
    if(cmd===".tagall"||cmd==="/tagall"){
     if(!jid.endsWith("@g.us")){await sock.sendMessage(jid,{text:"❌ Groups only!"});return;}
     const meta=await sock.groupMetadata(jid);
     const mentions=meta.participants.map(p=>p.id);
     if(mentions.length>30){await sock.sendMessage(jid,{text:`⚠️ ${mentions.length} members. Max 15 tags.`});return;}
     let t="📢 TAG ALL\n\n";const s=mentions.sort(()=>Math.random()-0.5).slice(0,15);
     for(let m of s)t+=`@${m.split("@")[0]}\n`;
     await sock.sendMessage(jid,{text:t,mentions:s});
    }
    if(cmd===".help"||cmd==="/help"){
     await sock.sendMessage(jid,{text:`🤖 HELP\n\n.menu\n.ping\n.owner\n.status\n.groupinfo\n.tagall\n.help\n.offline`});
    }
    if(cmd===".offline"||cmd==="/offline"){
     const ud=activeUsers.get(n);
     if(ud){ud.offlineMode=!ud.offlineMode;activeUsers.set(n,ud);
     await sock.sendMessage(jid,{text:`📴 Offline ${ud.offlineMode?'ON':'OFF'}`});}
    }
   }catch(e){console.log(`❌ Error: ${e.message}`);}
  });
  sessions.set(n,sock);console.log(`✅ ${n} ready!\n`);
 }catch(e){console.log(`❌ Error: ${e.message}`);setTimeout(()=>startBot(n),5000);}
}

const rl=readline.createInterface({input:process.stdin,output:process.stdout});
console.log(`🤖 VELDRIX BOT\n`);
function showMenu(){console.log(`📋 OPTIONS:\n1. Add user\n2. Active users\n3. Pairing codes\n4. Remove user\n5. Status\n6. Exit`);}
function askForUser(){
 showMenu();
 rl.question("\n👉 Choose (1-6): ",async c=>{
  if(c==='1'){
   rl.question("📱 Number (255xxxxxxxxx): ",async n=>{
    n=n.replace(/[^0-9]/g,'');
    if(!n||n.length<5){console.log("❌ Invalid!");askForUser();return;}
    if(sessions.has(n)){console.log(`ℹ️ ${n} already connected`);askForUser();return;}
    console.log(`🔄 Setting up ${n}...`);await startBot(n);
    setTimeout(askForUser,2000);
   });return;
  }
  if(c==='2'){
   console.log(`\n👥 Active Users:`);
   if(activeUsers.size===0)console.log("  ❌ None");
   else activeUsers.forEach((_,u)=>{console.log(`  ✅ ${u}`);});
   console.log(`\nTotal: ${activeUsers.size}`);setTimeout(askForUser,3000);return;
  }
  if(c==='3'){
   console.log(`\n🔑 Pairing Codes:`);
   if(pairingCodes.size===0)console.log("  ❌ None");
   else pairingCodes.forEach((d,u)=>{const e=Date.now()>d.expires;console.log(`  ${e?'⏰':'✅'} ${u}: ${d.code}`);});
   setTimeout(askForUser,3000);return;
  }
  if(c==='4'){
   rl.question("📱 Number to remove: ",async n=>{
    n=n.replace(/[^0-9]/g,'');
    if(sessions.has(n)){sessions.delete(n);activeUsers.delete(n);pairingCodes.delete(n);console.log(`✅ ${n} removed`);}
    else console.log(`❌ ${n} not found`);
    setTimeout(askForUser,2000);
   });return;
  }
  if(c==='5'){
   console.log(`\n📊 STATUS:\nActive: ${activeUsers.size}\nSessions: ${sessions.size}\nCodes: ${pairingCodes.size}\nUptime: ${Math.floor(process.uptime()/60)}m`);
   setTimeout(askForUser,3000);return;
  }
  if(c==='6'){console.log("👋 Bye!");rl.close();process.exit(0);}
  console.log("❌ Invalid!");setTimeout(askForUser,1000);
 });
}
askForUser();
process.on('SIGINT',()=>{console.log("\n👋 Shutting down...");rl.close();process.exit(0);});
