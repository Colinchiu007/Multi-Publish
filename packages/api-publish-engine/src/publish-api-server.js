const http = require("http");
const zlib = require("zlib");
const { getAdapter, supportsApi, publishViaApi, batchPublish } = require("./index");
const { ScheduledPublish } = require("./scheduled-publish");
const { WebhookManager } = require("./webhook-manager");
const { AuditLog } = require("./audit-log");
const { PublishingPlan } = require("./publish-plan");
const { RateLimiter } = require("./rate-limiter");
const { AccessLogger } = require("./access-log");
const { loadConfig } = require("./config-loader");

class PublishApiServer {
  constructor(opts) {
    this._opts = opts || {};
    this._server = null;
    this._apiKey = this._opts.apiKey || null;
    this._scheduler = null;
    this._webhookManager = new WebhookManager();
    this._auditLog = new AuditLog({ storageFile: this._opts.auditLogFile || null });
    this._planManager = new PublishingPlan({ dryRun: this._opts.dryRun, storageFile: this._opts.planFile || null });
    this._startedAt = null;
    this._rateLimiter = this._opts.maxRpm ? new RateLimiter({ maxRequests: this._opts.maxRpm, windowMs: 60000 }) : null;
    this._accessLogger = new AccessLogger({ enabled: this._opts.accessLog !== false });
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
        // Register process signal handlers for graceful shutdown
        self._processSignals = [];
        function onSig() { self.stop(); }
        self._processSignals.push(["SIGTERM", onSig]);
        self._processSignals.push(["SIGINT", onSig]);
        process.on("SIGTERM", onSig);
        process.on("SIGINT", onSig);
        resolve(self._server.address().port);
      });
    });
  }

  stop() {
    var self = this;
    return new Promise(function(resolve) {
      if (self._scheduler) self._scheduler.stop();
      if (self._rateLimiter) self._rateLimiter.stop();
      if (self._processSignals) {
        for (var i = 0; i < self._processSignals.length; i++) {
          process.removeListener(self._processSignals[i][0], self._processSignals[i][1]);
        }
        self._processSignals = null;
      }
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
    this._currentReq = req;
    var url = req.url || "/";
    var method = req.method || "GET";
    var _startTime = Date.now();
    var _self = this;
    var _origEnd = res.end;
    res.end = function() { res.end = _origEnd; res.end.apply(res, arguments); if (_self._accessLogger) _self._accessLogger.log(req, res, _startTime); };

    if (method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" });
      res.end();
      return;
    }

    // Rate limiting
    if (this._rateLimiter && !this._rateLimiter.check(req.socket.remoteAddress || req.headers["x-forwarded-for"] || "unknown")) {
      this._json(res, 429, { error: "Too Many Requests", message: "Rate limit exceeded. Try again later." });
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
            this._auditLog.log({ type: "publish", platform: platform, title: taskData.title, status: supported ? "success" : "failed", details: { dryRun: true } });
            this._json(res, 200, { success: supported, platform: platform, dryRun: true, error: supported ? undefined : "No API adapter for platform: " + platform });
          } else {
            var result = await publishViaApi(platform, taskData, cookie);
            this._auditLog.log({ type: "publish", platform: platform, title: taskData.title, status: "success", publishId: result.publishId });
            this._json(res, 200, { success: true, platform: platform, url: result.url, publishId: result.publishId });
          }
        } catch (e) {
          this._auditLog.log({ type: "publish", platform: platform, title: taskData.title, status: "failed", error: e.message });
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
        this._auditLog.log({ type: "batch", platform: platforms, title: taskData.title, status: results.every(function(r){return r.success}) ? "success" : "failed", details: results });
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

      // --- Audit Log ---
      if (method === "GET" && url === "/api/v1/logs") {
        this._json(res, 200, { logs: this._auditLog.list(), stats: this._auditLog.stats() });
        return;
      }
      if (method === "POST" && url === "/api/v1/logs/clear") {
        this._auditLog.clear();
        this._json(res, 200, { success: true });
        return;
      }

      // --- Publishing Plan ---
      if (url === "/api/v1/plan") {
        if (method === "POST") {
          var body = await this._parseBody(req);
          try {
            var plan = await this._planManager.create({ name: body.name, items: body.items });
            this._json(res, 200, { success: true, plan: plan });
          } catch (e) {
            this._json(res, 400, { success: false, error: e.message });
          }
          return;
        }
        if (method === "GET") {
          this._json(res, 200, { plans: this._planManager.list() });
          return;
        }
      }
      if (method === "POST" && url === "/api/v1/plan/execute") {
        var body = await this._parseBody(req);
        var result = await this._planManager.execute(body.id);
        var plan = this._planManager.get(body.id);
        if (plan) this._auditLog.log({ type: "plan", platform: plan.items.map(function(i){return i.platform}), title: plan.name, status: result.success ? "success" : "failed", details: result });
        this._json(res, 200, result);
        return;
      }
      if (method === "POST" && url === "/api/v1/plan/delete") {
        var body = await this._parseBody(req);
        var ok = this._planManager.delete(body.id);
        this._json(res, 200, { success: ok });
        return;
      }

      // --- Metrics ---
      if (method === "GET" && url === "/api/v1/metrics") {
        this._json(res, 200, {
          uptime: this._startedAt ? Date.now() - new Date(this._startedAt).getTime() : 0,
          startedAt: this._startedAt,
          platforms: Object.keys(require("./index").REGISTRY).length,
          audit: this._auditLog.stats(),
          scheduled: this._scheduler ? this._scheduler.list() : [],
          webhooks: this._webhookManager.list(),
          plans: this._planManager.list()
        });
        return;
      }

      // --- API Docs ---
      if (method === "GET" && url === "/api/v1/docs") {
        var html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PublishApiServer - API Documentation</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:900px;margin:0 auto;padding:20px;background:#f5f5f7;color:#1d1d1f}
h1{font-size:2em;margin-bottom:10px}
h2{font-size:1.3em;margin-top:30px}
p{color:#6e6e73}
.endpoint{background:#fff;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.method{display:inline-block;font-weight:600;padding:2px 8px;border-radius:4px;color:#fff;font-size:.8em;margin-right:8px}
.method-GET{background:#34c759}
.method-POST{background:#007aff}
.path{font-family:Menlo,monospace;font-size:1em}
.desc{color:#6e6e73;margin-top:6px;font-size:.9em}
</style></head><body>
<h1>PublishApiServer</h1>
<p>Multi-platform publish HTTP API. All POST endpoints accept JSON body. Auth via <code>Authorization: Bearer &lt;key&gt;</code> header.</p>
<h2>Endpoints</h2>`;
        var endpoints = [
          { m: "GET", p: "/api/v1/health", d: "Health check, no auth required" },
          { m: "GET", p: "/api/v1/platforms", d: "List all supported platforms" },
          { m: "POST", p: "/api/v1/publish", d: "Publish to one platform. Body: { platform, title, content, tags, cookie }" },
          { m: "POST", p: "/api/v1/batch-publish", d: "Batch publish to multiple platforms. Body: { platforms, title, content, tags, cookie }" },
          { m: "POST", p: "/api/v1/schedule", d: "Schedule a future publish. Body: { platforms, title, content, tags, cookie, scheduledAt }" },
          { m: "GET", p: "/api/v1/schedule", d: "List all scheduled tasks" },
          { m: "POST", p: "/api/v1/schedule/cancel", d: "Cancel a pending scheduled task. Body: { id }" },
          { m: "POST", p: "/api/v1/webhook", d: "Register a webhook URL. Body: { url, events }" },
          { m: "GET", p: "/api/v1/webhook", d: "List registered webhooks" },
          { m: "POST", p: "/api/v1/webhook/remove", d: "Remove a webhook. Body: { id }" },
          { m: "GET", p: "/api/v1/docs", d: "This page - API documentation" },
          { m: "GET", p: "/api/v1/openapi.json", d: "OpenAPI 3.0 specification (JSON)" }
        ];
        for (var i = 0; i < endpoints.length; i++) {
          var ep = endpoints[i];
          html += "<div class=\'endpoint\'><span class=\'method method-" + ep.m + "\'>" + ep.m + "</span><span class=\'path\'>" + ep.p + "</span><div class=\'desc\'>" + ep.d + "</div></div>";
        }
        html += "<p style=\'margin-top:30px;text-align:center;font-size:.8em;color:#999\'>PublishApiServer v1.0.0</p></body></html>";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      // --- OpenAPI ---
      if (method === "GET" && url === "/api/v1/openapi.json") {
        var spec = { openapi: "3.0.3", info: { title: "PublishApiServer", version: "1.0.0", description: "多平台一键发布 HTTP API" }, servers: [], paths: {} };
        var pathItems = {
          "/api/v1/health": { get: { summary: "健康检查", responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, version: { type: "string" } } } } } } } } },
          "/api/v1/platforms": { get: { summary: "平台列表", responses: { "200": { description: "平台列表" } } } },
          "/api/v1/publish": { post: { summary: "单平台发布", requestBody: { content: { "application/json": { schema: { type: "object", properties: { platform: { type: "string" }, title: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, cookie: { type: "string" } }, required: ["platform"] } } } }, responses: { "200": { description: "发布结果" } } } },
          "/api/v1/batch-publish": { post: { summary: "批量发布", requestBody: { content: { "application/json": { schema: { type: "object", properties: { platforms: { type: "array", items: { type: "string" } }, title: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, cookie: { type: "string" } }, required: ["platforms"] } } } }, responses: { "200": { description: "批量发布结果" } } } },
          "/api/v1/schedule": { post: { summary: "创建定时发布", requestBody: { content: { "application/json": { schema: { type: "object", properties: { platforms: { type: "array", items: { type: "string" } }, title: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, cookie: { type: "string" }, scheduledAt: { type: "string", format: "date-time" } }, required: ["platforms", "scheduledAt"] } } } }, responses: { "200": { description: "创建成功" } } }, get: { summary: "列出定时任务", responses: { "200": { description: "任务列表" } } } },
          "/api/v1/schedule/cancel": { post: { summary: "取消定时任务", requestBody: { content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } } }, responses: { "200": { description: "取消结果" } } } },
          "/api/v1/webhook": { post: { summary: "注册 webhook", requestBody: { content: { "application/json": { schema: { type: "object", properties: { url: { type: "string", format: "uri" }, events: { type: "array", items: { type: "string" } } }, required: ["url"] } } } }, responses: { "200": { description: "注册成功" } } }, get: { summary: "列出 webhook", responses: { "200": { description: "webhook 列表" } } } },
          "/api/v1/logs": { get: { summary: "获取发布日志" } },
          "/api/v1/logs/clear": { post: { summary: "清空发布日志" } },
          "/api/v1/plan": { post: { summary: "创建发布计划" }, get: { summary: "列出发布计划" } },
          "/api/v1/plan/execute": { post: { summary: "执行发布计划" } },
          "/api/v1/plan/delete": { post: { summary: "删除发布计划" } },
          "/api/v1/rate-limiter": { get: { summary: "获取当前限流状态" } },
          "/api/v1/access-log": { get: { summary: "Access 日志配置" } },
          "/api/v1/webhook/remove": { post: { summary: "删除 webhook", requestBody: { content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } } }, responses: { "200": { description: "删除结果" } } } }
        };
        spec.paths = pathItems;
        this._json(res, 200, spec);
        return;
      }

      this._json(res, 404, { error: "Not found", path: url });
    } catch (e) {
      this._json(res, 500, { error: e.message });
    }
  }
}

PublishApiServer.registerShutdownSignals = function(server) {
  var sig = function() { server.stop(); };
  process.on("SIGTERM", sig);
  process.on("SIGINT", sig);
  return function() {
    process.removeListener("SIGTERM", sig);
    process.removeListener("SIGINT", sig);
  };
};

module.exports = { PublishApiServer };