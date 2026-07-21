const http = require("http");
const https = require("https");
const dns = require("dns");
const net = require("net");

var ID_SEQ = 0;
function genId() { return "wh-" + (++ID_SEQ) + "-" + Date.now().toString(36); }

var BLOCKED_IPV4 = new net.BlockList();
var BLOCKED_IPV6 = new net.BlockList();
[
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
].forEach(function(entry) { BLOCKED_IPV4.addSubnet(entry[0], entry[1], "ipv4"); });
[
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96],
  ["64:ff9b:1::", 48], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7],
  ["fe80::", 10], ["ff00::", 8],
].forEach(function(entry) { BLOCKED_IPV6.addSubnet(entry[0], entry[1], "ipv6"); });

function normalizeHostname(hostname) {
  var value = String(hostname || "").toLowerCase();
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function isBlockedAddress(address) {
  var family = net.isIP(address);
  if (!family) return true;
  return family === 4
    ? BLOCKED_IPV4.check(address, "ipv4")
    : BLOCKED_IPV6.check(address, "ipv6");
}

function parseWebhookUrl(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new Error("Valid webhook URL is required (http:// or https://)");
  }
  var parsed;
  try { parsed = new URL(value); } catch (e) {
    throw new Error("Invalid webhook URL");
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error("Valid webhook URL is required (http:// or https://)");
  }
  var host = normalizeHostname(parsed.hostname);
  var literalFamily = net.isIP(host);
  if (host === "localhost" || host.endsWith(".localhost") || (literalFamily && isBlockedAddress(host))) {
    throw new Error("Webhook URL cannot point to internal/private network");
  }
  return parsed;
}

class WebhookManager {
  constructor(opts) {
    opts = opts || {};
    this._webhooks = [];
    this._lookup = typeof opts.lookup === "function" ? opts.lookup : dns.promises.lookup.bind(dns.promises);
    this._httpRequest = typeof opts.httpRequest === "function" ? opts.httpRequest : http.request;
    this._httpsRequest = typeof opts.httpsRequest === "function" ? opts.httpsRequest : https.request;
    this._requestTimeoutMs = Number.isFinite(opts.requestTimeoutMs) ? Math.max(100, opts.requestTimeoutMs) : 5000;
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
    for (var i = 0; i < this._webhooks.length; i++) {
      var wh = this._webhooks[i];
      if (filterByOwner && wh.ownerSubject !== expectedOwner) continue;
      // events empty means match all
      if (wh.events.length > 0 && wh.events.indexOf(event) === -1) continue;
      pending.push(this._send(wh.url, payload));
    }
    await Promise.allSettled(pending);
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
      req.on('error', function() {});
      if (typeof req.setTimeout === "function") {
        req.setTimeout(this._requestTimeoutMs, function() {
          if (typeof req.destroy === "function") req.destroy();
        });
      }
      req.write(payload);
      req.end();
      return true;
    } catch(e) {
      return false;
    }
  }
}

module.exports = { WebhookManager };
