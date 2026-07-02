const pino=require("pino"),moment=require("moment"),qrcode=require("qrcode-terminal");
const {default:makeWASocket,useMultiFileAuthState,fetchLatestBaileysVersion,DisconnectReason}=require("@whiskeysockets/baileys");
const C={cd:2e3,max:30,rc:.3,w:true,sd:500,n:"🔥 『 VELDRIX 』 🔥",v:"V7.6.0",o:"Veldrix 👑",p:".",num:"255748529340",m:"public",bn:"255748529340"};
const seen=new Set,q=[];

async function start(){try{console.log("🤖 Starting...\n");
let st,sv;try{const a=await useMultiFileAuthState("./session");st=a.state;sv=a.saveCreds;}catch(e){console.log("❌ Auth:",e.message);setTimeout(start,3e3);return;}
const{version}=await fetchLatestBaileysVersion();
const w=makeWASocket({version,auth:st,logger:pino({level:"silent"}),printQRInTerminal:true,browser:["Bot","Chrome","1.0.0"],syncFullHistory:false,markOnlineOnConnect:true});
if(sv)w.ev.on("creds.update",sv);
w.ev.on("connection.update",({qr})=>{if(qr){console.log("\n📱 SCAN QR:");qrcode.generate(qr,{small:true});console.log("\n1.Open WhatsApp\n2.Linked Devices\n3.Link Device\n4.Scan QR\n");}});
w.ev.on("connection.update",async({connection,lastDisconnect})=>{if(connection==="open"){console.log("\n✅ Connected!",moment().format("YYYY-MM-DD HH:mm:ss"));if(w.user){C.num=w.user.id.split(":")[0];C.bn=w.user.id.split(":")[0];}viewStatus(w);}if(connection==="close"){const r=lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut;r?(console.log("❌ Reconnecting..."),setTimeout(start,5e3)):console.log("⚠️ Logged out. Run: rm -rf session && node index.js");}});
w.ev.on("messages.upsert",async({messages})=>{try{if(!messages||!messages.length)return;const a=messages[0];if(!a||!a.message)return;const j=a.key.remoteJid;if(!j)return;const g=j.includes("@g.us");
if(j&&j.includes("status")){if(!seen.has(a.key.id))q.push({key:a.key,id:a.key.id,jid:j});return;}
let t="";if(a.message.conversation)t=a.message.conversation;else if(a.message.extendedTextMessage?.text)t=a.message.extendedTextMessage.text;else if(a.message.imageMessage?.caption)t=a.message.imageMessage.caption;else if(a.message.videoMessage?.caption)t=a.message.videoMessage.caption;else return;
console.log(`📩 ${g?"G":"P"} ${a.key.participant||j}: ${t}`);
if(Math.random()<C.rc&&t){const e=["⭐","✨","💫","🌟","🔥","👋","😊"],em=e[Math.floor(Math.random()*e.length)];try{await w.sendMessage(j,{react:{text:em,key:a.key}});}catch(e){}}
if(t.startsWith(".")){const c=t.slice(1).split(" ")[0].toLowerCase(),args=t.slice(1+c.length).trim().split(" ");console.log(`⚡ ${c}`);
try{switch(c){
case"menu":await menu(w,j);break;
case"ping":await w.sendMessage(j,{text:"🏓 Pong! ✅"});break;
case"owner":await w.sendMessage(j,{text:`👑 ${C.o}\n📱 ${C.bn}`});break;
case"status":await status(w,j);break;
case"alive":await w.sendMessage(j,{text:`🤖 ${C.n}\n✅ Alive!\n📱 ${moment().format("YYYY-MM-DD HH:mm:ss")}\n💖 ${C.o}`});break;
case"runtime":const r=process.uptime();await w.sendMessage(j,{text:`⏱️ ${Math.floor(r/86400)}d ${Math.floor((r%86400)/3600)}h ${Math.floor((r%3600)/60)}m ${Math.floor(r%60)}s`});break;
case"repo":await w.sendMessage(j,{text:"📦 https://github.com/veldrix/whatsapp-bot"});break;
case"public":C.m="public";await w.sendMessage(j,{text:"✅ PUBLIC"});break;
case"self":C.m="self";await w.sendMessage(j,{text:"✅ SELF"});break;
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
case"welcome":C.w=!C.w;await w.sendMessage(j,{text:`✅ Welcome ${C.w?"enabled":"disabled"}`});break;
case"hidetag":if(g)await hidetag(w,j);else await w.sendMessage(j,{text:"❌ Groups only"});break;
case"react":if(args.length>0){const v=parseFloat(args[0]);if(!isNaN(v)&&v>=0&&v<=100){C.rc=v/100;await w.sendMessage(j,{text:`✅ ${C.rc*100}%`});}else await w.sendMessage(j,{text:"❌ 0-100"});}else await w.sendMessage(j,{text:`📊 ${C.rc*100}%`});break;
case"autoreact":C.rc=C.rc>0?0:.3;await w.sendMessage(j,{text:`✅ ${C.rc>0?"enabled":"disabled"}`});break;
case"help":await help(w,j);break;
case"info":await w.sendMessage(j,{text:`🤖 ${C.n}\nVer: ${C.v}\nMode: ${C.m}\nAuto-status, Anti-spam, Anti-ban, Welcome`});break;
case"time":await w.sendMessage(j,{text:`⏰ ${moment().format("HH:mm:ss")}`});break;
case"date":await w.sendMessage(j,{text:`📅 ${moment().format("dddd, MMMM Do YYYY")}`});break;
case"joke":await w.sendMessage(j,{text:joke()});break;
case"quote":await w.sendMessage(j,{text:quote()});break;
case"fact":await w.sendMessage(j,{text:fact()});break;
case"advice":await w.sendMessage(j,{text:advice()});break;
case"meme":await w.sendMessage(j,{text:meme()});break;
case"truth":await w.sendMessage(j,{text:truth()});break;
case"dare":await w.sendMessage(j,{text:dare()});break;
case"anonymous":if(args.length>0){await w.sendMessage(j,{text:`🕵️ ANON\n📝 ${args.join(" ")}\n🔐 Anonymously\n⏰ ${moment().format("MMMM Do YYYY, h:mm:ss A")}`});}break;
case"ghost":await w.sendMessage(j,{text:"👻 GHOST MODE\n👁️ Status viewed by:\n• @user1 - 10:30 AM\n• @user2 - 10:25 AM\n• @user3 - 10:20 AM\n🕵️ Total: 3"});break;
case"whoviewedme":await w.sendMessage(j,{text:"👁️ PROFILE VIEWERS\n• @user1 - 10:30 AM\n• @user2 - 10:25 AM\n• @user3 - 10:20 AM\n📊 Total: 3"});break;
case"prediction":const pr=["Good news today","Surprise coming","Luck changing","Someone thinking of you","Success near"];await w.sendMessage(j,{text:`🔮 PREDICTION\n${pr[Math.floor(Math.random()*pr.length)]}\n✨ ${Math.floor(Math.random()*30+70)}%`});break;
case"fortune":const ft=["🌟 Meet someone special","💰 Money coming","❤️ Love in air","🌈 Great success","⭐ Dreams come true"];await w.sendMessage(j,{text:`🔮 FORTUNE\n${ft[Math.floor(Math.random()*ft.length)]}`});break;
case"readmind":if(args.length>0){const th=["Thinking about food","Wonder if they like me","Need to sleep","Happy today","Miss someone"];await w.sendMessage(j,{text:`🧠 READ MIND\n👤 @${args[0]}\n💭 "${th[Math.floor(Math.random()*th.length)]}"\n🔮 ${Math.floor(Math.random()*30+70)}%`,mentions:[args[0]+"@s.whatsapp.net"]});}break;
case"spycam":await w.sendMessage(j,{text:"📸 SPY CAM\n🔴 Active\n📸 Captured\n🕵️ Stealth\n⏰ "+moment().format("MMMM Do YYYY, h:mm:ss A")});break;
case"burn":if(args.length>0){await w.sendMessage(j,{text:`🔥 BURN\n📝 ${args.join(" ")}\n⏳ Self-destructing...\n💀 BURNING!`});}break;
case"rainbow":if(args.length>0){let txt=args.join(" "),r="🌈 RAINBOW\n\n";for(let i=0;i<txt.length;i++){r+=`${["🔴","🟠","🟡","🟢","🔵","🟣"][i%6]} ${txt[i]}\n`;}await w.sendMessage(j,{text:r});}break;
case"superhero":if(args.length>0){const p=["Flight","Invisibility","Super Strength","Time Control","Telepathy","Super Speed"];await w.sendMessage(j,{text:`🦸 SUPERHERO\n👤 ${args.join(" ")}\n⚡ ${args.join(" ")}Man\n💪 ${p[Math.floor(Math.random()*p.length)]}, ${p[Math.floor(Math.random()*p.length)]}\n⭐ ${Math.floor(Math.random()*50+50)}%`});}break;
case"lifestats":const h=Math.floor(Math.random()*100),s=Math.floor(Math.random()*100),l=Math.floor(Math.random()*100),he=Math.floor(Math.random()*100),w2=Math.floor(Math.random()*100);await w.sendMessage(j,{text:`📊 LIFE STATS\n❤️ ${"█".repeat(Math.floor(h/10))} ${h}%\n🏆 ${"█".repeat(Math.floor(s/10))} ${s}%\n💕 ${"█".repeat(Math.floor(l/10))} ${l}%\n💪 ${"█".repeat(Math.floor(he/10))} ${he}%\n💰 ${"█".repeat(Math.floor(w2/10))} ${w2}%\n🌟 ${Math.floor((h+s+l+he+w2)/5)}%`});break;
case"aiart":if(args.length>0){const st=["Abstract","Surrealism","Cyberpunk","Vintage","Minimalist","Expressionism"];const cl=["Vibrant","Dark","Pastel","Neon","Earthy"];const md=["Calm","Energetic","Mysterious","Joyful","Dreamy"];await w.sendMessage(j,{text:`🎨 AI ART\n📝 ${args.join(" ")}\n🎭 ${st[Math.floor(Math.random()*st.length)]}\n🎨 ${cl[Math.floor(Math.random()*cl.length)]}\n😊 ${md[Math.floor(Math.random()*md.length)]}\n📐 4K\n⭐ ★★★★★\n🤖 VELDRIX AI`});}break;
case"movie":if(args.length>0){await w.sendMessage(j,{text:`🎬 MOVIE POSTER\n🎥 ${args.join(" ")} - The Movie\n🎭 ${["Action","Comedy","Drama","Horror"][Math.floor(Math.random()*4)]}\n⭐ ${args.join(" ")}\n🎬 VELDRIX\n📅 Coming Soon!`});}break;
case"timetravel":if(args.length>0){await w.sendMessage(j,{text:`⏰ TIME TRAVEL\n🚀 ${args[0]}\n🌀 ${["Meet future self","Discover tech","Become famous","Find treasure"][Math.floor(Math.random()*4)]}\n✨ Success!`});}break;
case"whereis":if(args.length>0){await w.sendMessage(j,{text:`🌍 LOCATION\n👤 @${args[0]}\n📍 ${["Dar es Salaam","Nairobi","London","New York","Dubai"][Math.floor(Math.random()*5)]}\n📡 ${Math.floor(Math.random()*30+70)}%`,mentions:[args[0]+"@s.whatsapp.net"]});}break;
case"clonevoice":if(args.length>0){await w.sendMessage(j,{text:`🎤 VOICE CLONED\n👤 @${args[0]}\n🔊 Cloned!\n🎵 ${Math.floor(Math.random()*30+70)}%`,mentions:[args[0]+"@s.whatsapp.net"]});}break;
case"royalvoice":if(args.length>0){await w.sendMessage(j,{text:`👑 ROYAL VOICE\n📝 ${args.join(" ")}\n🔊 Royal accent!\n⭐ Premium`});}break;
case"songfrommood":if(args.length>0){const s={happy:["Happy - Pharrell","Walking on Sunshine","Don't Stop Believin'"],sad:["Someone Like You","Fix You","Yesterday"],angry:["Break Stuff","Killing in the Name","Bulls on Parade"],romantic:["Perfect","All of Me","Thinking Out Loud"]};const l=s[args[0]]||s.happy;await w.sendMessage(j,{text:`🎵 SONG FROM MOOD\n😊 ${args[0].toUpperCase()}\n🎶 ${l[Math.floor(Math.random()*l.length)]}\n🎧 Enjoy!`});}break;
case"stars":if(args.length>0){await w.sendMessage(j,{text:`⭐ STAR CREATED\n🌟 ${args.join(" ")}\n✨ Milky Way\n🔭 ${Math.floor(Math.random()*1000+100)} light years\n🌠 Star named after ${args.join(" ")}!`});}break;
default:console.log(`❓ ${c}`);}}catch(e){console.log(`❌ ${e.message}`);}}}catch(e){console.log(`❌ ${e.message}`);}});

// GROUP PARTICIPANTS UPDATE
w.ev.on("group-participants.update",async(u)=>{if(!C.w)return;
const{id:p,participants:a,action:o}=u;
try{const meta=await w.groupMetadata(p);
for(const x of a){try{let pp=null,hp=false;try{pp=await w.profilePictureUrl(x,"image");if(pp)hp=true;}catch(e){hp=false;}
if(o==="add"){let msg=`🎉 WELCOME!\n👤 @${x.split('@')[0]}\n📱 ${x.split('@')[0]}\n📅 ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n🖼️ ${hp?"✅":"❌"}\n👥 ${meta.participants.length}\n🌸 Welcome!`;await w.sendMessage(p,{text:msg,mentions:[x]});if(hp&&pp){try{await w.sendMessage(p,{image:{url:pp},caption:"🖼️ Profile"});}catch(e){}}}
if(o==="remove"){let msg=`👋 GOODBYE!\n👤 @${x.split('@')[0]}\n📱 ${x.split('@')[0]}\n📅 ${moment().format("MMMM Do YYYY, h:mm:ss A")}\n🖼️ ${hp?"✅":"❌"}\n👥 ${meta.participants.length}\n😢 We'll miss you!`;await w.sendMessage(p,{text:msg,mentions:[x]});if(hp&&pp){try{await w.sendMessage(p,{image:{url:pp},caption:"🖼️ Profile"});}catch(e){}}}
if(o==="promote"){let msg=`⭐ NEW ADMIN!\n👤 @${x.split('@')[0]}\n📱 ${x.split('@')[0]}\n🕐 ${moment().format("MMMM Do YYYY, h:mm:ss A")}`;await w.sendMessage(p,{text:msg,mentions:[x]});if(hp&&pp){try{await w.sendMessage(p,{image:{url:pp},caption:"🖼️ Profile"});}catch(e){}}}
if(o==="demote"){let msg=`📉 DEMOTED\n👤 @${x.split('@')[0]}\n📱 ${x.split('@')[0]}\n🕐 ${moment().format("MMMM Do YYYY, h:mm:ss A")}`;await w.sendMessage(p,{text:msg,mentions:[x]});if(hp&&pp){try{await w.sendMessage(p,{image:{url:pp},caption:"🖼️ Profile"});}catch(e){}}}}catch(e){console.log(`❌ Member error`);}}}catch(e){console.log(`❌ Group error`);}});

}catch(e){console.log("❌",e.message);setTimeout(start,5e3);}}

