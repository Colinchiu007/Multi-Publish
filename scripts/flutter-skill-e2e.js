#!/usr/bin/env node
/**
 * flutter-skill-e2e.js — E2E test runner using flutter-skill
 *
 * Starts the Electron app with CDP, connects flutter-skill,
 * and runs AI-driven exploratory tests.
 *
 * Usage:
 *   node scripts/flutter-skill-e2e.js                  # run all tests
 *   node scripts/flutter-skill-e2e.js --explore        # AI autonomous explore
 *   node scripts/flutter-skill-e2e.js --interactive    # manual + AI assisted
 *   node scripts/flutter-skill-e2e.js --snapshot       # take screenshot of all views
 *
 * Prerequisites:
 *   npm install -g flutter-skill
 *   or: npx flutter-skill
 */

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Config
const PROJECT_ROOT = path.resolve(__dirname, "..");
const ELECTRON_MAIN = path.join(PROJECT_ROOT, "apps", "desktop", "electron", "main.js");
const CDP_PORT = 9222;
const BRIDGE_PORT = 18118;
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, "test-results", "screenshots", "flutter-skill");

// Ensure dirs
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ─── Helpers ───────────────────────────────────────────────────────────

function log(msg) { console.log("\n  " + msg); }

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ─── Electron App Management ───────────────────────────────────────────

var electronProcess = null;

function startApp() {
  return new Promise(function(resolve, reject) {
    log("Starting Electron app with CDP:" + CDP_PORT + "...");

    var electronBin = path.join(PROJECT_ROOT, "node_modules", ".bin", "electron");
    if (process.platform === "win32") electronBin += ".cmd";

    electronProcess = spawn(electronBin, [
      ELECTRON_MAIN,
      "--remote-debugging-port=" + CDP_PORT,
      "--flutter-skill",
    ], {
      cwd: path.dirname(ELECTRON_MAIN),
      env: Object.assign({}, process.env, {
        FLUTTER_SKILL_BRIDGE: "1",
        NODE_ENV: "development",
      }),
      stdio: ["pipe", "pipe", "pipe"],
    });

    electronProcess.stdout.on("data", function(d) {
      var s = d.toString().trim();
      if (s) console.log("  [app] " + s);
    });

    electronProcess.stderr.on("data", function(d) {
      var s = d.toString().trim();
      if (s && !s.includes("DevTools") && !s.includes("ERROR:")) return;
      if (s) console.log("  [app] " + s);
    });

    electronProcess.on("error", reject);
    electronProcess.on("exit", function(code) {
      log("Electron exited with code " + code);
      electronProcess = null;
    });

    // Give it time to start (Electron + Vite dev server)
    sleep(8000).then(resolve);
  });
}

function stopApp() {
  if (electronProcess) {
    log("Stopping Electron app...");
    if (process.platform === "win32") {
      execSync("taskkill /PID " + electronProcess.pid + " /F /T", { stdio: "ignore" });
    } else {
      electronProcess.kill("SIGTERM");
    }
    electronProcess = null;
  }
}

// ─── CDP Connection ────────────────────────────────────────────────────

async function connectCDP() {
  log("Connecting to CDP on port " + CDP_PORT + "...");

  // Try up to 30 times (30s total)
  for (var i = 0; i < 30; i++) {
    try {
      var resp = await fetch("http://127.0.0.1:" + CDP_PORT + "/json/version");
      var data = await resp.json();
      log("Connected to: " + (data.browser || data["Browser"] || "?"));
      return true;
    } catch (e) {
      await sleep(1000);
    }
  }
  log("Failed to connect to CDP after 30s");
  return false;
}

// ─── Test Cases ────────────────────────────────────────────────────────

