const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Test the config-loader module
var mod;
try { mod = require("../src/config-loader"); } catch(e) { mod = null; }
var loadConfig = mod ? mod.loadConfig : null;
var mergeConfigs = mod ? mod.mergeConfigs : null;

let p=0,f=0;
function t(n,fn){try{fn();p++;console.log("  OK "+n)}catch(e){f++;console.log("  FAIL "+n+": "+e.message)}}
function eq(a,b){assert.deepStrictEqual(a,b)}

var tmpDir = fs.mkdtempSync("config-test-");

console.log("--- Module exports ---");
t("loadConfig is exported", function() { eq(typeof loadConfig, "function"); });
t("mergeConfigs is exported", function() { eq(typeof mergeConfigs, "function"); });

console.log("\n--- mergeConfigs ---");
t("CLI args override env vars", function() {
  var defaults = { port: 3000, dryRun: false };
  var env = { port: 4000, dryRun: true };
  var cli = { port: 5000 };
  var result = mergeConfigs(defaults, env, cli);
  eq(result.port, 5000);
  eq(result.dryRun, true);
});

t("env vars override defaults", function() {
  var defaults = { port: 3000, dryRun: false };
  var env = { dryRun: true };
  var result = mergeConfigs(defaults, env, {});
  eq(result.port, 3000);
  eq(result.dryRun, true);
});

t("defaults used when nothing overrides", function() {
  var result = mergeConfigs({ port: 3000, dryRun: false }, {}, {});
  eq(result.port, 3000);
  eq(result.dryRun, false);
});

t("config file merges correctly", function() {
  var defaults = { port: 3000, dryRun: false, apiKey: null };
  var configFile = { port: 8080, apiKey: "from-config" };
  var env = {};
  var cli = {};
  var result = mergeConfigs(defaults, env, cli, configFile);
  eq(result.port, 8080);
  eq(result.apiKey, "from-config");
  eq(result.dryRun, false);
});

t("config file < env vars < CLI args precedence", function() {
  var defaults = { port: 3000, dryRun: false };
  var configFile = { port: 1000, dryRun: true };
  var env = { port: 2000 };
  var cli = { port: 3000 };
  var result = mergeConfigs(defaults, env, cli, configFile);
  eq(result.port, 3000); // CLI wins
});

console.log("\n--- loadConfig ---");
t("loadConfig returns defaults when no file", function() {
  var result = loadConfig({ configFile: null });
  eq(typeof result, "object");
  eq(result.port, 3000);
});

t("loadConfig reads JSON config file", function() {
  var configPath = path.join(tmpDir, "test-config.json");
  fs.writeFileSync(configPath, JSON.stringify({ port: 8888, dryRun: true }));
  var result = loadConfig({ configFile: configPath });
  eq(result.port, 8888);
  eq(result.dryRun, true);
  fs.unlinkSync(configPath);
});

t("loadConfig CLI args override config file", function() {
  var configPath = path.join(tmpDir, "test-override.json");
  fs.writeFileSync(configPath, JSON.stringify({ port: 1111, dryRun: true }));
  var result = loadConfig({ configFile: configPath, cliArgs: { port: 2222 } });
  eq(result.port, 2222);  // CLI wins
  eq(result.dryRun, true);
  fs.unlinkSync(configPath);
});

t("loadConfig handles missing file gracefully", function() {
  var result = loadConfig({ configFile: "/nonexistent/config.json" });
  eq(typeof result, "object");
  eq(typeof result.port, "number");
});

t("loadConfig handles invalid JSON", function() {
  var configPath = path.join(tmpDir, "bad-config.json");
  fs.writeFileSync(configPath, "not json content");
  var result = loadConfig({ configFile: configPath });
  eq(typeof result, "object");  // Returns defaults on error
  fs.unlinkSync(configPath);
});

t("loadConfig resolves relative paths", function() {
  var configPath = "test-config-relative.json";
  var absPath = path.join(process.cwd(), configPath);
  fs.writeFileSync(absPath, JSON.stringify({ port: 7777 }));
  var result = loadConfig({ configFile: configPath });
  eq(result.port, 7777);
  fs.unlinkSync(absPath);
});

console.log("\n--- Config env vars ---");
t("loadConfig reads env vars", function() {
  process.env.PORT = "9999";
  process.env.DRY_RUN = "true";
  var result = loadConfig({ readEnv: true });
  eq(result.port, 9999);
  eq(result.dryRun, true);
  delete process.env.PORT;
  delete process.env.DRY_RUN;
});

t("loadConfig --config CLI arg works", function() {
  var configPath = path.join(tmpDir, "cli-config.json");
  fs.writeFileSync(configPath, JSON.stringify({ port: 6666 }));
  var result = loadConfig({ cliArgs: { config: configPath } });
  eq(result.port, 6666);
  fs.unlinkSync(configPath);
});

// Cleanup
try { fs.rmdirSync(tmpDir); } catch(e) {}

console.log("\n========== Result: "+p+"/"+(p+f)+" ==========");
if(f)process.exit(1);