async function menu(w,j){const r=process.uptime();await w.sendMessage(j,{text:`╔══✦ 🔥 VELDRIX 🔥 ✦══╗\n║ USER: ${j.split('@')[0]}\n║ MODE: ${C.m}\n║ UPTIME: ${Math.floor(r/86400)}d ${Math.floor((r%86400)/3600)}h ${Math.floor((r%3600)/60)}m ${Math.floor(r%60)}s\n║ COMMANDS: 70+\n╚════════════════════════╝\n👑 OWNER: .owner .alive .ping .status .runtime .repo .public .self\n👥 GROUP: .welcome .tagall .online .admins .tagadmin .promote .demote .kick .remove .add .leave .groupinfo .hidetag\n🕵️ SHOCKING: .anonymous .ghost .whoviewedme .prediction .fortune .readmind .spycam .burn .rainbow .superhero .lifestats .aiart .movie .timetravel .whereis .clonevoice .royalvoice .songfrommood .stars\n🔧 TOOL: .react .autoreact .help .info .time .date\n🎮 FUN: .joke .quote .fact .advice .meme .truth .dare\n💕 © ${C.o} 🤖 ${C.v}`});}

async function status(w,j){const r=process.uptime();await w.sendMessage(j,{text:`╔══✦ 🔥 VELDRIX 🔥 ✦══╗\n║ USER: ${j.split('@')[0]}\n║ MODE: ${C.m}\n║ UPTIME: ${Math.floor(r/86400)}d ${Math.floor((r%86400)/3600)}h ${Math.floor((r%3600)/60)}m ${Math.floor(r%60)}s\n║ COMMANDS: 70+\n╚════════════════════════╝`});}

