const pino=require("pino"),moment=require("moment"),qrcode=require("qrcode-terminal");
const {default:makeWASocket,useMultiFileAuthState,fetchLatestBaileysVersion,DisconnectReason}=require("@whiskeysockets/baileys");
const C={cooldown:2000,maxPerMin:30,reactChance:.3,welcome:true,statusDelay:500,name:"🔥 『 VELDRIX 』 🔥",ver:"V7.6.0",owner:"Veldrix 👑",prefix:".",num:"255748529340",mode:"public",botNumber:"255748529340"};
const seen=new Set,q=[],anonymous={};

async function start(){try{console.log("🤖 Starting VELDRIX Bot...\n");
let state,saveCreds;try{const a=await useMultiFileAuthState("./session");state=a.state;saveCreds=a.saveCreds;}catch(e){console.log("❌ Auth error:",e.message);setTimeout(start,3000);return;}
const{version}=await fetchLatestBaileysVersion();
const w=makeWASocket({version,auth:state,logger:pino({level:"silent"}),printQRInTerminal:true,browser:["Bot","Chrome","1.0.0"],syncFullHistory:false,markOnlineOnConnect:true});
if(saveCreds)w.ev.on("creds.update",saveCreds);
w.ev.on("connection.update",({qr})=>{if(qr){console.log("\n📱 SCAN QR CODE:");qrcode.generate(qr,{small:true});console.log("\n1.Open WhatsApp\n2.Linked Devices\n3.Link Device\n4.Scan QR\n");}});
w.ev.on("connection.update",async({connection,lastDisconnect})=>{if(connection==="open"){console.log("\n✅ Connected!",moment().format("YYYY-MM-DD HH:mm:ss"));if(w.user){C.num=w.user.id.split(":")[0];C.botNumber=w.user.id.split(":")[0];}viewStatus(w);}if(connection==="close"){const r=lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut;r?(console.log("❌ Reconnecting..."),setTimeout(start,5e3)):console.log("⚠️ Logged out. Run: rm -rf session && node index.js");}});
w.ev.on("messages.upsert",async({messages})=>{try{if(!messages||!messages.length)return;const a=messages[0];if(!a||!a.message)return;const j=a.key.remoteJid;if(!j)return;const g=j.includes("@g.us");
if(j&&j.includes("status")){if(!seen.has(a.key.id))q.push({key:a.key,id:a.key.id,jid:j});return;}
let t="";if(a.message.conversation)t=a.message.conversation;else if(a.message.extendedTextMessage?.text)t=a.message.extendedTextMessage.text;else if(a.message.imageMessage?.caption)t=a.message.imageMessage.caption;else if(a.message.videoMessage?.caption)t=a.message.videoMessage.caption;else return;
console.log(`📩 ${g?"Group":"Private"} ${a.key.participant||j}: ${t}`);
if(Math.random()<C.reactChance&&t){const e=["⭐","✨","💫","🌟","🔥","👋","😊"],em=e[Math.floor(Math.random()*e.length)];try{await w.sendMessage(j,{react:{text:em,key:a.key}});}catch(e){}}
if(t.startsWith(".")){const c=t.slice(1).split(" ")[0].toLowerCase(),args=t.slice(1+c.length).trim().split(" ");console.log(`⚡ ${c}`);
try{switch(c){
case"menu":await menu(w,j);break;
case"ping":await w.sendMessage(j,{text:"🏓 Pong! Online ✅"});break;
case"owner":await w.sendMessage(j,{text:`👑 Owner: ${C.owner}\nPhone: ${C.botNumber}\nStatus: Online 🌟`});break;
case"status":await status(w,j);break;
case"alive":await w.sendMessage(j,{text:`🤖 ${C.name}\n✅ Alive!\n📱 ${moment().format("YYYY-MM-DD HH:mm:ss")}\n💖 ${C.owner}`});break;
case"runtime":const r=process.uptime();await w.sendMessage(j,{text:`⏱️ ${Math.floor(r/86400)}d ${Math.floor((r%86400)/3600)}h ${Math.floor((r%3600)/60)}m ${Math.floor(r%60)}s`});break;
case"repo":await w.sendMessage(j,{text:"📦 https://github.com/veldrix/whatsapp-bot"});break;
case"public":C.mode="public";await w.sendMessage(j,{text:"✅ PUBLIC for everyone!"});break;
case"self":C.mode="self";await w.sendMessage(j,{text:"✅ SELF mode"});break;
case"tagall":if(g)await tagAll(w,j);else await w.sendMessage(j,{text:"❌ Groups only"});break;
case"online":case"listonline":if(g)await onlineMembers(w,j);else await w.sendMessage(j,{text:"❌ Groups only"});break;
case"admins":case"listadmins":if(g)await listAdmins(w,j);else await w.sendMessage(j,{text:"❌ Groups only"});break;
case"tagadmin":if(g)await tagAdmin(w,j);else await w.sendMessage(j,{text:"❌ Groups only"});break;
case"promote":if(g&&args.length>0)await promote(w,j,args[0]);else await w.sendMessage(j,{text:"❌ .promote @user"});break;
case"demote":if(g&&args.length>0)await demote(w,j,args[0]);else await w.sendMessage(j,{text:"❌ .demote @user"});break;
case"kick":case"remove":if(g&&args.length>0)await kick(w,j,args[0]);else await w.sendMessage(j,{text:"❌ .kick @user"});break;
case"add":if(g&&args.length>0)await add(w,j,args[0]);else await w.sendMessage(j,{text:"❌ .add @user"});break;
case"leave":if(g){await w.groupLeave(j);await w.sendMessage(j,{text:"👋 Left!"});}else await w.sendMessage(j,{text:"❌ Groups only"});break;
case"groupinfo":if(g)await groupInfo(w,j);else await w.sendMessage(j,{text:"❌ Groups only"});break;
case"welcome":C.welcome=!C.welcome;await w.sendMessage(j,{text:`✅ Welcome ${C.welcome?"enabled":"disabled"}`});break;
case"hidetag":if(g)await hidetag(w,j);else await w.sendMessage(j,{text:"❌ Groups only"});break;
case"react":if(args.length>0){const v=parseFloat(args[0]);if(!isNaN(v)&&v>=0&&v<=100){C.reactChance=v/100;await w.sendMessage(j,{text:`✅ Set to ${C.reactChance*100}%`});}else await w.sendMessage(j,{text:"❌ Use 0-100"});}else await w.sendMessage(j,{text:`📊 ${C.reactChance*100}%`});break;
case"autoreact":C.reactChance=C.reactChance>0?0:.3;await w.sendMessage(j,{text:`✅ Auto-react ${C.reactChance>0?"enabled":"disabled"}`});break;
case"help":await help(w,j);break;
case"info":await w.sendMessage(j,{text:`🤖 ${C.name}\nVer: ${C.ver}\nMode: ${C.mode}\nFeatures: Auto-status, Anti-spam, Anti-ban, Welcome, Group Mgmt, Fun`});break;
case"time":await w.sendMessage(j,{text:`⏰ ${moment().format("HH:mm:ss")}`});break;
case"date":await w.sendMessage(j,{text:`📅 ${moment().format("dddd, MMMM Do YYYY")}`});break;
case"joke":await w.sendMessage(j,{text:joke()});break;
case"quote":await w.sendMessage(j,{text:quote()});break;
case"fact":await w.sendMessage(j,{text:fact()});break;
case"advice":await w.sendMessage(j,{text:advice()});break;
case"meme":await w.sendMessage(j,{text:meme()});break;
case"truth":await w.sendMessage(j,{text:truth()});break;
case"dare":await w.sendMessage(j,{text:dare()});break;
case"anonymous":if(args.length>0){const msg=args.join(" ");await anonymousMessage(w,j,msg);}else{await w.sendMessage(j,{text:"❌ Usage: .anonymous Your message"});}break;
case"ghost":await ghostMode(w,j);break;
case"whoviewedme":await whoViewedMe(w,j);break;
case"prediction":await prediction(w,j);break;
case"fortune":await fortune(w,j);break;
case"readmind":if(args.length>0){await readMind(w,j,args[0]);}else{await w.sendMessage(j,{text:"❌ Usage: .readmind @user"});}break;
case"spycam":await spyCam(w,j);break;
case"burn":if(args.length>0){await burnMsg(w,j,args.join(" "));}else{await w.sendMessage(j,{text:"❌ Usage: .burn Your message"});}break;
case"rainbow":if(args.length>0){await rainbowText(w,j,args.join(" "));}else{await w.sendMessage(j,{text:"❌ Usage: .rainbow Your text"});}break;
case"superhero":if(args.length>0){await superhero(w,j,args.join(" "));}else{await w.sendMessage(j,{text:"❌ Usage: .superhero Your name"});}break;
case"lifestats":await lifeStats(w,j);break;
case"aiart":if(args.length>0){await aiArt(w,j,args.join(" "));}else{await w.sendMessage(j,{text:"❌ Usage: .aiart description"});}break;
case"movie":if(args.length>0){await moviePoster(w,j,args.join(" "));}else{await w.sendMessage(j,{text:"❌ Usage: .movie Your name"});}break;
case"timetravel":if(args.length>0){await timeTravel(w,j,args[0]);}else{await w.sendMessage(j,{text:"❌ Usage: .timetravel year"});}break;
case"whereis":if(args.length>0){await whereIs(w,j,args[0]);}else{await w.sendMessage(j,{text:"❌ Usage: .whereis @user"});}break;
case"clonevoice":if(args.length>0){await cloneVoice(w,j,args[0]);}else{await w.sendMessage(j,{text:"❌ Usage: .clonevoice @user"});}break;
case"royalvoice":if(args.length>0){await royalVoice(w,j,args.join(" "));}else{await w.sendMessage(j,{text:"❌ Usage: .royalvoice Your text"});}break;
case"songfrommood":if(args.length>0){await songFromMood(w,j,args[0]);}else{await w.sendMessage(j,{text:"❌ Usage: .songfrommood happy/sad/angry"});}break;
case"stars":if(args.length>0){await createStar(w,j,args.join(" "));}else{await w.sendMessage(j,{text:"❌ Usage: .stars Your name"});}break;
default:console.log(`❓ ${c}`);}}catch(e){console.log(`❌ ${e.message}`);}return;}}catch(e){console.log(`❌ ${e.message}`);}});

// GROUP PARTICIPANTS UPDATE - WITH PROFILE IMAGE DISPLAYED (NOT URL)
w.ev.on("group-participants.update",async(u)=>{if(!C.welcome)return;
const{id:p,participants:a,action:o}=u;
try{const meta=await w.groupMetadata(p);const groupName=meta.subject;
for(const x of a){try{let ppUrl=null;let hasProfile=false;try{ppUrl=await w.profilePictureUrl(x,"image");if(ppUrl)hasProfile=true;}catch(e){hasProfile=false;}
if(o==="add"){let msg=``;
msg+=`🎉 *━━━━━━━━━━━━━━━━━━━━━━━* 🎉\n\n`;
msg+=`✨ *WELCOME TO THE GROUP!* ✨\n\n`;
if(hasProfile&&ppUrl){msg+=`🖼️ *Profile Picture:*\n`;}else{msg+=`🖼️ *Profile Picture:* ❌ No Picture\n`;}
msg+=`👤 *Name:* @${x.split('@')[0]}\n`;
msg+=`📱 *Number:* ${x.split('@')[0]}\n`;
msg+=`📅 *Joined:* ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n`;
msg+=`👥 *Members:* ${meta.participants.length}\n`;
msg+=`📌 *Group:* ${groupName}\n\n`;
msg+=`💫 *━━━━━━━━━━━━━━━━━━━━━━━* 💫\n`;
msg+=`🌸 *Welcome! We're happy to have you here!* 🌸`;
await w.sendMessage(p,{text:msg,mentions:[x]});
// Send profile image separately if available
if(hasProfile&&ppUrl){try{await w.sendMessage(p,{image:{url:ppUrl},caption:"🖼️ *Profile Picture*"});}catch(e){}}}
if(o==="remove"){let msg=``;
msg+=`👋 *━━━━━━━━━━━━━━━━━━━━━━━* 👋\n\n`;
msg+=`💔 *GOODBYE!* 💔\n\n`;
if(hasProfile&&ppUrl){msg+=`🖼️ *Profile Picture:*\n`;}else{msg+=`🖼️ *Profile Picture:* ❌ No Picture\n`;}
msg+=`👤 *Name:* @${x.split('@')[0]}\n`;
msg+=`📱 *Number:* ${x.split('@')[0]}\n`;
msg+=`📅 *Left:* ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n`;
msg+=`👥 *Members Left:* ${meta.participants.length}\n`;
msg+=`📌 *Group:* ${groupName}\n\n`;
msg+=`💫 *━━━━━━━━━━━━━━━━━━━━━━━* 💫\n`;
msg+=`😢 *We'll miss you! Take care!* 😢`;
await w.sendMessage(p,{text:msg,mentions:[x]});
if(hasProfile&&ppUrl){try{await w.sendMessage(p,{image:{url:ppUrl},caption:"🖼️ *Profile Picture*"});}catch(e){}}}
if(o==="promote"){let msg=``;msg+=`⭐ *━━━━━━━━━━━━━━━━━━━━━━━* ⭐\n\n`;msg+=`👑 *NEW ADMIN!* 👑\n\n`;if(hasProfile&&ppUrl){msg+=`🖼️ *Profile Picture:*\n`;}msg+=`👤 @${x.split('@')[0]}\n`;msg+=`📱 ${x.split('@')[0]}\n`;msg+=`🕐 ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n\n`;msg+=`💫 *━━━━━━━━━━━━━━━━━━━━━━━* 💫`;await w.sendMessage(p,{text:msg,mentions:[x]});if(hasProfile&&ppUrl){try{await w.sendMessage(p,{image:{url:ppUrl},caption:"🖼️ *Profile Picture*"});}catch(e){}}}
if(o==="demote"){let msg=``;msg+=`📉 *━━━━━━━━━━━━━━━━━━━━━━━* 📉\n\n`;if(hasProfile&&ppUrl){msg+=`🖼️ *Profile Picture:*\n`;}msg+=`👤 @${x.split('@')[0]}\n`;msg+=`📱 ${x.split('@')[0]}\n`;msg+=`🕐 ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n\n`;msg+=`💫 *━━━━━━━━━━━━━━━━━━━━━━━* 💫`;await w.sendMessage(p,{text:msg,mentions:[x]});if(hasProfile&&ppUrl){try{await w.sendMessage(p,{image:{url:ppUrl},caption:"🖼️ *Profile Picture*"});}catch(e){}}}}catch(e){console.log(`❌ Member error: ${e.message}`);}}}catch(e){console.log(`❌ Group error: ${e.message}`);}});

}catch(e){console.log("❌",e.message);setTimeout(start,5e3);}}

