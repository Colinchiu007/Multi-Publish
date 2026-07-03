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

main().catch(e => { console.error("Test runner error:", e); process.exit(1); });
