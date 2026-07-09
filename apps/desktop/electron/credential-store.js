const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ALGORITHM = "aes-256-gcm";
const SALT = "multi-publish-credential-store-v1";
function key() { return crypto.scryptSync(process.env.MACHINE_ID || process.env.ELECTRON_USER_DATA_DIR || "default", SALT, 32); }
function encrypt(pt) {
  const k = key(); const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv(ALGORITHM, k, iv);
  let e = c.update(pt, "utf-8", "hex"); e += c.final("hex");
  return Buffer.from(iv.toString("hex") + e + c.getAuthTag().toString("hex"), "hex").toString("base64");
}
function decrypt(en) {
  try {
    const k = key(); const r = Buffer.from(en, "base64").toString("hex");
    const d = crypto.createDecipheriv(ALGORITHM, k, Buffer.from(r.slice(0,32),"hex"));
    d.setAuthTag(Buffer.from(r.slice(-32),"hex"));
    let p = d.update(r.slice(32,-32), "hex", "utf-8"); p += d.final("utf-8"); return p;
  } catch { return null; }
}
function cp(id, sd) {
  const d = sd || process.env.ELECTRON_USER_DATA_DIR || path.join(require("os").homedir(), ".multi-publish", "credentials");
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return path.join(d, id + ".cred");
}
function saveCredential(id, data, sd) { fs.writeFileSync(cp(id, sd), encrypt(JSON.stringify(data)), "utf-8"); }
function loadCredential(id, sd) { const f = cp(id, sd); if (!fs.existsSync(f)) return null; const d = decrypt(fs.readFileSync(f,"utf-8").trim()); return d ? JSON.parse(d) : null; }
function hasCredential(id, sd) { return fs.existsSync(cp(id, sd)); }
function deleteCredential(id, sd) { const f = cp(id, sd); if (fs.existsSync(f)) fs.unlinkSync(f); }
module.exports = { saveCredential, loadCredential, hasCredential, deleteCredential };
