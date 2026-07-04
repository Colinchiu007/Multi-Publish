/**
 * RenderEngine 测试
 * 质量节拍日常循环② TDD
 * 先写测试，再改实现
 */

const assert = require("assert");
const RenderEngine = require("../electron/render-engine");

let pass = 0;
let fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
    console.log("  ✅ " + name);
  } catch (e) {
    fail++;
    console.log("  ❌ " + name + ": " + e.message);
  }
}
function eq(a, b) { assert.deepStrictEqual(a, b); }

// ──────────────────────────────────────────────
// 测试组 1：构造函数与基础方法
// ──────────────────────────────────────────────
console.log("\n=== 构造函数与基础方法 ===");

t("new RenderEngine 初始化成功", () => {
  const engine = new RenderEngine();
  eq(engine._currentProcess, null);
  eq(engine._canceled, false);
});

t("getStatus 返回状态对象", () => {
  const engine = new RenderEngine();
  const status = engine.getStatus();
  eq(typeof status.ready, "boolean");
  eq(typeof status.composerExists, "boolean");
  eq(typeof status.nodeModulesExist, "boolean");
  eq(typeof status.composerDir, "string");
});

t("cancel 无进程时不会抛异常", () => {
  const engine = new RenderEngine();
  engine.cancel();
  eq(engine._currentProcess, null);
});

// ──────────────────────────────────────────────
// 测试组 2：render() 参数验证
// ──────────────────────────────────────────────
console.log("\n=== render() 参数验证 ===");

t("props 为 null 返回错误", async () => {
  const engine = new RenderEngine();
  let r = await engine.render(null);
  eq(r.success, false);
  eq(r.error.includes("cuts"), true);
});

t("props.cuts 为空数组返回错误", async () => {
  const engine = new RenderEngine();
  const r = await engine.render({ cuts: [] });
  eq(r.success, false);
  eq(r.error.includes("cuts"), true);
});

t("props.cuts 缺少 id 返回错误", async () => {
  const engine = new RenderEngine();
  const r = await engine.render({ cuts: [{ in_seconds: 0, out_seconds: 5 }] });
  eq(r.success, false);
  eq(r.error.includes("id"), true);
});

t("props.cuts out_seconds <= in_seconds 返回错误", async () => {
  const engine = new RenderEngine();
  const r = await engine.render({ cuts: [{ id: "1", in_seconds: 5, out_seconds: 3 }] });
  eq(r.success, false);
  eq(r.error.includes("out_seconds"), true);
});

// ──────────────────────────────────────────────
// 测试组 3：新方法
// ──────────────────────────────────────────────
console.log("\n=== 新方法 ===");

t("listCompositions 返回所有可用 composition", () => {
  const engine = new RenderEngine();
  eq(typeof engine.listCompositions, "function");
  const list = engine.listCompositions();
  eq(Array.isArray(list), true);
  eq(list.length > 0, true);
  const ids = list.map(c => c.id);
  eq(ids.includes("Explainer"), true);
});

t("listProfiles 返回所有 profile", () => {
  const engine = new RenderEngine();
  eq(typeof engine.listProfiles, "function");
  const profiles = engine.listProfiles();
  eq(Array.isArray(profiles), true);
  eq(profiles.length > 0, true);
  eq(profiles.includes("youtube-landscape"), true);
});

// ──────────────────────────────────────────────
// 测试组 4：render() 新参数签名验证
// ──────────────────────────────────────────────
console.log("\n=== render() 新参数签名 ===");

t("render 方法签名包含 composition 参数", () => {
  const fnStr = RenderEngine.prototype.render.toString();
  eq(fnStr.includes("composition"), true);
});

t("render 方法签名包含 compositionArgs 参数", () => {
  const fnStr = RenderEngine.prototype.render.toString();
  eq(fnStr.includes("compositionArgs"), true);
});

t("render 方法签名包含 renderMode 参数", () => {
  const fnStr = RenderEngine.prototype.render.toString();
  eq(fnStr.includes("renderMode"), true);
});

t("render 方法签名包含 outputFormat 参数", () => {
  const fnStr = RenderEngine.prototype.render.toString();
  eq(fnStr.includes("outputFormat"), true);
});

// ──────────────────────────────────────────────
// 总结
// ──────────────────────────────────────────────
console.log("\n=== 总结: " + pass + " 通过, " + fail + " 失败 ===");
if (fail > 0) process.exit(1);
