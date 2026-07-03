/**
 * PluginLoader 测试 — 加载/校验/错误处理
 */
const PluginLoader = require("../src/plugin-loader");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-test-"));
const PLUGIN_DIR = path.join(TMP, "plugins");

function setup() {
  fs.mkdirSync(PLUGIN_DIR, { recursive: true });
  return new PluginLoader(PLUGIN_DIR);
}

function teardown() {
  fs.rmSync(TMP, { recursive: true, force: true });
}

let fail = 0;
function assert(cond, msg) {
  if (!cond) { console.log("  FAIL " + msg); fail++; }
  else { console.log("  PASS " + msg); }
}

// ─── Create sample plugin files ───

function createPlugin(dir, name, code) {
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, code, "utf-8");
  return fp;
}

// Test 1: Empty plugins dir
(function testEmpty() {
  const loader = setup();
  loader.loadAll();
  assert(loader.count === 0, "empty dir count = 0");
  assert(Object.keys(loader.getAll()).length === 0, "empty getAll");
  teardown();
})();

// Test 2: Load single-file plugin
(function testSingleFile() {
  const loader = setup();
  createPlugin(PLUGIN_DIR, "test-platform.js", `
class TestPlugin {
  get platform() { return "test-platform" }
  get displayName() { return "测试平台" }
  async publish(post, cookie) { return { success: true, publishId: "123" } }
  async validate() { return true }
}
module.exports = TestPlugin;
`);
  loader.loadAll();
  assert(loader.count === 1, "single plugin loaded");
  const p = loader.get("test-platform");
  assert(p !== null, "get returns plugin");
  assert(p.displayName === "测试平台", "displayName correct");
  teardown();
})();

// Test 3: Plugin without platform getter throws
(function testNoPlatform() {
  const loader = setup();
  createPlugin(PLUGIN_DIR, "bad.js", `
class BadPlugin {
  get displayName() { return "bad" }
  async publish() { return {} }
}
module.exports = BadPlugin;
`);
  loader.loadAll();
  assert(loader.count === 0, "bad plugin not loaded");
  assert(loader.getErrors().length === 1, "one error recorded");
  assert(loader.getErrors()[0].file === "bad.js", "error file = bad.js");
  teardown();
})();

// Test 4: Directory plugin (index.js)
(function testDirPlugin() {
  const loader = setup();
  const dir = path.join(PLUGIN_DIR, "dir-plugin");
  fs.mkdirSync(dir);
  createPlugin(dir, "index.js", `
class DirPlugin {
  get platform() { return "dir-platform" }
  get displayName() { return "目录插件" }
}
module.exports = DirPlugin;
`);
  loader.loadAll();
  assert(loader.count === 1, "dir plugin loaded");
  assert(loader.get("dir-platform").displayName === "目录插件", "dir plugin correct");
  teardown();
})();

// Test 5: Duplicate platform detection
(function testDuplicate() {
  const loader = setup();
  createPlugin(PLUGIN_DIR, "dup1.js", `
class Dup1 { get platform() { return "dup" } }
module.exports = Dup1;
`);
  createPlugin(PLUGIN_DIR, "dup2.js", `
class Dup2 { get platform() { return "dup" } }
module.exports = Dup2;
`);
  loader.loadAll();
  assert(loader.count === 1, "only first dup loaded");
  assert(loader.getErrors().length >= 1, "duplicate error recorded");
  teardown();
})();

// Test 6: Mix valid + invalid
(function testMixed() {
  const loader = setup();
  createPlugin(PLUGIN_DIR, "valid.js", `
class Valid { get platform() { return "valid" } }
module.exports = Valid;
`);
  createPlugin(PLUGIN_DIR, "invalid.txt", "this is not a plugin");
  loader.loadAll();
  assert(loader.count === 1, "only .js files are loaded");
  assert(loader.get("valid") !== null, "valid plugin available");
  teardown();
})();

// Test 7: getAll returns metadata
(function testGetAll() {
  const loader = setup();
  createPlugin(PLUGIN_DIR, "meta.js", `
class Meta {
  get platform() { return "meta-test" }
  get displayName() { return "元数据" }
  async publish() { return {} }
}
module.exports = Meta;
`);
  loader.loadAll();
  const all = loader.getAll();
  assert(all["meta-test"] !== undefined, "getAll contains platform");
  assert(all["meta-test"].displayName === "元数据", "getAll displayName");
  assert(all["meta-test"].hasPublish === true, "getAll hasPublish");
  teardown();
})();

console.log(`\n=== ${fail === 0 ? "ALL PASSED" : fail + " FAILED"} ===`);
process.exit(fail > 0 ? 1 : 0);
