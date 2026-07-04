/**
 * UsageTracker — API Key 用量追踪
 * 记录每个 key 的请求次数/来源 IP/最后访问时间
 * 存储: JSON 文件 (config/api-usage.json)
 */
const fs = require("fs");
const path = require("path");

class UsageTracker {
  /**
   * @param {string} [usagePath] — JSON 文件路径
   */
  constructor(usagePath) {
    this._usagePath = usagePath || path.join(__dirname, "..", "config", "api-usage.json");
    this._data = { keys: {}, totalRequests: 0, since: null };
    this._loaded = false;
  }

  load() {
    try {
      if (fs.existsSync(this._usagePath)) {
        this._data = JSON.parse(fs.readFileSync(this._usagePath, "utf-8"));
      }
    } catch (e) {
      this._data = { keys: {}, totalRequests: 0, since: new Date().toISOString() };
    }
    if (!this._data.since) this._data.since = new Date().toISOString();
    this._loaded = true;
  }

  _save() {
    const dir = path.dirname(this._usagePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this._usagePath, JSON.stringify(this._data, null, 2), "utf-8");
  }

  /** 记录一次请求 */
  record(keyName, ip) {
    if (!this._loaded) this.load();
    this._data.totalRequests++;
    if (!this._data.keys[keyName]) {
      this._data.keys[keyName] = { count: 0, firstSeen: new Date().toISOString(), ips: [] };
    }
    const entry = this._data.keys[keyName];
    entry.count++;
    entry.lastSeen = new Date().toISOString();
    if (ip && !entry.ips.includes(ip)) {
      entry.ips.push(ip);
      if (entry.ips.length > 100) entry.ips.shift(); // limit
    }
    this._save();
  }

  /** 获取用量统计 */
  getStats() {
    if (!this._loaded) this.load();
    const sorted = Object.entries(this._data.keys)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
    return {
      since: this._data.since,
      totalRequests: this._data.totalRequests,
      activeKeys: Object.keys(this._data.keys).length,
      topKeys: sorted.slice(0, 20),
    };
  }

  /** 重置统计 */
  reset() {
    this._data = { keys: {}, totalRequests: 0, since: new Date().toISOString() };
    this._save();
  }
}

module.exports = UsageTracker;
