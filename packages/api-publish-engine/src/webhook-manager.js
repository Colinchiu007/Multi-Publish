const http = require("http");
const https = require("https");
const dns = require("dns");
const net = require("net");
// SSRF 屏蔽清单与出网 URL 校验已抽到 ssrf-guard.js，与媒体拉取共用单一真源。
const ssrf = require("./ssrf-guard");

var ID_SEQ = 0;
function genId() { return "wh-" + (++ID_SEQ) + "-" + Date.now().toString(36); }

var BLOCKED_IPV4 = ssrf.BLOCKED_IPV4;
var BLOCKED_IPV6 = ssrf.BLOCKED_IPV6;
var normalizeHostname = ssrf.normalizeHostname;
var isBlockedAddress = ssrf.isBlockedAddress;

// 委托共用实现。label 传小写 "webhook URL"：共用实现的文案模板是
// `label + " must be ..."`，历史上线文案正是 "Invalid webhook URL"/
// "Webhook URL must be ..."——大写会与之逐字不符。
function parseWebhookUrl(value) {
  // 文案逐条对齐抽取前（c762ed81）的原文，不做任何「统一化」——
  // 抽取共用逻辑顺带改文案 = 悄悄改了对外行为，下游正则会静默失配。
  return ssrf.parseOutboundUrl(value, {
    label: "Webhook URL",
    messages: {
      invalidUrl: "Invalid webhook URL",
      invalidShape: "Valid webhook URL is required (http:// or https://)",
      badProtocol: "Valid webhook URL is required (http:// or https://)",
    },
  });
}


class WebhookManager {
  constructor(opts) {
    opts = opts || {};
    this._webhooks = [];
    this._lookup = typeof opts.lookup === "function" ? opts.lookup : dns.promises.lookup.bind(dns.promises);
    this._httpRequest = typeof opts.httpRequest === "function" ? opts.httpRequest : http.request;
    this._httpsRequest = typeof opts.httpsRequest === "function" ? opts.httpsRequest : https.request;
    this._requestTimeoutMs = Number.isFinite(opts.requestTimeoutMs) ? Math.max(100, opts.requestTimeoutMs) : 5000;
    this._log = opts.logger && typeof opts.logger.warn === "function" ? opts.logger : null;
  }

  _logWarn(code, url, error) {
    if (!this._log) return;
    var detail = error && error.message ? error.message : String(error);
    this._log.warn("WebhookManager", code + " url=" + url + " error=" + detail);
  }

  async register(data) {
    if (!data || !data.url) throw new Error("Valid webhook URL is required (http:// or https://)");
    var parsed = parseWebhookUrl(data.url);
    var wh = {
      id: genId(),
      url: parsed.href,
      events: data.events || [],
      ownerSubject: typeof data.ownerSubject === "string" && data.ownerSubject ? data.ownerSubject : null,
      createdAt: new Date().toISOString()
    };
    this._webhooks.push(wh);
    return wh;
  }

  list(ownerSubject) {
    if (arguments.length === 0) return this._webhooks.slice();
    var expectedOwner = typeof ownerSubject === "string" && ownerSubject ? ownerSubject : null;
    return this._webhooks.filter(function(wh) { return wh.ownerSubject === expectedOwner; });
  }

  remove(id, ownerSubject) {
    var idx = -1;
    var filterByOwner = arguments.length >= 2;
    var expectedOwner = typeof ownerSubject === "string" && ownerSubject ? ownerSubject : null;
    for (var i = 0; i < this._webhooks.length; i++) {
      if (this._webhooks[i].id === id &&
          (!filterByOwner || this._webhooks[i].ownerSubject === expectedOwner)) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return false;
    this._webhooks.splice(idx, 1);
    return true;
  }

  async fire(event, data, ownerSubject) {
    if (!event) return;
    var payload = JSON.stringify({ event: event, timestamp: new Date().toISOString(), data: data || {} });
    var filterByOwner = arguments.length >= 3;
    var expectedOwner = typeof ownerSubject === "string" && ownerSubject ? ownerSubject : null;
    var pending = [];
    var pendingHooks = [];
    for (var i = 0; i < this._webhooks.length; i++) {
      var wh = this._webhooks[i];
      if (filterByOwner && wh.ownerSubject !== expectedOwner) continue;
      // events empty means match all
      if (wh.events.length > 0 && wh.events.indexOf(event) === -1) continue;
      pending.push(this._send(wh.url, payload));
      pendingHooks.push(wh);
    }
    var settled = await Promise.allSettled(pending);
    for (var i = 0; i < settled.length; i++) {
      var settledEntry = settled[i];
      var target = pendingHooks[i];
      if (settledEntry.status === "rejected") {
        this._logWarn("webhook-fire-rejected", target ? target.url : "", settledEntry.reason);
      } else if (settledEntry.value === false) {
        this._logWarn("webhook-delivery-failed", target ? target.url : "", new Error("send failed"));
      }
    }
  }

  async _resolvePublicAddress(hostname) {
    var host = normalizeHostname(hostname);
    var family = net.isIP(host);
    var addresses = family
      ? [{ address: host, family: family }]
      : await this._lookup(host, { all: true, verbatim: true });
    if (!Array.isArray(addresses)) addresses = addresses ? [addresses] : [];
    if (addresses.length === 0) throw new Error("Webhook hostname could not be resolved");
    var normalized = addresses.map(function(entry) {
      var address = entry && typeof entry.address === "string" ? entry.address : "";
      return { address: address, family: net.isIP(address) };
    });
    if (normalized.some(function(entry) { return !entry.family || isBlockedAddress(entry.address); })) {
      throw new Error("Webhook URL cannot point to internal/private network");
    }
    return normalized[0];
  }

  async _send(url, payload) {
    var self = this;
    try {
      var parsed = parseWebhookUrl(url);
      var isHttps = parsed.protocol === "https:";
      var target = await this._resolvePublicAddress(parsed.hostname);
      var request = isHttps ? this._httpsRequest : this._httpRequest;
      var opts = {
        hostname: normalizeHostname(parsed.hostname),
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        family: target.family,
        lookup: function(_hostname, lookupOptions, callback) {
          if (lookupOptions && lookupOptions.all) {
            callback(null, [{ address: target.address, family: target.family }]);
          } else {
            callback(null, target.address, target.family);
          }
        },
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      };
      var req = request(opts);
      req.on('error', function(err) { self._logWarn('webhook-request-error', url, err); });
      if (typeof req.setTimeout === "function") {
        req.setTimeout(this._requestTimeoutMs, function() {
          if (typeof req.destroy === "function") req.destroy();
        });
      }
      req.write(payload);
      req.end();
      return true;
    } catch(e) {
      this._logWarn('webhook-send-error', url, e);
      return false;
    }
  }
}

module.exports = { WebhookManager };
