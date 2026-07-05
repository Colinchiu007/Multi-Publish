/**
 * ProgressThrottle — 发布进度节流
 * 从 rpa-view-manager.js 提取，纯逻辑可测试。
 */
class ProgressThrottle {
  constructor(minInterval, minPercentDelta) {
    this._lastTime = 0;
    this._lastPercent = 0;
    this._minInterval = minInterval || 5000;
    this._minPercentDelta = minPercentDelta || 10;
  }

  shouldReport(percent) {
    if (percent === 100) return true;
    if (percent - this._lastPercent < this._minPercentDelta &&
        Date.now() - this._lastTime < this._minInterval) return false;
    this._lastTime = Date.now();
    this._lastPercent = percent;
    return true;
  }

  reset() { this._lastTime = 0; this._lastPercent = 0; }
}

module.exports = { ProgressThrottle };
