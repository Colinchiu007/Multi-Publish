/**
 * PluginLoader Level 2B — dynamic enable/disable/reload
 */
const PluginLoader = require("../src/plugin-loader");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-dynamic-test-"));
const PLUGIN_DIR = path.join(TMP, "plugins");
let fail = 0, pass = 0;
function assert(cond, msg) { if(!cond) { console.log("  FAIL " + msg); fail++; } else { console.log("  PASS " + msg); pass++; } }
function createPlugin(dir, name, code) { fs.writeFileSync(path.join(dir, name), code, "utf-8"); }
function createDirPlugin(baseDir, pluginName, code) { const dir = path.join(baseDir, pluginName); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, "index.js"), code, "utf-8"); return dir; }

(function testDisableEnable() { // T1
  const dir = path.join(PLUGIN_DIR, "t1"); fs.mkdirSync(dir, { recursive: true });
  createPlugin(dir, "a.js", "class A { get platform() { return \"a\" } } module.exports = A;");
  const loader = new PluginLoader(dir); loader.loadAll();
  assert(loader.count === 1, "T1 loaded");
  assert(loader.isEnabled("a") === true, "T1 initially enabled");
  loader.disable("a");
  assert(loader.isEnabled("a") === false, "T1 disabled");
  assert(loader.get("a") === null, "T1 get null after disable");
  assert(loader.count === 1, "T1 count unchanged");
  loader.enable("a");
  assert(loader.isEnabled("a") === true, "T1 re-enabled");
  assert(loader.get("a") !== null, "T1 get instance after re-enable");
  fs.rmSync(dir, { recursive: true, force: true }); })();

(function testIdempotent() { // T2
  const dir = path.join(PLUGIN_DIR, "t2"); fs.mkdirSync(dir, { recursive: true });
  createPlugin(dir, "b.js", "class B { get platform() { return \"b\" } } module.exports = B;");
  const loader = new PluginLoader(dir); loader.loadAll();
  loader.disable("b"); loader.disable("b");
  assert(loader.isEnabled("b") === false, "T2 double disable noop");
  loader.enable("b"); loader.enable("b");
  assert(loader.isEnabled("b") === true, "T2 double enable noop");
  fs.rmSync(dir, { recursive: true, force: true }); })();

(function testDisableUnknown() { // T3
  const loader = new PluginLoader(PLUGIN_DIR);
  try { loader.disable("nonexistent"); assert(false, "T3 should throw"); } catch(e) { assert(true, "T3 throws on unknown"); } })();

(function testEnableUnknown() { // T4
  const loader = new PluginLoader(PLUGIN_DIR);
  try { loader.enable("nonexistent"); assert(false, "T4 should throw"); } catch(e) { assert(true, "T4 throws on unknown"); } })();

(function testReload() { // T5
  const dir = path.join(PLUGIN_DIR, "t5"); fs.mkdirSync(dir, { recursive: true });
  createPlugin(dir, "c.js", "class C { get platform() { return \"c\" } get displayName() { return \"C\" } } module.exports = C;");
  const loader = new PluginLoader(dir); loader.loadAll();
  assert(loader.get("c") !== null, "T5 loaded");
  loader.reload("c");
  assert(loader.get("c") !== null, "T5 after reload");
  assert(loader.isEnabled("c") === true, "T5 enabled after reload");
  fs.rmSync(dir, { recursive: true, force: true }); })();

(function testReloadUnknown() { // T6
  const loader = new PluginLoader(PLUGIN_DIR);
  try { loader.reload("nonexistent"); assert(false, "T6 should throw"); } catch(e) { assert(true, "T6 throws on unknown"); } })();

(function testGetEnabledDisabled() { // T7
  const dir = path.join(PLUGIN_DIR, "t7"); fs.mkdirSync(dir, { recursive: true });
  createPlugin(dir, "x.js", "class X { get platform() { return \"x\" } } module.exports = X;");
  createPlugin(dir, "y.js", "class Y { get platform() { return \"y\" } } module.exports = Y;");
  createPlugin(dir, "z.js", "class Z { get platform() { return \"z\" } } module.exports = Z;");
  const loader = new PluginLoader(dir); loader.loadAll();
  assert(Object.keys(loader.getEnabled()).length === 3, "T7 all enabled");
  assert(Object.keys(loader.getDisabled()).length === 0, "T7 none disabled");
  loader.disable("y");
  assert(Object.keys(loader.getEnabled()).length === 2, "T7 2 enabled");
  assert(Object.keys(loader.getDisabled()).length === 1, "T7 1 disabled");
  assert(loader.getDisabled()["y"] !== undefined, "T7 y in disabled");
  fs.rmSync(dir, { recursive: true, force: true }); })();

(function testHooksCalled() { // T8
  const dir = path.join(PLUGIN_DIR, "t8");
  createDirPlugin(dir, "hook-p", "class HP { get platform() { return \"hp\" } constructor() { this._ec=0; this._dc=0; } async onEnable(c) { this._ec++; } async onDisable(c) { this._dc++; } } module.exports = HP;");
  const loader = new PluginLoader(dir); loader.loadAll();
  const p = loader.get("hp");
  assert(p._ec === 0, "T8 onEnable not called on load");
  loader.disable("hp");
  assert(p._dc === 1, "T8 onDisable called");
  loader.enable("hp");
  assert(loader.get("hp")._ec === 1, "T8 onEnable called on re-enable");
  fs.rmSync(dir, { recursive: true, force: true }); })();

(function testInfoShowsEnabled() { // T9
  const dir = path.join(PLUGIN_DIR, "t9"); fs.mkdirSync(dir, { recursive: true });
  createPlugin(dir, "i.js", "class I { get platform() { return \"i\" } } module.exports = I;");
  const loader = new PluginLoader(dir); loader.loadAll();
  assert(loader.getPluginInfo("i").isEnabled === true, "T9 getPluginInfo enabled");
  loader.disable("i");
  assert(loader.getPluginInfo("i").isEnabled === false, "T9 getPluginInfo disabled");
  fs.rmSync(dir, { recursive: true, force: true }); })();

fs.rmSync(TMP, { recursive: true, force: true });
console.log("\n=== "+(fail===0?"ALL PASSED":fail+" FAILED")+" ("+pass+"/"+(pass+fail)+") ===");
process.exit(fail>0?1:0);