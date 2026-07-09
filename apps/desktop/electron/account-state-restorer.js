// @ts-check
const fs = require("fs");
const path = require("path");
const os = require("os");
const DEFAULT_DIR = path.join(os.homedir(), ".multi-publish", "accounts");
function dir(d) { return d || process.env.ACCOUNT_STATE_DIR || DEFAULT_DIR; }
function fp(d) { return path.join(dir(d), "account-records.jsonl"); }
function saveAccountRecord(record, storageDir) {
  const d = dir(storageDir);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  fs.appendFileSync(fp(storageDir), JSON.stringify({ ...record, savedAt: new Date().toISOString() }) + "\n", "utf-8");
}
function getAccountRecord(platform, accountId, storageDir) {
  const f = fp(storageDir);
  if (!fs.existsSync(f)) return null;
  for (const line of fs.readFileSync(f, "utf-8").trim().split("\n").filter(Boolean)) {
    try { const r = JSON.parse(line); if (r.platform === platform && r.accountId === accountId) return r; } catch {}
  }
  return null;
}
function listAccountRecords(storageDir) {
  const f = fp(storageDir);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, "utf-8").trim().split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
module.exports = { saveAccountRecord, getAccountRecord, listAccountRecords };