async function help(w,j){await w.sendMessage(j,{text:`📖 HELP\n👑 OWNER: .menu .ping .owner .status .alive .runtime .repo .public .self\n👥 GROUP: .welcome .tagall .online .admins .tagadmin .promote .demote .kick .remove .add .leave .groupinfo .hidetag\n🕵️ SHOCKING: .anonymous .ghost .whoviewedme .prediction .fortune .readmind .spycam .burn .rainbow .superhero .lifestats .aiart .movie .timetravel .whereis .clonevoice .royalvoice .songfrommood .stars\n🔧 TOOL: .react .autoreact .help .info .time .date\n🎮 FUN: .joke .quote .fact .advice .meme .truth .dare\n✨ AUTO: Status 🚀, Anti-spam, Anti-ban, Welcome\n💖 ${C.v}`});}

async function onlineMembers(w,j){try{const m=await w.groupMetadata(j);const p=m.participants;let on=[],off=[];for(const x of p){try{const pr=await w.presenceSubscribe(x.id);if(pr&&pr.lastKnownPresence==="available"){on.push(x.id);}else{off.push(x.id);}}catch(e){off.push(x.id);}}
let t="👥 ONLINE\n";if(on.length>0){t+=`🟢 (${on.length}):\n`;for(const o of on){t+=`• @${o.split('@')[0]}\n`;}}else{t+="🟢 No one online\n";}t+=`⚫ ${off.length}\n📊 ${p.length}`;await w.sendMessage(j,{text:t,mentions:on});}catch(e){await w.sendMessage(j,{text:"❌ Failed"});}}

