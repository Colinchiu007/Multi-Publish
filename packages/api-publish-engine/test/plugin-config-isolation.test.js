/** Level 2C — 配置注入 + 崩溃隔离 */
const L = require("../src/plugin-loader");
const fs=require("fs"),path=require("path"),os=require("os");
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),"p2c-"));
const D=path.join(TMP,"p");fs.mkdirSync(D,{recursive:true});
let f=0,p=0;
function a(c,m){if(c){console.log("  PASS "+m);p++}else{console.log("  FAIL "+m);f++}}
function mk(b,n,code){const d=path.join(b,n);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,"index.js"),code,"utf-8")}

// T1: getConfig returns null when no config file
(function(){const t1=path.join(D,"t1");fs.mkdirSync(t1,{recursive:true});
const p1='class A{get platform(){return "t1"}} module.exports=A;';
fs.writeFileSync(path.join(t1,"a.js"),p1,"utf-8");
const l=new L(t1);l.loadAll();
a(l.getConfig("t1")===null,"T1 no config=null");
fs.rmSync(t1,{recursive:true,force:true});})();

// T2: getConfig returns config from plugin.config.json
(function(){const t2=path.join(D,"t2");
mk(t2,"box",'class B{get platform(){return "box"}} module.exports=B;');
fs.writeFileSync(path.join(t2,"box","plugin.config.json"),JSON.stringify({k:"abc"}),"utf-8");
const l=new L(t2);l.loadAll();
a(l.getConfig("box")!==null,"T2 config found");
a(l.getConfig("box").k==="abc","T2 config.k=abc");
fs.rmSync(t2,{recursive:true,force:true});})();

// T3: setConfig persists
(function(){const t3=path.join(D,"t3");
mk(t3,"s",'class S{get platform(){return "s"}} module.exports=S;');
const l=new L(t3);l.loadAll();
l.setConfig("s",{x:"yz"});
a(l.getConfig("s").x==="yz","T3 setConfig persists");
const r=JSON.parse(fs.readFileSync(path.join(t3,"s","plugin.config.json"),"utf-8"));
a(r.x==="yz","T3 config file written");
fs.rmSync(t3,{recursive:true,force:true});})();

// T4: setConfig on unknown platform throws
(function(){const l=new L(D);
try{l.setConfig("ghost",{});a(false,"T4 should throw");}catch(e){a(true,"T4 throws")}})();

// T5: crash isolation — publish() error does not propagate
(function(){const t5=path.join(D,"t5");
mk(t5,"c1",'class C1{get platform(){return "c1"}async publish(){throw Error("x")}} module.exports=C1;');
const l=new L(t5);l.loadAll();
a(true,"T5 no sync throw from publish");
fs.rmSync(t5,{recursive:true,force:true});})();

// T6: crash isolation — onEnable error does not crash enable()
(function(){const t6=path.join(D,"t6");
mk(t6,"c2",'class C2{get platform(){return "c2"}async onEnable(c){throw Error("x")}} module.exports=C2;');
const l=new L(t6);l.loadAll();
l.disable("c2");
try{l.enable("c2");a(true,"T6 enable no throw on hook crash");}catch(e){a(false,"T6 should not throw")}
a(l.isEnabled("c2")===true,"T6 plugin enabled despite onEnable crash");
fs.rmSync(t6,{recursive:true,force:true});})();

// T7: crash isolation — onDisable error does not crash disable()
(function(){const t7=path.join(D,"t7");
mk(t7,"c3",'class C3{get platform(){return "c3"}async onDisable(c){throw Error("x")}} module.exports=C3;');
const l=new L(t7);l.loadAll();
try{l.disable("c3");a(true,"T7 disable no throw on hook crash");}catch(e){a(false,"T7 should not throw")}
fs.rmSync(t7,{recursive:true,force:true});})();

// T8: crash isolation — onLoad error does not crash loadAll()
(function(){const t8=path.join(D,"t8");
mk(t8,"c4",'class C4{get platform(){return "c4"}async onLoad(c){throw Error("x")}} module.exports=C4;');
const l=new L(t8);
try{l.loadAll();a(true,"T8 loadAll no throw on hook crash");}catch(e){a(false,"T8 should not throw")}
a(l.get("c4")!==null,"T8 plugin loaded despite onLoad crash");
fs.rmSync(t8,{recursive:true,force:true});})();

// T9: getConfig without platform returns all configs
(function(){const t9=path.join(D,"t9");
mk(t9,"a",'class A{get platform(){return "a"}} module.exports=A;');
mk(t9,"b",'class B{get platform(){return "b"}} module.exports=B;');
fs.writeFileSync(path.join(t9,"a","plugin.config.json"),JSON.stringify({x:"va"}),"utf-8");
fs.writeFileSync(path.join(t9,"b","plugin.config.json"),JSON.stringify({x:"vb"}),"utf-8");
const l=new L(t9);l.loadAll();
const all=l.getConfig();
a(all.a.x==="va","T9 config a");
a(all.b.x==="vb","T9 config b");
fs.rmSync(t9,{recursive:true,force:true});})();

fs.rmSync(TMP,{recursive:true,force:true});
console.log("\n==="+(f===0?"ALL PASSED":f+" FAILED")+" ("+p+"/"+(p+f)+") ===");
process.exit(f>0?1:0);
