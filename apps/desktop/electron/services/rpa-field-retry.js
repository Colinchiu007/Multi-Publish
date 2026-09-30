// @ts-check
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

  isDone(name) { return !(name in this._map) || this._map[name] >= this._retryCount; }

  /**
   * 指数退避延迟（2026-09-30，风控加固）。
   *
   * 背景：此前所有字段的重试间隔都是调用方写死的 `_sleep(1000~2000)`，
   * 对平台而言过于密集——尤其 **publish** 字段：它的每次重试都是一次**真实的提交尝试**，
   * 密集重试极易触发风控（用户明确提出该风险；实测头条曾连续失败 12 轮）。
   *
   * 口径：
   * - 普通字段（title/content/image_upload 等，仅本地 DOM 操作）：base 1.2s，cap 8s；
   * - **副作用字段**（publish，会对平台产生提交）：base 5s，cap 45s，
   *   并建议调用方在"错误已表明提交可能成功"时**根本不重试**（见调用点注释）。
   *
   * @param {string} name 字段名
   * @param {{sideEffect?: boolean}} [opts]
   * @returns {number} 毫秒
   */
  backoffMs(name, opts) {
    const attempt = Math.max(1, Number(this._map[name] || 0));
    const sideEffect = !!(opts && opts.sideEffect);
    const base = sideEffect ? 5000 : 1200;
    const cap = sideEffect ? 45000 : 8000;
    return Math.min(cap, base * Math.pow(2, attempt - 1));
  }

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