async function menu(w,j){const r=process.uptime();await w.sendMessage(j,{text:`╔══✦ 🔥 『 VELDRIX 』 🔥 ✦══╗
║ 🌹 USER: ${j.split('@')[0]}
║ ⚡ MODE: ${C.mode} 💖
║ 📡 PLATFORM: Linux
║ ⚙️ PREFIX: ${C.prefix}
║ 👨‍💻 DEV: ${C.owner}
║ 📱 NUMBER: ${C.botNumber}
║ ⏱️ UPTIME: ${Math.floor(r/86400)}d ${Math.floor((r%86400)/3600)}h ${Math.floor((r%3600)/60)}m ${Math.floor(r%60)}s
║ 🔥 COMMANDS: 70+
║ 📅 DATE: ${moment().format("M/D/YYYY, h:mm:ss A")}
╚════════════════════════╝

╭─❒ 👑 OWNER ❒─╮
│ .owner .alive .ping .status .runtime .repo .public .self
╰────────────────╯

╭─❒ 👥 GROUP ❒─╮
│ .welcome .tagall .online .listonline .admins .listadmins .tagadmin
│ .promote .demote .kick .remove .add .leave .groupinfo .hidetag
╰────────────────╯

╭─❒ 🕵️ SHOCKING COMMANDS ❒─╮
│ .anonymous - Send anonymous message
│ .ghost - See who viewed status
│ .whoviewedme - Who viewed your profile
│ .prediction - Future prediction
│ .fortune - Fortune teller
│ .readmind - Read someone's mind
│ .spycam - Secret screenshot
│ .burn - Self-destruct message
│ .rainbow - Rainbow text
│ .superhero - Create superhero
│ .lifestats - Your life statistics
│ .aiart - AI art generator
│ .movie - Movie poster creator
│ .timetravel - Time travel
│ .whereis - Find someone
│ .clonevoice - Clone voice
│ .royalvoice - Royal voice
│ .songfrommood - Song from mood
│ .stars - Create a star
╰────────────────╯

╭─❒ ℹ️ TOOL ❒─╮
│ .react .autoreact .help .info .time .date
╰────────────────╯

╭─❒ 🎮 FUN ❒─╮
│ .joke .quote .fact .advice .meme .truth .dare
╰────────────────╯

💕 © ${C.owner} 🤖 ${C.ver}`});}

