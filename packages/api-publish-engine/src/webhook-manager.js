const http = require("http");
const https = require("https");

var ID_SEQ = 0;
function genId() { return "wh-" + (++ID_SEQ) + "-" + Date.now().toString(36); }

var URL_RE = /^https?:\/\/.+/;

class WebhookManager {
  constructor(opts) {
    opts = opts || {};
    this._webhooks = [];
  }

  async register(data) {
    if (!data || !data.url || !URL_RE.test(data.url)) {
      throw new Error("Valid webhook URL is required (http:// or https://)");
    }
    // 安全：拒绝内网地址（防止 SSRF 攻击内部服务）
    var parsed;
    try { parsed = new URL(data.url); } catch (e) {
      throw new Error("Invalid webhook URL");
    }
    var host = parsed.hostname.toLowerCase();
    var isInternal = host === "localhost" || host === "::1" ||
      host.startsWith("127.") || host.startsWith("10.") ||
      host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.startsWith("169.254.");
    if (isInternal) {
      throw new Error("Webhook URL cannot point to internal/private network");
    }
    var wh = {
      id: genId(),
      url: data.url,
      events: data.events || [],
      createdAt: new Date().toISOString()
    };
    this._webhooks.push(wh);
    return wh;
  }

  list() {
    return this._webhooks;
  }

  remove(id) {
    var idx = -1;
    for (var i = 0; i < this._webhooks.length; i++) {
      if (this._webhooks[i].id === id) { idx = i; break; }
    }
    if (idx === -1) return false;
    this._webhooks.splice(idx, 1);
    return true;
  }

  async fire(event, data) {
    if (!event) return;
    var payload = JSON.stringify({ event: event, timestamp: new Date().toISOString(), data: data || {} });
    for (var i = 0; i < this._webhooks.length; i++) {
      var wh = this._webhooks[i];
      // events empty means match all
      if (wh.events.length > 0 && wh.events.indexOf(event) === -1) continue;
      this._send(wh.url, payload);
    }
  }

  _send(url, payload) {
    try {
      var isHttps = url.indexOf("https://") === 0;
      var mod = isHttps ? https : http;
      var parsed = new URL(url);
      var opts = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      };
      var req = mod.request(opts);
      req.on('error', function() {});
      req.write(payload);
      req.end();
      // Fire-and-forget: errors are silently ignored
    } catch(e) {
      // Silently ignore send errors
    }
  }
}

module.exports = { WebhookManager };