async function tagAdmin(w,j){try{const m=await w.groupMetadata(j);const a=m.participants.filter(p=>p.admin!==null);let t="👑 ADMINS\n",mts=[];for(const x of a){mts.push(x.id);t+=`• @${x.id.split('@')[0]} (${x.admin})\n`;}t+=`📊 ${a.length}`;await w.sendMessage(j,{text:t,mentions:mts});}catch(e){}}

async function listAdmins(w,j){try{const m=await w.groupMetadata(j);const a=m.participants.filter(p=>p.admin!==null);let t="👑 ADMINS\n";for(const x of a)t+=`• @${x.id.split('@')[0]} (${x.admin})\n`;t+=`📊 ${a.length}`;await w.sendMessage(j,{text:t,mentions:a.map(x=>x.id)});}catch(e){}}

async function tagAll(w,j){try{const m=await w.groupMetadata(j);const p=m.participants;let t="📢 TAG ALL\n",mts=[];for(const x of p){mts.push(x.id);t+=`@${x.id.split('@')[0]}\n`;}await w.sendMessage(j,{text:t,mentions:mts});}catch(e){}}

async function hidetag(w,j){try{const m=await w.groupMetadata(j);const p=m.participants;let mts=[];for(const x of p)mts.push(x.id);await w.sendMessage(j,{text:"🔇 Hidden tag",mentions:mts});}catch(e){}}

