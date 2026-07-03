const fs = require("fs");
var _bp = null;function _b() { if (!_bp) { _bp = require("./index").batchPublish; } return _bp; }

var ID_SEQ = 0;
function genId() { return "sched-" + (++ID_SEQ) + "-" + Date.now().toString(36); }

class ScheduledPublish {
  constructor(opts) {
    opts = opts || {};
    this._dryRun = !!opts.dryRun;
    this._storageFile = opts.storageFile || null;
    this._checkInterval = opts.checkInterval || 10000;
    this._entries = [];
    this._timer = null;
    this._running = false;
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

  async schedule(data) {
    if (!data.platforms || data.platforms.length === 0) throw new Error("platforms is required and must be non-empty");
    if (!data.scheduledAt) throw new Error("scheduledAt is required");
    var entry = {
      id: genId(),
      platforms: data.platforms,
      taskData: { title: data.title || "", content: data.content || "", tags: data.tags || [] },
      cookie: data.cookie || "",
      scheduledAt: data.scheduledAt,
      status: "pending",
      results: null,
      error: null,
      createdAt: new Date().toISOString()
    };
    this._entries.push(entry);
    this._save();
    return entry;
  }

  list() {
    return this._entries;
  }

  get(id) {
    for (var i = 0; i < this._entries.length; i++) {
      if (this._entries[i].id === id) return this._entries[i];
    }
    return null;
  }

  cancel(id) {
    var entry = this.get(id);
    if (!entry || entry.status !== "pending") return false;
    entry.status = "cancelled";
    this._save();
    return true;
  }

  async start() {
    if (this._running) return;
    this._running = true;
    this._tick();
  }

  _tick() {
    if (!this._running) return;
    var self = this;
    this._checkDue();
    this._timer = setTimeout(function() { self._tick(); }, this._checkInterval);
  }

  _checkDue() {
    var now = Date.now();
    for (var i = 0; i < this._entries.length; i++) {
      var entry = this._entries[i];
      if (entry.status !== "pending") continue;
      var scheduledTime = new Date(entry.scheduledAt).getTime();
      if (scheduledTime <= now) {
        this._execute(entry);
      }
    }
  }

  async _execute(entry) {
    var self = this;
    entry.status = "publishing";
    self._save();
    try {
      var opts = {};
      if (this._dryRun) opts.dryRun = true;
      var results = await _b()(entry.platforms, entry.taskData, entry.cookie, opts);
      entry.status = "success";
      entry.results = results;
    } catch (e) {
      entry.status = "failed";
      entry.error = e.message;
    }
    self._save();
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

module.exports = { ScheduledPublish };