async function status(w,j){const r=process.uptime();await w.sendMessage(j,{text:`╔══✦ 🔥 『 VELDRIX 』 🔥 ✦══╗\n║ 🌹 USER: ${j.split('@')[0]}\n║ ⚡ MODE: ${C.mode} 💖\n║ 📡 PLATFORM: Linux\n║ ⚙️ PREFIX: ${C.prefix}\n║ 👨‍💻 DEV: ${C.owner}\n║ 📱 NUMBER: ${C.botNumber}\n║ ⏱️ UPTIME: ${Math.floor(r/86400)}d ${Math.floor((r%86400)/3600)}h ${Math.floor((r%3600)/60)}m ${Math.floor(r%60)}s\n║ 🔥 COMMANDS: 70+\n║ 📅 DATE: ${moment().format("M/D/YYYY, h:mm:ss A")}\n╚════════════════════════╝`});}

async function help(w,j){await w.sendMessage(j,{text:`╔══✦ 📖 COMMAND HELP 📖 ✦══╗

🔹 OWNER:
.menu .ping .owner .status .alive .runtime .repo .public .self

🔹 GROUP:
.welcome .tagall .online .listonline .admins .listadmins .tagadmin
.promote .demote .kick .remove .add .leave .groupinfo .hidetag

🔹 🕵️ SHOCKING COMMANDS:
.anonymous - Send anonymous message
.ghost - See who viewed status
.whoviewedme - Who viewed your profile
.prediction - Future prediction
.fortune - Fortune teller
.readmind - Read someone's mind
.spycam - Secret screenshot
.burn - Self-destruct message
.rainbow - Rainbow text
.superhero - Create superhero
.lifestats - Your life statistics
.aiart - AI art generator
.movie - Movie poster creator
.timetravel - Time travel
.whereis - Find someone
.clonevoice - Clone voice
.royalvoice - Royal voice
.songfrommood - Song from mood
.stars - Create a star

🔹 TOOL:
.react .autoreact .help .info .time .date

🔹 FUN:
.joke .quote .fact .advice .meme .truth .dare

✨ AUTO: Auto-status with 🚀, Anti-spam, Anti-ban, Auto-reconnect, Welcome with Profile Image
💖 ${C.ver} 👨‍💻 ${C.owner}`});}

