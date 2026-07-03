const fs = require("fs");
var _bp = null;
function _b() { if (!_bp) { _bp = require("./index").batchPublish; } return _bp; }

var ID_SEQ = 0;
function genId() { return "plan-" + (++ID_SEQ) + "-" + Date.now().toString(36); }

class PublishingPlan {
  constructor(opts) {
    opts = opts || {};
    this._dryRun = !!opts.dryRun;
    this._storageFile = opts.storageFile || null;
    this._plans = [];
    if (this._storageFile) this._load();
  }

  _load() {
    try { var raw = fs.readFileSync(this._storageFile, "utf8"); this._plans = JSON.parse(raw); } catch(e) { this._plans = []; }
  }

  _save() {
    if (!this._storageFile) return;
    try { fs.writeFileSync(this._storageFile, JSON.stringify(this._plans, null, 2), "utf8"); } catch(e) {}
  }

  async create(data) {
    if (!data || !data.name) throw new Error("Plan name is required");
    if (!data.items || data.items.length === 0) throw new Error("At least one item is required");
    var items = data.items.map(function(item) {
      return {
        id: genId(),
        platform: item.platform,
        title: item.title || "",
        content: item.content || "",
        tags: item.tags || [],
        cookie: item.cookie || "",
        scheduledAt: item.scheduledAt || null,
        status: "pending",
        result: null,
        error: null
      };
    });
    var plan = {
      id: genId(),
      name: data.name,
      items: items,
      status: "draft",
      createdAt: new Date().toISOString(),
      completedAt: null
    };
    this._plans.push(plan);
    this._save();
    return plan;
  }

  list() { return this._plans; }

  get(id) {
    for (var i = 0; i < this._plans.length; i++) { if (this._plans[i].id === id) return this._plans[i]; }
    return null;
  }

  delete(id) {
    var idx = -1;
    for (var i = 0; i < this._plans.length; i++) { if (this._plans[i].id === id) { idx = i; break; } }
    if (idx === -1) return false;
    this._plans.splice(idx, 1);
    this._save();
    return true;
  }

  async execute(id) {
    var plan = this.get(id);
    if (!plan) return { success: false, error: "Plan not found" };
    plan.status = "active";
    this._save();
    var allOk = true;
    for (var i = 0; i < plan.items.length; i++) {
      var item = plan.items[i];
      if (item.status !== "pending") continue;
      item.status = "publishing";
      try {
        var opts = {};
        if (this._dryRun) opts.dryRun = true;
        var platforms = Array.isArray(item.platform) ? item.platform : [item.platform];
        var results = await _b()(platforms, { title: item.title, content: item.content, tags: item.tags }, item.cookie, opts);
        item.status = "published";
        item.result = results;
      } catch (e) {
        item.status = "failed";
        item.error = e.message;
        allOk = false;
      }
    }
    plan.status = "completed";
    plan.completedAt = new Date().toISOString();
    this._save();
    return { success: true, itemsTotal: plan.items.length, itemsOk: plan.items.filter(function(i) { return i.status === "published"; }).length };
  }
}

module.exports = { PublishingPlan };