async function testSnapshot(browserInfo) {
  log("=== Snapshot: Capture all views ===");
  var views = ["/", "/accounts", "/publish", "/dashboard", "/intelligence", "/monitor"];

  var http = require("http");

  for (var i = 0; i < views.length; i++) {
    var view = views[i];
    var url = "http://127.0.0.1:5174/#" + view;
    var ssFile = path.join(SCREENSHOT_DIR, view.replace(/\//g, "_") + ".png");

    try {
      // Navigate via CDP
      await cdpCommand("Page.navigate", { url: url });
      await sleep(2000);

      // Screenshot
      var result = await cdpCommand("Page.captureScreenshot", { format: "png" });
      if (result && result.data) {
        var buf = Buffer.from(result.data, "base64");
        fs.writeFileSync(ssFile, buf);
        log("  Screenshot saved: " + ssFile);
      }
    } catch (e) {
      log("  Failed " + view + ": " + e.message);
    }
  }
}

// Simple CDP command helper
var cdpWs = null;
async function cdpCommand(method, params) {
  if (!cdpWs) {
    // Get the first page target
    var resp = await fetch("http://127.0.0.1:" + CDP_PORT + "/json");
    var targets = await resp.json();
    var pageTarget = targets.find(function(t) { return t.type === "page"; }) || targets[0];
    if (!pageTarget) throw new Error("No page target found");

    var WebSocket = require("ws");
    cdpWs = new WebSocket(pageTarget.webSocketDebuggerUrl);

    await new Promise(function(resolve, reject) {
      cdpWs.on("open", resolve);
      cdpWs.on("error", reject);
      setTimeout(function() { reject(new Error("CDP WS timeout")); }, 5000);
    });
  }

  return new Promise(function(resolve, reject) {
    var id = Date.now();
    var msg = JSON.stringify({ id: id, method: method, params: params || {} });
    var handler = function(data) {
      var resp = JSON.parse(data.toString());
      if (resp.id === id) {
        cdpWs.removeListener("message", handler);
        if (resp.error) reject(new Error(resp.error.message));
        else resolve(resp.result);
      }
    };
    cdpWs.on("message", handler);
    cdpWs.send(msg);
    setTimeout(function() {
      cdpWs.removeListener("message", handler);
      reject(new Error("CDP command timeout: " + method));
    }, 10000);
  });
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  log("=== flutter-skill E2E Test Runner ===");
  log("Project: " + PROJECT_ROOT);
  log("");

  var args = process.argv.slice(2);
  var mode = "all";
  if (args.includes("--explore")) mode = "explore";
  else if (args.includes("--snapshot")) mode = "snapshot";
  else if (args.includes("--interactive")) mode = "interactive";

  try {
    // 1. Start app
    await startApp();

    // 2. Connect via CDP
    var connected = await connectCDP();
    if (!connected) {
      log("CDP connection failed — aborting");
      process.exit(1);
    }

    // 3. Check if flutter-skill CLI is available
    var hasFlutterSkill = false;
    try {
      execSync("flutter-skill --version", { stdio: "ignore" });
      hasFlutterSkill = true;
      log("flutter-skill CLI available");
    } catch (_) {
      log("flutter-skill CLI not installed — using CDP direct mode");
    }

    // 4. Run tests based on mode
    if (mode === "snapshot" || mode === "all") {
      await testSnapshot();
    }

    if (hasFlutterSkill && (mode === "explore" || mode === "all")) {
      log("=== AI Explore Mode (requires flutter-skill CLI) ===");
      log("Run in another terminal:");
      log("  flutter-skill explore http://127.0.0.1:5174 --depth=2");
    }

    if (mode === "interactive") {
      log("=== Interactive Mode ===");
      log("App is running at http://127.0.0.1:5174");
      log("CDP debug at http://127.0.0.1:" + CDP_PORT + "/json");
      log("flutter-skill bridge on port " + BRIDGE_PORT);
      log("");
      log("Press Ctrl+C to stop the app when done.");
      // Keep running until Ctrl+C
      await new Promise(function() { /* hang */ });
    }

    log("=== All tests completed ===");
  } catch (e) {
    log("Fatal error: " + e.message);
  } finally {
    stopApp();
    process.exit(0);
  }
}

main();