async function onlineMembers(w,j){try{const m=await w.groupMetadata(j);const p=m.participants;let on=[];let off=[];for(const x of p){try{const pr=await w.presenceSubscribe(x.id);if(pr&&pr.lastKnownPresence==="available"){on.push(x.id);}else{off.push(x.id);}}catch(e){off.push(x.id);}}
let t="👥 *ONLINE MEMBERS*\n\n";if(on.length>0){t+=`🟢 *Online (${on.length}):*\n`;for(const o of on){t+=`• @${o.split('@')[0]}\n`;}}else{t+="🟢 No one is online right now\n";}t+=`\n⚫ *Offline:* ${off.length} members`;t+=`\n📊 *Total:* ${p.length} members`;await w.sendMessage(j,{text:t,mentions:on});console.log(`✅ Online: ${on.length}, Offline: ${off.length}`);}catch(e){console.log(`❌ Online error: ${e.message}`);await w.sendMessage(j,{text:"❌ Failed to get online members"});}}

async function tagAdmin(w,j){try{const m=await w.groupMetadata(j);const a=m.participants.filter(p=>p.admin!==null);let t="👑 ADMINS\n\n",mts=[];for(const x of a){mts.push(x.id);t+=`• @${x.id.split('@')[0]} (${x.admin})\n`;}t+=`\n📊 Total: ${a.length}`;await w.sendMessage(j,{text:t,mentions:mts});}catch(e){}}

