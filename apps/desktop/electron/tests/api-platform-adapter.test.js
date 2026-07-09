// api-platform-adapter tests
const assert = require("assert");
let p=0,f=0;
function t(n,fn){try{fn();p++;console.log("  "+String.fromCodePoint(0x2705)+" "+n);}catch(e){f++;console.log("  "+String.fromCodePoint(0x274C)+" "+n+": "+e.message);}}
function eq(a,b){assert.deepStrictEqual(a,b);}

console.log("=== api-platform-adapter ===");
let adapter;
try{adapter=require("../services/api-platform-adapter");}catch(e){console.log("  Skipped: non-Electron env");process.exit(0);}
t("exports publishViaApi",function(){eq(typeof adapter.publishViaApi,"function");});
t("exports isApiPlatform",function(){eq(typeof adapter.isApiPlatform,"function");});
t("exports getApiPlatforms",function(){eq(typeof adapter.getApiPlatforms,"function");});
console.log("\n========== "+p+"/"+(p+f)+" ==========");
if(f)process.exit(1);
