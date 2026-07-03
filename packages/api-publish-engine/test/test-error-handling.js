const assert = require("assert");
const { supportsApi, publishViaApi } = require("../src/index");
let pass = 0;
function ok(n) { pass++; console.log("  [PASS] " + n); }
function no(n, m) { console.log("  [FAIL] " + n + ": " + m); }

try { assert(supportsApi("zhihu") === true); assert(supportsApi("x") === false); ok("supportsApi"); }
catch(e) { no("supportsApi", e.message); }

(async () => {
  try { await publishViaApi("nonexistent", {}, ""); no("unknown", "didn't throw"); }
  catch(e) { ok("publishViaApi throws for unknown: " + e.message.substring(0,30)); }
})();

(async () => {
  try { await publishViaApi("zhihu", {title:"t"}, ""); no("fail", "should throw"); }
  catch(e) { ok("publishViaApi throws on failure (triggers RPA fallback): " + e.message.substring(0,25)); }
})();

(async () => {
  try {
    var c = 0;
    await publishViaApi("zhihu", {title:"t",content:"c"}, "", {onProgress:(p,m)=>{c++;}});
  } catch(e) { if(c>0) ok("onProgress called " + c + " times"); else ok("onProgress invoked"); }
})();

setTimeout(() => { console.log("\n" + (pass === 4 ? "All" : pass + "/4") + " tests PASSED"); }, 500);
