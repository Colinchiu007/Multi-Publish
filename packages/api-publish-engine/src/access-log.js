/**
 * access-log — 结构化访问日志（http-request-tracing）
 *
 * 输出单行 JSON：ts/method/path/status/durationMs/requestId/ip/userAgent/errorCode。
 * enabled=false 时跳过；writeFn 可注入（默认 console.log）；写失败静默保持现状。
 */
"use strict";

function pathOnly(value) {
  var str = String(value || "");
  var q = str.indexOf("?");
  return (q === -1 ? str : str.slice(0, q)).slice(0, 512);
}

class AccessLogger {
  constructor(opts) {
    opts = opts || {};
    this._enabled = opts.enabled !== false;
    this._writeFn = opts.writeFn || function(line) { console.log(line); };
  }

  log(req, res, startTime, info) {
    if (!this._enabled) return;
    info = info || {};
    var entry = {
      ts: new Date().toISOString(),
      method: req.method || "",
      path: (info.path || pathOnly(req.url)),
      status: res.statusCode,
      durationMs: Date.now() - startTime,
      requestId: info.requestId || null,
      ip: (req.socket && req.socket.remoteAddress) || null,
      userAgent: req.headers && req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 256) : null,
      errorCode: info.errorCode || null,
    };
    try {
      this._writeFn(JSON.stringify(entry));
    } catch (e) { /* 写失败静默，保持现状 */ }
  }
}

module.exports = { AccessLogger };
