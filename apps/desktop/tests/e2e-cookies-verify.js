const { chromium: cr } = require("playwright");
const fs = require("fs"), path = require("path"), http = require("http");
const CP = "/usr/bin/chromium-browser";
const SD = "/opt/multipublish/apps/desktop/tests/screenshots";
const CF = "/opt/multipublish/apps/desktop/tests/bilibili-cookies.json";
const VU = "http://127.0.0.1:5174/";
if (!fs.existsSync(SD)) fs.mkdirSync(SD, {recursive:true});
let p=0,f=0;
function as(st,ok,dt){if(ok){p++;console.log("  [PASS] "+st);}else{f++;console.log("  [FAIL] "+st+(dt?": "+dt:""));}}
function sl(m){return new Promise(r=>setTimeout(r,m));}
async function t1(b){console.log("\n== Test1: Web Login ==");
if(!fs.existsSync(CF)){return;}
const c=JSON.parse(fs.readFileSync(CF,"utf8"));as("cookies file",c.length>=3,"count="+c.length);
const ctx=await b.newContext({viewport:{width:1920,height:1080},locale:"zh-CN",timezoneId:"Asia/Shanghai"});
try{await ctx.addCookies(c);const pg=await ctx.newPage();
await pg.goto("https://www.bilibili.com/",{waitUntil:"networkidle",timeout:30000});await sl(3000);
await pg.screenshot({path:path.join(SD,"e2e-cookies-home.png")});
const i=await pg.evaluate(()=>({a:!!document.querySelector(".bili-avatar"),b:document.querySelector(".unlogin")===null}));
as("bilibili.com logged in",i.a||i.b);await pg.close();
}catch(e){console.log("  [FAIL] "+e.message);}finally{ctx.close();}}
async function t2(b){console.log("\n== Test2: API ==");
const ctx=await b.newContext({viewport:{width:1920,height:1080},locale:"zh-CN",timezoneId:"Asia/Shanghai"});
try{const c=JSON.parse(fs.readFileSync(CF,"utf8"));await ctx.addCookies(c);const pg=await ctx.newPage();
const r=await pg.goto("https://api.bilibili.com/x/web-interface/nav",{waitUntil:"networkidle",timeout:15000});
const d=JSON.parse(await r.text());
if(d.code===0&&d.data){
const u=d.data.uname||"?",id=d.data.mid||"?";
console.log("  User:"+u+" UID:"+id);as("nav user info",!!d.data.uname,"name="+d.data.uname);
as("UID matches 294210842",String(d.data.mid)==="294210842","got="+d.data.mid);
await pg.goto("https://space.bilibili.com/"+id,{waitUntil:"networkidle",timeout:15000});await sl(2000);
await pg.screenshot({path:path.join(SD,"e2e-cookies-space.png")});
}else as("nav API",false,JSON.stringify(d));
await pg.goto("https://member.bilibili.com/platform/home",{waitUntil:"networkidle",timeout:20000});
const fu=pg.url();as("creator center no redirect",fu.includes("member.bilibili.com")&&!fu.includes("login"),"url="+fu);
await sl(2000);await pg.screenshot({path:path.join(SD,"e2e-cookies-creator.png")});
await pg.close();await ctx.close();
}catch(e){console.log("  [FAIL] "+e.message);try{await ctx.close()}catch(_){};}}
async function t3(b){console.log("\n== Test3: UI ==");
const ctx=await b.newContext({viewport:{width:1920,height:1080},locale:"zh-CN",timezoneId:"Asia/Shanghai"});
try{const pg=await ctx.newPage();await pg.goto(VU,{waitUntil:"networkidle",timeout:30000});await sl(3000);
await pg.evaluate(()=>{window.location.hash="#/accounts";});await sl(3000);
const mock=[{id:1,name:"GZH",account_name:"GZH",is_default:true,platform:"wechat_mp",status:"active"},{id:2,name:"Zhihu",account_name:"Zhihu",is_default:true,platform:"zhihu",status:"active"},{id:3,name:"Bili Main",account_name:"Bili Main",is_default:true,platform:"bilibili",status:"active"},{id:4,name:"Bili Logged",account_name:"Bili Logged",is_default:false,platform:"bilibili",status:"active"}];
const ds = String.fromCharCode(36);
const code = "(d)=>{try{const a=document.querySelector('#app');if(!a||!a.__vue_app__)return false;const pi=a.__vue_app__.config.globalProperties."+ds+"pinia;if(!pi||!pi._s)return false;const s=pi._s.get('accounts');if(s){s."+ds+"patch({accounts:d});return true;}return false;}catch(e){return false;}}";
await pg.evaluate(new Function('return ' + code)(), mock);
await sl(1000);await pg.screenshot({path:path.join(SD,"e2e-cookies-accounts.png")});
const ba=await pg.evaluate(()=>{const r=[];document.querySelectorAll(".account-row").forEach(x=>{const t=x.textContent||"";if(t.includes("Bili"))r.push(t.trim().substring(0,50));});return r;});
as("Bili accounts visible",ba.length>=1,"count="+ba.length);await pg.close();await ctx.close();
}catch(e){console.log("  [FAIL] "+e.message);try{await ctx.close()}catch(_){};}}
async function main(){
console.log("===== Cookie Reuse E2E =====");
const v=await new Promise(r=>http.get(VU,{timeout:3000},(res)=>{res.resume();r(true);}).on("error",()=>r(false)));
if(v)console.log("  [PASS] Vite OK");else console.log("  [FAIL] Vite down");
if(!fs.existsSync(CF)){console.log("[FAIL] no cookie");process.exit(1);}
const br=await cr.launch({headless:true,executablePath:CP,args:["--no-sandbox","--disable-gpu","--disable-dev-shm-usage"]});
try{await t1(br);await t2(br);await t3(br);console.log("\n===== PASS="+p+" FAIL="+f+" =====");}catch(e){console.error("FATAL:"+e.message);}
finally{await br.close();}
process.exit(f>0?1:0);}
main();