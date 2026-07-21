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
      // R29 修复：JSON.parse("null") 返回 null 不抛异常，后续 .push() 会崩溃
      if (!Array.isArray(this._entries)) this._entries = [];
    } catch(e) {
      this._entries = [];
    }
  }

  _save() {
    if (!this._storageFile) return;
    try {
      const tmpPath = this._storageFile + ".tmp";
      fs.writeFileSync(tmpPath, JSON.stringify(this._entries, null, 2), "utf8");
      fs.renameSync(tmpPath, this._storageFile);
    } catch(e) { console.warn('[audit-log] persist failed:', e.message); }
  }

  async log(data) {
    var entry = {
      id: genId(),
      ownerSubject: typeof data.ownerSubject === "string" ? data.ownerSubject : null,
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

  list(limit, offset, ownerSubject) {
    limit = limit || 50;
    offset = offset || 0;
    var filterByOwner = arguments.length >= 3;
    var expectedOwner = typeof ownerSubject === "string" && ownerSubject ? ownerSubject : null;
    var entries = filterByOwner
      ? this._entries.filter(function(entry) { return entry.ownerSubject === expectedOwner; })
      : this._entries;
    return entries.slice(offset, offset + limit);
  }

  get(id) {
    for (var i = 0; i < this._entries.length; i++) {
      if (this._entries[i].id === id) return this._entries[i];
    }
    return null;
  }

  stats(ownerSubject) {
    var filterByOwner = arguments.length >= 1;
    var expectedOwner = typeof ownerSubject === "string" && ownerSubject ? ownerSubject : null;
    var entries = filterByOwner
      ? this._entries.filter(function(entry) { return entry.ownerSubject === expectedOwner; })
      : this._entries;
    var total = entries.length;
    var success = 0, failed = 0;
    var byType = {};
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.status === "success") success++;
      if (e.status === "failed") failed++;
      byType[e.type] = (byType[e.type] || 0) + 1;
    }
    return { total: total, success: success, failed: failed, byType: byType };
  }

  clear(ownerSubject) {
    var filterByOwner = arguments.length >= 1;
    var expectedOwner = typeof ownerSubject === "string" && ownerSubject ? ownerSubject : null;
    this._entries = filterByOwner
      ? this._entries.filter(function(entry) { return entry.ownerSubject !== expectedOwner; })
      : [];
    this._save();
  }
}

module.exports = { AuditLog };
