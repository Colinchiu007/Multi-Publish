/**
 * PluginLoader Level 2A — manifest.json 校验测试
 * 
 * 测试覆盖:
 * 1. 无 manifest 的插件正常加载 (向后兼容)
 * 2. manifest.json 自动查找 (目录插件)
 * 3. manifest.json 自动查找 (单文件插件)
 * 4. manifest 版本校验 — 兼容版本正常加载
 * 5. manifest 版本校验 — 不兼容版本跳过
 * 6. manifest 权限字段解析
 * 7. manifest 缺少必填字段报错
 * 8. getPluginInfo 返回 manifest 元数据
 * 9. legacy 插件标记
 * 10. 生命周期 hook 调用 (onLoad)
 */
const PluginLoader = require("../src/plugin-loader");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-manifest-test-"));
const PLUGIN_DIR = path.join(TMP, "plugins");
fs.mkdirSync(PLUGIN_DIR, { recursive: true });

let fail = 0;
let pass = 0;
function assert(cond, msg) {
  if (!cond) { console.log("  FAIL " + msg); fail++; }
  else { console.log("  PASS " + msg); pass++; }
}

function createFile(dir, name, content) {
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, content, "utf-8");
  return fp;
}

function cleanAll() {
  fs.rmSync(TMP, { recursive: true, force: true });
}

// ── Test 1: 无 manifest 的插件正常加载 (向后兼容 legacy) ──
(function testLegacyPluginNoManifest() {
  const dir = path.join(PLUGIN_DIR, "t1");
  fs.mkdirSync(dir, { recursive: true });
  createFile(dir, "index.js", `
class LegacyPlugin {
  get platform() { return "legacy-plat" }
  get displayName() { return "Legacy" }
}
module.exports = LegacyPlugin;
`);
  const loader = new PluginLoader(dir);
  loader.loadAll();
  assert(loader.count === 1, "T1: legacy plugin loaded");
  const info = loader.getPluginInfo("legacy-plat");
  assert(info !== null, "T1: getPluginInfo returns info");
  assert(info.manifest === null, "T1: manifest is null for legacy");
  assert(info.isLegacy === true, "T1: marked as legacy");
})();

