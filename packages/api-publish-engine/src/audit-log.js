const fs = require("fs");

var ID_SEQ = 0;
function genId() { return "log-" + (++ID_SEQ) + "-" + Date.now().toString(36); }

class AuditLog {
  constructor(opts) {
    opts = opts || {};
    this._storageFile = opts.storageFile || null;
    this._entries = [];
    if (this._storageFile) this._load();
  }

  _load() {
    try {
      var raw = fs.readFileSync(this._storageFile, "utf8");
      this._entries = JSON.parse(raw);
    } catch(e) {
      this._entries = [];
    }
  }

  _save() {
    if (!this._storageFile) return;
    try { fs.writeFileSync(this._storageFile, JSON.stringify(this._entries, null, 2), "utf8"); } catch(e) {}
  }

  async log(data) {
    var entry = {
      id: genId(),
      type: data.type || "publish",
      platform: data.platform || "",
      title: data.title || "",
      status: data.status || "unknown",
      error: data.error || null,
      publishId: data.publishId || null,
      details: data.details || null,
      createdAt: new Date().toISOString()
    };
    this._entries.unshift(entry);  // newest first
    this._save();
    return entry;
  }

  list(limit, offset) {
    limit = limit || 50;
    offset = offset || 0;
    return this._entries.slice(offset, offset + limit);
  }

  get(id) {
    for (var i = 0; i < this._entries.length; i++) {
      if (this._entries[i].id === id) return this._entries[i];
    }
    return null;
  }

  stats() {
    var total = this._entries.length;
    var success = 0, failed = 0;
    var byType = {};
    for (var i = 0; i < this._entries.length; i++) {
      var e = this._entries[i];
      if (e.status === "success") success++;
      if (e.status === "failed") failed++;
      byType[e.type] = (byType[e.type] || 0) + 1;
    }
    return { total: total, success: success, failed: failed, byType: byType };
  }

  clear() {
    this._entries = [];
    this._save();
  }
}

module.exports = { AuditLog };