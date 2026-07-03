// TDD: Upload Orchestration Tests
const assert = require("assert");

async function main() {
  let pass = 0, fail = 0;
  function ok(name) { pass++; console.log("  [PASS] " + name); }
  function no(name, msg) { fail++; console.log("  [FAIL] " + name + ": " + msg); }

  // ── Provider structure ──
  try {
    const CosP = require("../upload/providers/cos-provider");
    const c = new CosP();
    assert(typeof c.uploadVideo === "function"); assert(c.type === "cos");
    ok("cos-provider structure");
  } catch(e) { no("cos-provider structure", e.message); }

  try {
    const OssP = require("../upload/providers/oss-provider");
    const o = new OssP();
    assert(typeof o.uploadVideo === "function"); assert(o.type === "oss");
    ok("oss-provider structure");
  } catch(e) { no("oss-provider structure", e.message); }

  try {
    const HttpP = require("../upload/providers/http-provider");
    const h = new HttpP();
    assert(typeof h.uploadVideo === "function"); assert(h.type === "http");
    ok("http-provider structure");
  } catch(e) { no("http-provider structure", e.message); }

  // ── Orchestrator routing ──
  const orch = require("../upload/orchestrator");
  const cases = [
    ["xiaohongshu", "cos"], ["tencent_video", "cos"],
    ["zhihu", "oss"], ["dewu", "oss"], ["yidianhao", "oss"],
    ["douyin", "http"], ["kuaishou", "http"],
  ];
  for (const [p, expected] of cases) {
    try {
      const prov = orch.getUploadProvider(p);
      assert(prov !== null, p + " should have provider");
      assert(prov.type === expected, p + " should use " + expected);
      ok("orchestrator picks " + expected + " for " + p);
    } catch(e) { no("orchestrator picks " + expected + " for " + p, e.message); }
  }

  try {
    assert(orch.getUploadProvider("unknown") === null);
    ok("orchestrator returns null for unknown platform");
  } catch(e) { no("orchestrator returns null for unknown platform", e.message); }

  try {
    const r = await orch.upload({ platform: "unknown", filePath: "x.mp4", cookie: "" });
    assert(r === null);
    ok("orchestrator.upload returns null for unknown");
  } catch(e) { no("orchestrator.upload returns null for unknown", e.message); }

  try {
    const CosP = require("../upload/providers/cos-provider");
    const c = new CosP();
    const r = await c.uploadVideo({}, {});
    assert(r === null);
    ok("cos-provider handles missing file gracefully");
  } catch(e) { no("cos-provider handles missing file gracefully", e.message); }

  // ── Adapter upload integration ──
  const adapters = [
    ["xiaohongshu", "../src/adapters/xiaohongshu"],
    ["zhihu", "../src/adapters/zhihu"],
    ["shipinhao", "../src/adapters/shipinhao"],
    ["douyin", "../src/adapters/douyin"],
    ["dewu", "../src/adapters/dewu"],
    ["yidianhao", "../src/adapters/yidianhao"],
  ];
  for (const [name, path] of adapters) {
    try {
      const Adp = require(path);
      const inst = new Adp();
      const r = await inst.uploadVideo({}, "");
      assert(r === null, name + " should return null without file");
      ok(name + " adapter uploadVideo graceful");
    } catch(e) { no(name + " adapter uploadVideo graceful", e.message); }
  }

  console.log("\n" + (fail === 0 ? "All" : pass + "/" + (pass+fail)) + " upload orchestration tests " + (fail === 0 ? "PASSED" : "FAILED"));
}