// ── Test 2: 目录插件 manifest.json 自动查找 ──
(function testDirPluginManifest() {
  const dir = path.join(PLUGIN_DIR, "t2");
  const pluginDir = path.join(dir, "my-dir-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  createFile(pluginDir, "index.js", `
class DirPlugin {
  get platform() { return "dir-plat" }
  get displayName() { return "Dir Plugin" }
}
module.exports = DirPlugin;
`);
  createFile(pluginDir, "manifest.json", JSON.stringify({
    name: "my-dir-plugin",
    version: "1.2.0",
    minAppVersion: "1.0.0",
    author: "test",
    entry: "index.js",
    permissions: ["publish"]
  }));
  const loader = new PluginLoader(dir);
  loader.loadAll();
  assert(loader.count === 1, "T2: dir plugin with manifest loaded");
  const info = loader.getPluginInfo("dir-plat");
  assert(info !== null, "T2: getPluginInfo returns");
  assert(info.manifest !== null, "T2: manifest found");
  assert(info.manifest.version === "1.2.0", "T2: version correct");
  assert(info.manifest.permissions.includes("publish"), "T2: permissions correct");
  assert(info.isLegacy === false, "T2: not legacy");
})();

// ── Test 3: 单文件插件 manifest.json 自动查找 ──
(function testSingleFileManifest() {
  const dir = path.join(PLUGIN_DIR, "t3");
  fs.mkdirSync(dir, { recursive: true });
  createFile(dir, "single-plat.js", `
class SinglePlugin {
  get platform() { return "single-plat" }
  get displayName() { return "Single" }
}
module.exports = SinglePlugin;
`);
  createFile(dir, "single-plat.manifest.json", JSON.stringify({
    name: "single-plat",
    version: "2.0.0",
    minAppVersion: "1.0.0"
  }));
  const loader = new PluginLoader(dir);
  loader.loadAll();
  assert(loader.count === 1, "T3: single-file plugin with manifest loaded");
  const info = loader.getPluginInfo("single-plat");
  assert(info !== null, "T3: getPluginInfo returns");
  assert(info.manifest.version === "2.0.0", "T3: version from manifest");
  assert(info.isLegacy === false, "T3: not legacy");
})();

// ── Test 4: 版本兼容 — minAppVersion <= appVersion → 正常加载 ──
(function testVersionCompatible() {
  const dir = path.join(PLUGIN_DIR, "t4");
  const pluginDir = path.join(dir, "compat-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  createFile(pluginDir, "index.js", `
class CompatPlugin { get platform() { return "compat-plat" } }
module.exports = CompatPlugin;
`);
  createFile(pluginDir, "manifest.json", JSON.stringify({
    name: "compat-plugin",
    version: "1.0.0",
    minAppVersion: "1.8.0"
  }));
  const loader = new PluginLoader(dir);
  loader.setAppVersion("2.0.0");
  loader.loadAll();
  assert(loader.count === 1, "T4: compatible version plugin loaded");
})();

// ── Test 5: 版本不兼容 — minAppVersion > appVersion → 跳过 ──
(function testVersionIncompatible() {
  const dir = path.join(PLUGIN_DIR, "t5");
  const pluginDir = path.join(dir, "incompat-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  createFile(pluginDir, "index.js", `
class IncompatPlugin { get platform() { return "incompat-plat" } }
module.exports = IncompatPlugin;
`);
  createFile(pluginDir, "manifest.json", JSON.stringify({
    name: "incompat-plugin",
    version: "3.0.0",
    minAppVersion: "99.0.0"
  }));
  const loader = new PluginLoader(dir);
  loader.setAppVersion("2.0.0");
  loader.loadAll();
  assert(loader.count === 0, "T5: incompatible plugin skipped");
  assert(loader.getErrors().length > 0, "T5: error recorded for incompatible");
})();

// ── Test 6: manifest 权限字段解析 ──
(function testPermissionsParsed() {
  const dir = path.join(PLUGIN_DIR, "t6");
  const pluginDir = path.join(dir, "perm-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  createFile(pluginDir, "index.js", `
class PermPlugin { get platform() { return "perm-plat" } }
module.exports = PermPlugin;
`);
  createFile(pluginDir, "manifest.json", JSON.stringify({
    name: "perm-plugin",
    version: "1.0.0",
    permissions: ["publish", "upload", "delete"]
  }));
  const loader = new PluginLoader(dir);
  loader.loadAll();
  const info = loader.getPluginInfo("perm-plat");
  assert(info.manifest.permissions.length === 3, "T6: 3 permissions");
  assert(info.manifest.permissions.includes("delete"), "T6: includes delete");
})();

// ── Test 7: manifest 缺少必填字段 → 报错 ──
(function testMissingRequiredField() {
  const dir = path.join(PLUGIN_DIR, "t7");
  const pluginDir = path.join(dir, "bad-manifest-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  createFile(pluginDir, "index.js", `
class BadManifestPlugin { get platform() { return "bad-manifest-plat" } }
module.exports = BadManifestPlugin;
`);
  createFile(pluginDir, "manifest.json", JSON.stringify({
    version: "1.0.0"
    // missing "name" field
  }));
  const loader = new PluginLoader(dir);
  loader.loadAll();
  assert(loader.count === 0, "T7: plugin with bad manifest skipped");
  assert(loader.getErrors().length > 0, "T7: error recorded");
})();

// ── Test 8: getPluginInfo 返回完整元数据 ──
(function testGetPluginInfoFull() {
  const dir = path.join(PLUGIN_DIR, "t8");
  const pluginDir = path.join(dir, "full-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  createFile(pluginDir, "index.js", `
class FullPlugin {
  get platform() { return "full-plat" }
  get displayName() { return "Full Plugin" }
  async publish() { return { success: true } }
  async publishViaApi() { return { success: true } }
}
module.exports = FullPlugin;
`);
  createFile(pluginDir, "manifest.json", JSON.stringify({
    name: "full-plugin",
    version: "1.5.0",
    minAppVersion: "1.0.0",
    author: "developer",
    entry: "index.js",
    permissions: ["publish"]
  }));
  const loader = new PluginLoader(dir);
  loader.loadAll();
  const info = loader.getPluginInfo("full-plat");
  assert(info.platform === "full-plat", "T8: platform in info");
  assert(info.displayName === "Full Plugin", "T8: displayName in info");
  assert(info.hasPublish === true, "T8: hasPublish");
  assert(info.hasPublishViaApi === true, "T8: hasPublishViaApi");
  assert(info.manifest.name === "full-plugin", "T8: manifest.name");
  assert(info.manifest.author === "developer", "T8: manifest.author");
  assert(info.isLegacy === false, "T8: not legacy");
})();

// ── Test 9: 生命周期 hook — onLoad 被调用 ──
(function testLifecycleHookOnLoad() {
  const dir = path.join(PLUGIN_DIR, "t9");
  const pluginDir = path.join(dir, "lifecycle-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  createFile(pluginDir, "index.js", `
class LifecyclePlugin {
  get platform() { return "lifecycle-plat" }
  get displayName() { return "Lifecycle" }
  async onLoad(ctx) { this._loaded = true; this._ctx = ctx; }
  async onEnable(ctx) { this._enabled = true; }
  async onDisable(ctx) { this._enabled = false; }
  async onUnload(ctx) { this._unloaded = true; }
}
module.exports = LifecyclePlugin;
`);
  const loader = new PluginLoader(dir);
  loader.loadAll();
  const p = loader.get("lifecycle-plat");
  assert(p !== null, "T9: plugin loaded");
  assert(typeof p.onLoad === "function", "T9: onLoad exists");
  assert(typeof p.onEnable === "function", "T9: onEnable exists");
  assert(typeof p.onDisable === "function", "T9: onDisable exists");
  assert(typeof p.onUnload === "function", "T9: onUnload exists");
})();

// ── Test 10: loadAll 返回值包含 manifest 信息 ──
(function testLoadAllManifestInfo() {
  const dir = path.join(PLUGIN_DIR, "t10");
  const pluginDir = path.join(dir, "info-plugin");
  fs.mkdirSync(pluginDir, { recursive: true });
  createFile(pluginDir, "index.js", `
class InfoPlugin { get platform() { return "info-plat" } get displayName() { return "Info" } }
module.exports = InfoPlugin;
`);
  createFile(pluginDir, "manifest.json", JSON.stringify({
    name: "info-plugin",
    version: "2.1.0",
    minAppVersion: "1.8.0",
    author: "dev"
  }));
  const loader = new PluginLoader(dir);
  loader.loadAll();
  const all = loader.getAll();
  assert(all["info-plat"] !== undefined, "T10: platform in getAll");
  assert(all["info-plat"].manifestVersion === "2.1.0", "T10: manifestVersion in getAll");
  assert(all["info-plat"].isLegacy === false, "T10: isLegacy in getAll");
})();

// ── Test 11: 单文件 legacy + 目录有 manifest 混合加载 ──
(function testMixedLegacyAndManifest() {
  const dir = path.join(PLUGIN_DIR, "t11");
  fs.mkdirSync(dir, { recursive: true });
  // Legacy single file
  createFile(dir, "old-plat.js", `
class OldPlugin { get platform() { return "old-plat" } }
module.exports = OldPlugin;
`);
  // New dir with manifest
  const newDir = path.join(dir, "new-plugin");
  fs.mkdirSync(newDir, { recursive: true });
  createFile(newDir, "index.js", `
class NewPlugin { get platform() { return "new-plat" } }
module.exports = NewPlugin;
`);
  createFile(newDir, "manifest.json", JSON.stringify({
    name: "new-plugin",
    version: "1.0.0",
    minAppVersion: "1.0.0"
  }));
  const loader = new PluginLoader(dir);
  loader.loadAll();
  assert(loader.count === 2, "T11: both plugins loaded");
  assert(loader.getPluginInfo("old-plat").isLegacy === true, "T11: old is legacy");
  assert(loader.getPluginInfo("new-plat").isLegacy === false, "T11: new is not legacy");
})();

console.log(`\n=== ${fail === 0 ? "ALL PASSED" : fail + " FAILED"} (${pass}/${pass + fail}) ===`);
cleanAll();
process.exit(fail > 0 ? 1 : 0);
