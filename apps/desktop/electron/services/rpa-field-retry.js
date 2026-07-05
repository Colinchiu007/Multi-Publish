/**
 * FieldRetryState — 字段重试状态追踪
 * 从 rpa-view-manager.js 提取，纯逻辑可测试。
 */
class FieldRetryState {
  constructor(retryCount) {
    this._retryCount = retryCount || 3;
    this._map = {};
  }

  addField(name) { if (!(name in this._map)) this._map[name] = 0; }
  markDone(name) { this._map[name] = this._retryCount; }

  retry(name) {
    if (!(name in this._map)) return false;
    this._map[name]++;
    return this._map[name] < this._retryCount;
  }

  isDone(name) { return (this._map[name] || this._retryCount) >= this._retryCount; }

  get unfinishedFields() {
    const t = this;
    return Object.keys(this._map).filter(function(n) { return t._map[n] < t._retryCount; });
  }

  get hasUnfinished() { return this.unfinishedFields.length > 0; }

  get allDone() { return !this.hasUnfinished; }

  get exhaustedFields() {
    const t = this;
    return Object.keys(this._map).filter(function(n) { return t._map[n] === t._retryCount - 1; });
  }
}

module.exports = { FieldRetryState };
