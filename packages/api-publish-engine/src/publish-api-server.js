const http = require("http");
const { getAdapter, supportsApi, publishViaApi, batchPublish } = require("./index");
const { ScheduledPublish } = require("./scheduled-publish");
const { WebhookManager } = require("./webhook-manager");

class PublishApiServer {
  constructor(opts) {
    this._opts = opts || {};
    this._server = null;
    this._apiKey = this._opts.apiKey || null;
    this._scheduler = null;
    this._webhookManager = new WebhookManager();
    if (this._opts.enableSchedule) {
      this._scheduler = new ScheduledPublish({
        dryRun: this._opts.dryRun,
        storageFile: this._opts.scheduleFile || null,
        checkInterval: this._opts.scheduleCheckInterval || 10000,
        webhookManager: this._webhookManager
      });
    }
  }

  start(port) {
    var self = this;
    return new Promise(function(resolve, reject) {
      self._server = http.createServer(function(req, res) {
        self._handle(req, res);
      });
      self._server.on("error", reject);
      self._server.listen(port, function() {
        if (self._scheduler) self._scheduler.start();
        resolve(self._server.address().port);
      });
    });
  }

  stop() {
    var self = this;
    return new Promise(function(resolve) {
      if (self._scheduler) self._scheduler.stop();
      if (self._server) {
        self._server.close(function() { resolve(); });
        self._server = null;
      } else {
        resolve();
      }
    });
  }

  _parseBody(req) {
    return new Promise(function(resolve) {
      var chunks = [];
      req.on("data", function(c) { chunks.push(c); });
      req.on("end", function() {
        var raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); }
        catch(e) { resolve({}); }
      });
    });
  }

  _json(res, status, data) {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(data));
  }

  _checkAuth(req) {
    if (!this._apiKey) return true;
    if (req.url === "/api/v1/health") return true;
    var auth = req.headers["authorization"] || "";
    return auth === "Bearer " + this._apiKey;
  }

  async _handle(req, res) {
    var url = req.url || "/";
    var method = req.method || "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" });
      res.end();
      return;
    }

    if (!this._checkAuth(req)) {
      this._json(res, 401, { error: "Unauthorized", message: "Valid API key required via Authorization: Bearer <key>" });
      return;
    }

    try {
      // --- Platforms ---
      if (method === "GET" && url === "/api/v1/platforms") {
        var platforms = Object.keys(require("./index").REGISTRY);
        this._json(res, 200, { platforms: platforms, count: platforms.length });
        return;
      }

      // --- Health ---
      if (method === "GET" && url === "/api/v1/health") {
        this._json(res, 200, { status: "ok", version: "1.0.0" });
        return;
      }

      // --- Publish ---
      if (method === "POST" && url === "/api/v1/publish") {
        var body = await this._parseBody(req);
        var platform = body.platform;
        var taskData = { title: body.title || "", content: body.content || "", tags: body.tags || [] };
        var cookie = body.cookie || "";

        if (!platform) {
          this._json(res, 400, { success: false, error: "platform is required" });
          return;
        }

        try {
          if (this._opts.dryRun) {
            var supported = supportsApi(platform);
            this._json(res, 200, { success: supported, platform: platform, dryRun: true, error: supported ? undefined : "No API adapter for platform: " + platform });
          } else {
            var result = await publishViaApi(platform, taskData, cookie);
            this._json(res, 200, { success: true, platform: platform, url: result.url, publishId: result.publishId });
          }
        } catch (e) {
          this._json(res, 200, { success: false, platform: platform, error: e.message });
        }
        return;
      }

      // --- Batch Publish ---
      if (method === "POST" && url === "/api/v1/batch-publish") {
        var body = await this._parseBody(req);
        var platforms = body.platforms || [];
        var taskData = { title: body.title || "", content: body.content || "", tags: body.tags || [] };
        var cookie = body.cookie || "";
        var opts = {};
        if (this._opts.dryRun) opts.dryRun = true;
        var results = await batchPublish(platforms, taskData, cookie, opts);
        this._json(res, 200, results);
        return;
      }

      // --- Schedule ---
      if (url === "/api/v1/schedule") {
        if (!this._scheduler) {
          this._json(res, 400, { error: "Scheduler not enabled. Set enableSchedule: true in constructor." });
          return;
        }
        if (method === "POST" && url === "/api/v1/schedule") {
          var body = await this._parseBody(req);
          try {
            var entry = await this._scheduler.schedule({
              platforms: body.platforms,
              title: body.title,
              content: body.content,
              tags: body.tags,
              cookie: body.cookie,
              scheduledAt: body.scheduledAt
            });
            this._json(res, 200, { success: true, entry: entry });
          } catch (e) {
            this._json(res, 400, { success: false, error: e.message });
          }
          return;
        }
        if (method === "GET" && url === "/api/v1/schedule") {
          this._json(res, 200, { entries: this._scheduler.list() });
          return;
        }
      }

      // --- Schedule Cancel ---
      if (method === "POST" && url === "/api/v1/schedule/cancel") {
        if (!this._scheduler) {
          this._json(res, 400, { error: "Scheduler not enabled" });
          return;
        }
        var body = await this._parseBody(req);
        var ok = this._scheduler.cancel(body.id);
        this._json(res, 200, { success: ok });
        return;
      }

            // --- Webhook ---
      if (url === "/api/v1/webhook") {
        if (method === "POST") {
          var body = await this._parseBody(req);
          try {
            var wh = await this._webhookManager.register({ url: body.url, events: body.events });
            this._json(res, 200, { success: true, webhook: wh });
          } catch (e) {
            this._json(res, 400, { success: false, error: e.message });
          }
          return;
        }
        if (method === "GET") {
          this._json(res, 200, { webhooks: this._webhookManager.list() });
          return;
        }
      }

      // --- Webhook Remove ---
      if (method === "POST" && url === "/api/v1/webhook/remove") {
        var body = await this._parseBody(req);
        var ok = this._webhookManager.remove(body.id);
        this._json(res, 200, { success: ok });
        return;
      }

      this._json(res, 404, { error: "Not found", path: url });
    } catch (e) {
      this._json(res, 500, { error: e.message });
    }
  }
}

module.exports = { PublishApiServer };