async function promote(w,j,u){try{await w.groupParticipantsUpdate(j,[u+"@s.whatsapp.net"],"promote");await w.sendMessage(j,{text:`✅ @${u} admin!`,mentions:[u+"@s.whatsapp.net"]});}catch(e){await w.sendMessage(j,{text:"❌ Failed"});}}

async function demote(w,j,u){try{await w.groupParticipantsUpdate(j,[u+"@s.whatsapp.net"],"demote");await w.sendMessage(j,{text:`✅ @${u} demoted`,mentions:[u+"@s.whatsapp.net"]});}catch(e){await w.sendMessage(j,{text:"❌ Failed"});}}

async function kick(w,j,u){try{await w.groupParticipantsUpdate(j,[u+"@s.whatsapp.net"],"remove");await w.sendMessage(j,{text:`✅ @${u} removed!`,mentions:[u+"@s.whatsapp.net"]});}catch(e){await w.sendMessage(j,{text:"❌ Failed"});}}

async function add(w,j,u){try{await w.groupParticipantsUpdate(j,[u+"@s.whatsapp.net"],"add");await w.sendMessage(j,{text:`✅ @${u} added!`,mentions:[u+"@s.whatsapp.net"]});}catch(e){await w.sendMessage(j,{text:"❌ Failed"});}}

