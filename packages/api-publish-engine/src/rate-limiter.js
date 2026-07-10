class RateLimiter {
  constructor(opts) {
    opts = opts || {};
    this._windowMs = opts.windowMs || 60000;
    this._maxRequests = opts.maxRequests || 100;
    this._clients = {};
    var self = this;
    this._timer = setInterval(function() { self._cleanup(); }, Math.min(this._windowMs, 60000));
    // R28 修复：清理窗口定时器需 unref，不阻止进程退出
    if (this._timer && this._timer.unref) this._timer.unref();
  }

  check(ip) {
    ip = ip || "unknown";
    var now = Date.now();
    var client = this._clients[ip];
    if (!client) {
      client = { timestamps: [] };
      this._clients[ip] = client;
    }
    // Remove expired timestamps
    var cutoff = now - this._windowMs;
    client.timestamps = client.timestamps.filter(function(t) { return t > cutoff; });
    if (client.timestamps.length >= this._maxRequests) return false;
    client.timestamps.push(now);
    return true;
  }

  _cleanup() {
    var now = Date.now();
    var cutoff = now - this._windowMs * 2;
    for (var ip in this._clients) {
      var client = this._clients[ip];
      client.timestamps = client.timestamps.filter(function(t) { return t > cutoff; });
      if (client.timestamps.length === 0) delete this._clients[ip];
    }
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._clients = {};
  }
}

module.exports = { RateLimiter };