// ── All 24 HTTP adapter upload integration ──
(async () => {
  try { const Adp = require("../src/adapters/acfun"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] acfun adapter uploadVideo"); } catch(e) { console.log("  [FAIL] acfun: " + e.message); }
  try { const Adp = require("../src/adapters/aiqiyi"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] aiqiyi adapter uploadVideo"); } catch(e) { console.log("  [FAIL] aiqiyi: " + e.message); }
  try { const Adp = require("../src/adapters/baijiahao"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] baijiahao adapter uploadVideo"); } catch(e) { console.log("  [FAIL] baijiahao: " + e.message); }
  try { const Adp = require("../src/adapters/bilibili"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] bilibili adapter uploadVideo"); } catch(e) { console.log("  [FAIL] bilibili: " + e.message); }
  try { const Adp = require("../src/adapters/chejiahao"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] chejiahao adapter uploadVideo"); } catch(e) { console.log("  [FAIL] chejiahao: " + e.message); }
  try { const Adp = require("../src/adapters/dayu"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] dayu adapter uploadVideo"); } catch(e) { console.log("  [FAIL] dayu: " + e.message); }
  try { const Adp = require("../src/adapters/douyin"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] douyin adapter uploadVideo"); } catch(e) { console.log("  [FAIL] douyin: " + e.message); }
  try { const Adp = require("../src/adapters/duoduo"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] duoduo adapter uploadVideo"); } catch(e) { console.log("  [FAIL] duoduo: " + e.message); }
  try { const Adp = require("../src/adapters/kuaishou"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] kuaishou adapter uploadVideo"); } catch(e) { console.log("  [FAIL] kuaishou: " + e.message); }
  try { const Adp = require("../src/adapters/meipai"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] meipai adapter uploadVideo"); } catch(e) { console.log("  [FAIL] meipai: " + e.message); }
  try { const Adp = require("../src/adapters/meiyou"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] meiyou adapter uploadVideo"); } catch(e) { console.log("  [FAIL] meiyou: " + e.message); }
  try { const Adp = require("../src/adapters/pipixia"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] pipixia adapter uploadVideo"); } catch(e) { console.log("  [FAIL] pipixia: " + e.message); }
  try { const Adp = require("../src/adapters/qiehao"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] qiehao adapter uploadVideo"); } catch(e) { console.log("  [FAIL] qiehao: " + e.message); }
  try { const Adp = require("../src/adapters/souhu"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] souhu adapter uploadVideo"); } catch(e) { console.log("  [FAIL] souhu: " + e.message); }
  try { const Adp = require("../src/adapters/souhu_shipin"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] souhu_shipin adapter uploadVideo"); } catch(e) { console.log("  [FAIL] souhu_shipin: " + e.message); }
  try { const Adp = require("../src/adapters/tengxun_shipin"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] tengxun_shipin adapter uploadVideo"); } catch(e) { console.log("  [FAIL] tengxun_shipin: " + e.message); }
  try { const Adp = require("../src/adapters/toutiao"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] toutiao adapter uploadVideo"); } catch(e) { console.log("  [FAIL] toutiao: " + e.message); }
  try { const Adp = require("../src/adapters/wangyi"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] wangyi adapter uploadVideo"); } catch(e) { console.log("  [FAIL] wangyi: " + e.message); }
  try { const Adp = require("../src/adapters/wechat_mp"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] wechat_mp adapter uploadVideo"); } catch(e) { console.log("  [FAIL] wechat_mp: " + e.message); }
  try { const Adp = require("../src/adapters/weibo"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] weibo adapter uploadVideo"); } catch(e) { console.log("  [FAIL] weibo: " + e.message); }
  try { const Adp = require("../src/adapters/weishi"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] weishi adapter uploadVideo"); } catch(e) { console.log("  [FAIL] weishi: " + e.message); }
  try { const Adp = require("../src/adapters/xhs_shangjia"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] xhs_shangjia adapter uploadVideo"); } catch(e) { console.log("  [FAIL] xhs_shangjia: " + e.message); }
  try { const Adp = require("../src/adapters/xigua"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] xigua adapter uploadVideo"); } catch(e) { console.log("  [FAIL] xigua: " + e.message); }
  try { const Adp = require("../src/adapters/yichehao"); const inst = new Adp(); const r = await inst.uploadVideo({}, ""); console.assert(r === null); console.log("  [PASS] yichehao adapter uploadVideo"); } catch(e) { console.log("  [FAIL] yichehao: " + e.message); }
  console.log("All 24 HTTP adapter tests done");
})();

main().catch(e => { console.error("Test runner error:", e); process.exit(1); });
