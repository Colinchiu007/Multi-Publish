/**
 * 插件系统集成测试
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const { getAdapter, supportsApi, pluginLoader } = require("../src/index");

let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log("  FAIL " + msg); fail++; }
  else { console.log("  PASS " + msg); }
}

function main() {
  // 1. Built-in adapter still works
  const douyinAdapter = getAdapter("douyin");
  assert(douyinAdapter !== null, "built-in douyin adapter available");

  // 2. supportsApi works
  assert(supportsApi("douyin") === true, "supportsApi douyin = true");
  assert(supportsApi("xiaohongshu") === true, "supportsApi xiaohongshu = true");
  assert(supportsApi("nonexistent") === false, "supportsApi nonexistent = false");

  // 3. PluginLoader exists
  assert(pluginLoader !== undefined, "pluginLoader exported");
  assert(typeof pluginLoader.loadAll === "function", "pluginLoader.loadAll exists");

  // 4. No plugins by default
  const plugins = pluginLoader.getAll();
  assert(Object.keys(plugins).length === 0, "no plugins by default");

  // 5. Create and load a temp plugin
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-int-"));
  const pluginsDir = path.join(tmpDir, "plugins");
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(path.join(pluginsDir, "test-int.js"), `
class IntPlugin {
  get platform() { return "test-int-platform" }
  get displayName() { return "集成测试插件" }
  async publish(post, cookie) {
    return { success: true, publishId: "int-123", platform: "test-int-platform" }
  }
}
module.exports = IntPlugin;
`, "utf-8");

  const PluginLoader = require("../src/plugin-loader");
  const customLoader = new PluginLoader(pluginsDir);
  customLoader.loadAll();
  assert(customLoader.count === 1, "custom loader loads 1 plugin");

  const p = customLoader.get("test-int-platform");
  assert(p !== null, "custom loader has plugin");
  assert(p.displayName === "集成测试插件", "plugin displayName correct");

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n=== ${fail === 0 ? "ALL PASSED" : fail + " FAILED"} ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