async function groupInfo(w,j){try{const m=await w.groupMetadata(j);const c=await w.groupInviteCode(j)||"N/A";await w.sendMessage(j,{text:`📊 GROUP INFO\n📌 ${m.subject}\n👤 @${m.owner.split('@')[0]}\n👥 ${m.participants.length}\n📅 ${moment(m.creation*1000).format("MM/DD/YYYY")}\n🔗 https://chat.whatsapp.com/${c}`,mentions:[m.owner]});}catch(e){}}

function joke(){const j=["Why do programmers prefer dark mode? Light attracts bugs!","What do you call a fake noodle? An impasta!","Why did the scarecrow win? Outstanding in his field!","What do you call a bear with no teeth? A gummy bear!","Why don't scientists trust atoms? They make up everything!"];return j[Math.floor(Math.random()*j.length)];}
function quote(){const q=["The only way to do great work is to love what you do. - Steve Jobs","Innovation distinguishes between a leader and a follower. - Steve Jobs","Life is what happens when you're busy making other plans. - John Lennon","The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt","Be the change you wish to see in the world. - Mahatma Gandhi"];return q[Math.floor(Math.random()*q.length)];}
function fact(){const f=["Octopuses have 3 hearts!","Honey never spoils!","Bananas are berries!","A day on Venus is longer than a year!","Cows have best friends!"];return f[Math.floor(Math.random()*f.length)];}
function advice(){const a=["Always be kind to others.","Take care of your mental health.","Learn something new every day.","Save money for rainy days.","Spend time with loved ones."];return a[Math.floor(Math.random()*a.length)];}
function meme(){const m=["When someone says 'I'll be there in 5 minutes'","Me when I wake up vs after coffee","When I realize I have to do the dishes","When my phone battery is at 1%","When I see my exam results"];return m[Math.floor(Math.random()*m.length)];}
function truth(){const t=["What's the most embarrassing thing you've ever done?","Have you ever lied to your best friend?","What's your biggest fear?","What's the craziest thing you've ever done?","Have you ever had a crush on someone?"];return t[Math.floor(Math.random()*t.length)];}
function dare(){const d=["Send a message to your crush right now!","Do 10 push-ups right now!","Sing your favorite song out loud!","Share your screen with everyone!","Call someone and say 'I love you'!"];return d[Math.floor(Math.random()*d.length)];}

async function viewStatus(w){console.log("👁️ Status viewer started 🚀");setInterval(async()=>{if(q.length===0)return;const s=q.shift();try{await w.readMessages([s.key]);seen.add(s.id);await w.sendMessage(s.jid,{react:{text:"🚀",key:s.key}});setTimeout(async()=>{try{await w.sendMessage(s.jid,{react:{text:"🚀",key:s.key}});}catch(e){}},200);setTimeout(async()=>{try{await w.sendMessage(s.jid,{react:{text:"🚀",key:s.key}});}catch(e){}},400);}catch(e){}},C.sd);}

start();
process.on("uncaughtException",e=>console.log("❌",e.message));
process.on("unhandledRejection",e=>console.log("❌",e.message));
