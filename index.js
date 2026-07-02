const pino=require("pino"),moment=require("moment"),qrcode=require("qrcode-terminal");
const {default:makeWASocket,useMultiFileAuthState,fetchLatestBaileysVersion,DisconnectReason}=require("@whiskeysockets/baileys");
const C={cooldown:2000,maxPerMin:30,reactChance:.3,welcome:true,statusDelay:500,name:"🔥 『 VELDRIX 』 🔥",ver:"V7.6.0",owner:"Veldrix 👑",prefix:".",num:"255748529340",mode:"public",botNumber:"255748529340"};
const seen=new Set,q=[];

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
case"anonymous":if(args.length>0){await w.sendMessage(j,{text:`🕵️ *ANONYMOUS*\n\n📝 ${args.join(" ")}\n\n🔐 Sent Anonymously\n⏰ ${moment().format("MMMM Do YYYY, h:mm:ss A")}`});}break;
case"ghost":await w.sendMessage(j,{text:"👻 *GHOST MODE*\n\n👁️ Status viewed by:\n• @user1 - 10:30 AM\n• @user2 - 10:25 AM\n• @user3 - 10:20 AM\n\n🕵️ Total: 3 views"});break;
case"whoviewedme":await w.sendMessage(j,{text:"👁️ *PROFILE VIEWERS*\n\n• @user1 - 10:30 AM\n• @user2 - 10:25 AM\n• @user3 - 10:20 AM\n\n📊 Total: 3 views"});break;
case"prediction":const pr=["You will receive good news today","A surprise is coming your way","Your luck is about to change","Someone is thinking about you","Success is near"];await w.sendMessage(j,{text:`🔮 *PREDICTION*\n\n${pr[Math.floor(Math.random()*pr.length)]}\n\n✨ Accuracy: ${Math.floor(Math.random()*30+70)}%`});break;
case"fortune":const ft=["🌟 You will meet someone special","💰 Money is coming your way","❤️ Love is in the air","🌈 Great success awaits","⭐ Your dreams will come true"];await w.sendMessage(j,{text:`🔮 *FORTUNE*\n\n${ft[Math.floor(Math.random()*ft.length)]}\n\n🧙 VELDRIX AI`});break;
case"readmind":if(args.length>0){const th=["I'm thinking about food","I wonder if they like me","I need to sleep","I'm happy today","I miss someone"];await w.sendMessage(j,{text:`🧠 *READING MIND*\n\n👤 @${args[0]}\n💭 "${th[Math.floor(Math.random()*th.length)]}"\n\n🔮 Accuracy: ${Math.floor(Math.random()*30+70)}%`,mentions:[args[0]+"@s.whatsapp.net"]});}break;
case"spycam":await w.sendMessage(j,{text:"📸 *SPY CAM*\n\n🔴 Active\n📸 Photo captured\n🕵️ Stealth mode\n\n⏰ "+moment().format("MMMM Do YYYY, h:mm:ss A")});break;
case"burn":if(args.length>0){await w.sendMessage(j,{text:`🔥 *BURN MESSAGE*\n\n📝 ${args.join(" ")}\n\n⏳ Self-destructing in 10s...\n💀 BURNING!`});}break;
case"rainbow":if(args.length>0){let txt=args.join(" ");let r="🌈 *RAINBOW*\n\n";for(let i=0;i<txt.length;i++){r+=`${["🔴","🟠","🟡","🟢","🔵","🟣"][i%6]} ${txt[i]}\n`;}await w.sendMessage(j,{text:r});}break;
case"superhero":if(args.length>0){const p=["Flight","Invisibility","Super Strength","Time Control","Telepathy","Super Speed"];await w.sendMessage(j,{text:`🦸 *SUPERHERO*\n\n👤 ${args.join(" ")}\n⚡ Name: ${args.join(" ")}Man\n💪 Powers: ${p[Math.floor(Math.random()*p.length)]}, ${p[Math.floor(Math.random()*p.length)]}\n⭐ Rating: ${Math.floor(Math.random()*50+50)}%`});}break;
case"lifestats":const h=Math.floor(Math.random()*100),s=Math.floor(Math.random()*100),l=Math.floor(Math.random()*100),he=Math.floor(Math.random()*100),w2=Math.floor(Math.random()*100);await w.sendMessage(j,{text:`📊 *LIFE STATS*\n\n❤️ Happiness: ${"█".repeat(Math.floor(h/10))} ${h}%\n🏆 Success: ${"█".repeat(Math.floor(s/10))} ${s}%\n💕 Love: ${"█".repeat(Math.floor(l/10))} ${l}%\n💪 Health: ${"█".repeat(Math.floor(he/10))} ${he}%\n💰 Wealth: ${"█".repeat(Math.floor(w2/10))} ${w2}%\n\n🌟 Overall: ${Math.floor((h+s+l+he+w2)/5)}%`});break;
case"aiart":if(args.length>0){const styles=["Abstract Digital Art","Modern Surrealism","Cyberpunk Neon","Vintage Painting","Minimalist Design","Expressionism","Impressionism","Pop Art"];const colors=["Vibrant Colors","Dark Tones","Pastel Shades","Neon Glow","Earthy Tones","Monochrome"];const mood=["Calm and Peaceful","Energetic and Dynamic","Mysterious and Dark","Joyful and Bright","Dreamy and Ethereal"];const msg=`🎨 *AI ART GENERATOR*\n\n📝 *Description:* ${args.join(" ")}\n\n🖼️ *Creating masterpiece...*\n⏳ 30%... 60%... 90%...\n\n✨ *Art Generated!*\n🎭 *Style:* ${styles[Math.floor(Math.random()*styles.length)]}\n🎨 *Colors:* ${colors[Math.floor(Math.random()*colors.length)]}\n😊 *Mood:* ${mood[Math.floor(Math.random()*mood.length)]}\n📐 *Resolution:* 4K Ultra HD\n⭐ *Rating:* ★★★★★\n\n💡 *Information:*\n• This AI art was generated using advanced neural networks\n• Trained on millions of artworks\n• Unique style combination\n• Created with VELDRIX AI Technology\n\n🔗 [View Full Art](https://example.com/art/${Date.now()})\n\n🤖 *Created by:* VELDRIX AI`;await w.sendMessage(j,{text:msg});}break;
case"movie":if(args.length>0){await w.sendMessage(j,{text:`🎬 *MOVIE POSTER*\n\n🎥 ${args.join(" ")} - The Movie\n🎭 Genre: ${["Action","Comedy","Drama","Horror"][Math.floor(Math.random()*4)]}\n⭐ Starring: ${args.join(" ")}\n🎬 Director: VELDRIX\n📅 Coming Soon!`});}break;
case"timetravel":if(args.length>0){await w.sendMessage(j,{text:`⏰ *TIME TRAVEL*\n\n🚀 Destination: ${args[0]}\n🌀 Event: ${["Meet your future self","Discover new tech","Become famous","Find treasure"][Math.floor(Math.random()*4)]}\n✨ Travel successful!`});}break;
case"whereis":if(args.length>0){await w.sendMessage(j,{text:`🌍 *LOCATION*\n\n👤 @${args[0]}\n📍 ${["Dar es Salaam","Nairobi","London","New York","Dubai"][Math.floor(Math.random()*5)]}\n📡 Accuracy: ${Math.floor(Math.random()*30+70)}%`,mentions:[args[0]+"@s.whatsapp.net"]});}break;
case"clonevoice":if(args.length>0){await w.sendMessage(j,{text:`🎤 *VOICE CLONED*\n\n👤 @${args[0]}\n🔊 Voice cloned successfully!\n🎵 Quality: ${Math.floor(Math.random()*30+70)}%`,mentions:[args[0]+"@s.whatsapp.net"]});}break;
case"royalvoice":if(args.length>0){await w.sendMessage(j,{text:`👑 *ROYAL VOICE*\n\n📝 ${args.join(" ")}\n🔊 Royal accent applied!\n⭐ Premium quality`});}break;
case"songfrommood":if(args.length>0){const songs={happy:["Happy - Pharrell Williams","Walking on Sunshine - Katrina","Don't Stop Believin' - Journey"],sad:["Someone Like You - Adele","Fix You - Coldplay","Yesterday - Beatles"],angry:["Break Stuff - Limp Bizkit","Killing in the Name - RATM","Bulls on Parade - RATM"],romantic:["Perfect - Ed Sheeran","All of Me - John Legend","Thinking Out Loud - Ed Sheeran"]};const list=songs[args[0]]||songs.happy;await w.sendMessage(j,{text:`🎵 *SONG FROM MOOD*\n\n😊 Mood: ${args[0].toUpperCase()}\n🎶 ${list[Math.floor(Math.random()*list.length)]}\n\n🎧 Enjoy!`});}break;
case"stars":if(args.length>0){await w.sendMessage(j,{text:`⭐ *STAR CREATED!*\n\n🌟 Name: ${args.join(" ")}\n✨ Galaxy: Milky Way\n🔭 Distance: ${Math.floor(Math.random()*1000+100)} light years\n\n🌠 A star named after ${args.join(" ")}!`});}break;
default:console.log(`❓ ${c}`);}}catch(e){console.log(`❌ ${e.message}`);}return;}}catch(e){console.log(`❌ ${e.message}`);}});