async function listAdmins(w,j){try{const m=await w.groupMetadata(j);const a=m.participants.filter(p=>p.admin!==null);let t="👑 GROUP ADMINS\n\n";for(const x of a)t+=`• @${x.id.split('@')[0]} (${x.admin})\n`;t+=`\n📊 Total: ${a.length}`;await w.sendMessage(j,{text:t,mentions:a.map(x=>x.id)});}catch(e){}}

async function tagAll(w,j){try{const m=await w.groupMetadata(j);const p=m.participants;let t="📢 TAG ALL\n\n",mts=[];for(const x of p){mts.push(x.id);t+=`@${x.id.split('@')[0]}\n`;}await w.sendMessage(j,{text:t,mentions:mts});}catch(e){}}

async function hidetag(w,j){try{const m=await w.groupMetadata(j);const p=m.participants;let mts=[];for(const x of p)mts.push(x.id);await w.sendMessage(j,{text:"🔇 Hidden tag",mentions:mts});}catch(e){}}

async function promote(w,j,u){try{await w.groupParticipantsUpdate(j,[u+"@s.whatsapp.net"],"promote");await w.sendMessage(j,{text:`✅ @${u} is now admin!`,mentions:[u+"@s.whatsapp.net"]});}catch(e){await w.sendMessage(j,{text:"❌ Failed"});}}

