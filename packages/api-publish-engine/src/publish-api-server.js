const http = require("http");
const { getAdapter, supportsApi, publishViaApi, batchPublish } = require("./index");

class PublishApiServer {
  constructor(opts) {
    this._opts = opts || {};
    this._server = null;
  }

  start(port) {
    var self = this;
    return new Promise(function(resolve, reject) {
      self._server = http.createServer(function(req, res) {
        self._handle(req, res);
      });
      self._server.on("error", reject);
      self._server.listen(port, function() {
        resolve(self._server.address().port);
      });
    });
  }

  stop() {
    var self = this;
    return new Promise(function(resolve) {
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

  async _handle(req, res) {
    var url = req.url || "/";
    var method = req.method || "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" });
      res.end();
      return;
    }

    try {
      if (method === "GET" && url === "/api/v1/platforms") {
        var platforms = Object.keys(require("./index").REGISTRY);
        this._json(res, 200, { platforms: platforms, count: platforms.length });
        return;
      }

      if (method === "GET" && url === "/api/v1/health") {
        this._json(res, 200, { status: "ok", version: "1.0.0" });
        return;
      }

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

      this._json(res, 404, { error: "Not found", path: url });
    } catch (e) {
      this._json(res, 500, { error: e.message });
    }
  }
}

module.exports = { PublishApiServer };