// GROUP PARTICIPANTS UPDATE - WITH PROFILE IMAGE
w.ev.on("group-participants.update",async(u)=>{if(!C.welcome)return;
const{id:p,participants:a,action:o}=u;
try{const meta=await w.groupMetadata(p);const groupName=meta.subject;
for(const x of a){try{let ppUrl=null;let hasProfile=false;try{ppUrl=await w.profilePictureUrl(x,"image");if(ppUrl)hasProfile=true;}catch(e){hasProfile=false;}
if(o==="add"){let msg="";msg+=`🎉 *━━━━━━━━━━━━━━━━━━━━━━━* 🎉\n\n`;msg+=`✨ *WELCOME TO THE GROUP!* ✨\n\n`;msg+=`👤 *Name:* @${x.split('@')[0]}\n`;msg+=`📱 *Number:* ${x.split('@')[0]}\n`;msg+=`📅 *Joined:* ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n`;msg+=`🖼️ *Profile:* ${hasProfile?"✅ Available":"❌ Not Available"}\n`;msg+=`👥 *Members:* ${meta.participants.length}\n`;msg+=`📌 *Group:* ${groupName}\n\n`;msg+=`💫 *━━━━━━━━━━━━━━━━━━━━━━━* 💫\n`;msg+=`🌸 *Welcome! We're happy to have you here!* 🌸`;await w.sendMessage(p,{text:msg,mentions:[x]});if(hasProfile&&ppUrl){try{await w.sendMessage(p,{image:{url:ppUrl},caption:"🖼️ *Profile Picture*"});}catch(e){}}}
if(o==="remove"){let msg="";msg+=`👋 *━━━━━━━━━━━━━━━━━━━━━━━* 👋\n\n`;msg+=`💔 *GOODBYE!* 💔\n\n`;msg+=`👤 *Name:* @${x.split('@')[0]}\n`;msg+=`📱 *Number:* ${x.split('@')[0]}\n`;msg+=`📅 *Left:* ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n`;msg+=`🖼️ *Profile:* ${hasProfile?"✅ Available":"❌ Not Available"}\n`;msg+=`👥 *Members Left:* ${meta.participants.length}\n`;msg+=`📌 *Group:* ${groupName}\n\n`;msg+=`💫 *━━━━━━━━━━━━━━━━━━━━━━━* 💫\n`;msg+=`😢 *We'll miss you! Take care!* 😢`;await w.sendMessage(p,{text:msg,mentions:[x]});if(hasProfile&&ppUrl){try{await w.sendMessage(p,{image:{url:ppUrl},caption:"🖼️ *Profile Picture*"});}catch(e){}}}
if(o==="promote"){let msg="";msg+=`⭐ *━━━━━━━━━━━━━━━━━━━━━━━* ⭐\n\n`;msg+=`👑 *NEW ADMIN!* 👑\n\n`;msg+=`👤 @${x.split('@')[0]}\n`;msg+=`📱 ${x.split('@')[0]}\n`;msg+=`🕐 ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n\n`;msg+=`💫 *━━━━━━━━━━━━━━━━━━━━━━━* 💫`;await w.sendMessage(p,{text:msg,mentions:[x]});if(hasProfile&&ppUrl){try{await w.sendMessage(p,{image:{url:ppUrl},caption:"🖼️ *Profile Picture*"});}catch(e){}}}
if(o==="demote"){let msg="";msg+=`📉 *━━━━━━━━━━━━━━━━━━━━━━━* 📉\n\n`;msg+=`👤 @${x.split('@')[0]}\n`;msg+=`📱 ${x.split('@')[0]}\n`;msg+=`🕐 ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n\n`;msg+=`💫 *━━━━━━━━━━━━━━━━━━━━━━━* 💫`;await w.sendMessage(p,{text:msg,mentions:[x]});if(hasProfile&&ppUrl){try{await w.sendMessage(p,{image:{url:ppUrl},caption:"🖼️ *Profile Picture*"});}catch(e){}}}}catch(e){console.log(`❌ Member error: ${e.message}`);}}}catch(e){console.log(`❌ Group error: ${e.message}`);}});

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
│ .aiart - AI art generator (Like ChatGPT)
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

async function status(w,j){const r=process.uptime();await w.sendMessage(j,{text:`╔══✦ 🔥 『 VELDRIX 』 🔥 ✦══╗
║ 🌹 USER: ${j.split('@')[0]}
║ ⚡ MODE: ${C.mode} 💖
║ 📡 PLATFORM: Linux
║ ⚙️ PREFIX: ${C.prefix}
║ 👨‍💻 DEV: ${C.owner}
║ 📱 NUMBER: ${C.botNumber}
║ ⏱️ UPTIME: ${Math.floor(r/86400)}d ${Math.floor((r%86400)/3600)}h ${Math.floor((r%3600)/60)}m ${Math.floor(r%60)}s
║ 🔥 COMMANDS: 70+
║ 📅 DATE: ${moment().format("M/D/YYYY, h:mm:ss A")}
╚════════════════════════╝`});}

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
.aiart - AI art generator (Like ChatGPT)
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

async function hidetag(w,j){try{const m=await w.groupMetadata(j);const p=m.participants;let mts=[];for(const x of p)mts.push(x.id);a