async function demote(w,j,u){try{await w.groupParticipantsUpdate(j,[u+"@s.whatsapp.net"],"demote");await w.sendMessage(j,{text:`✅ @${u} demoted`,mentions:[u+"@s.whatsapp.net"]});}catch(e){await w.sendMessage(j,{text:"❌ Failed"});}}

async function kick(w,j,u){try{await w.groupParticipantsUpdate(j,[u+"@s.whatsapp.net"],"remove");await w.sendMessage(j,{text:`✅ @${u} removed from group!`,mentions:[u+"@s.whatsapp.net"]});console.log(`✅ Removed ${u} from ${j}`);}catch(e){console.log(`❌ Kick error: ${e.message}`);await w.sendMessage(j,{text:`❌ Failed to remove @${u}`});}}

async function add(w,j,u){try{await w.groupParticipantsUpdate(j,[u+"@s.whatsapp.net"],"add");await w.sendMessage(j,{text:`✅ @${u} added to group!`,mentions:[u+"@s.whatsapp.net"]});}catch(e){await w.sendMessage(j,{text:"❌ Failed to add"});}}

async function groupInfo(w,j){try{const m=await w.groupMetadata(j);const c=await w.groupInviteCode(j)||"N/A";await w.sendMessage(j,{text:`📊 GROUP INFO\n\n📌 ${m.subject}\n👤 @${m.owner.split('@')[0]}\n👥 ${m.participants.length}\n📅 ${moment(m.creation*1000).format("MM/DD/YYYY")}\n🔗 https://chat.whatsapp.com/${c}`,mentions:[m.owner]});}catch(e){}}

function joke(){const j=["Why do programmers prefer dark mode? Light attracts bugs!","What do you call a fake noodle? An impasta!","Why did the scarecrow win? Outstanding in his field!","What do you call a bear with no teeth? A gummy bear!","Why don't scientists trust atoms? They make up everything!"];return j[Math.floor(Math.random()*j.length)];}
function quote(){const q=["The only way to do great work is to love what you do. - Steve Jobs","Innovation distinguishes between a leader and a follower. - Steve Jobs","Life is what happens when you're busy making other plans. - John Lennon","The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt","Be the change you wish to see in the world. - Mahatma Gandhi"];return q[Math.floor(Math.random()*q.length)];}
function fact(){const f=["Octopuses have 3 hearts!","Honey never spoils!","Bananas are berries!","A day on Venus is longer than a year!","Cows have best friends!"];return f[Math.floor(Math.random()*f.length)];}
function advice(){const a=["Always be kind to others.","Take care of your mental health.","Learn something new every day.","Save money for rainy days.","Spend time with loved ones."];return a[Math.floor(Math.random()*a.length)];}
function meme(){const m=["When someone says 'I'll be there in 5 minutes'","Me when I wake up vs after coffee","When I realize I have to do the dishes","When my phone battery is at 1%","When I see my exam results"];return m[Math.floor(Math.random()*m.length)];}
function truth(){const t=["What's the most embarrassing thing you've ever done?","Have you ever lied to your best friend?","What's your biggest fear?","What's the craziest thing you've ever done?","Have you ever had a crush on someone?"];return t[Math.floor(Math.random()*t.length)];}
function dare(){const d=["Send a message to your crush right now!","Do 10 push-ups right now!","Sing your favorite song out loud!","Share your screen with everyone!","Call someone and say 'I love you'!"];return d[Math.floor(Math.random()*d.length)];}

// ============ SHOCKING FUNCTIONS ============

async function anonymousMessage(w,j,msg){
    const anonMsg = `🕵️ *ANONYMOUS MESSAGE*\n\n📝 "${msg}"\n\n🔐 This message was sent anonymously\n⏰ ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n\n💫 *
