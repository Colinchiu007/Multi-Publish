const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");

const CHROMIUM_PATH = "/usr/bin/chromium-browser";
const SS_DIR = "/opt/multipublish/apps/desktop/tests/screenshots";
const COOKIE_FILE = "/opt/multipublish/apps/desktop/tests/bilibili-cookies.json";
const VITE_URL = "http://127.0.0.1:5174/";

if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

let PASS = 0, FAIL = 0;
function assert(step, ok, detail) {
  if (ok) { PASS++; console.log("   [PASS] " + step); }
  else { FAIL++; console.log("   [FAIL] " + step + (detail ? ": " + detail : "")); }
  return ok;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
