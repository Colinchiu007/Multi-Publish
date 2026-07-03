/**
 * publish-api-client.js — PublishApiServer Node.js 客户端
 * 零依赖，纯 Node.js http/https 模块
 */
const http = require("http");
const https = require("https");

class PublishApiClient {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl - 服务器地址，如 http://localhost:3000
   * @param {string} [opts.apiKey] - API key 认证
   * @param {number} [opts.timeout=30000] - 超时时间（毫秒）
   */
  constructor(opts) {
    if (!opts || !opts.baseUrl) throw new Error("baseUrl is required");
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey || null;
    this.timeout = opts.timeout || 30000;
  }

  /** 构建请求头 */
  _headers() {
    var h = { "Content-Type": "application/json" };
    if (this.apiKey) h["Authorization"] = "Bearer " + this.apiKey;
    return h;
  }

  /** 解析 baseUrl 获取协议/主机/端口 */
  _parseUrl() {
    var u = new URL(this.baseUrl);
    return { protocol: u.protocol, hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80) };
  }

  /** 发送 HTTP 请求 */
  _request(method, path, body) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var urlInfo = self._parseUrl();
      var mod = urlInfo.protocol === "https:" ? https : http;
      var bodyStr = body ? JSON.stringify(body) : null;

      var opts = {
        hostname: urlInfo.hostname,
        port: urlInfo.port,
        path: path,
        method: method,
        headers: self._headers(),
        timeout: self.timeout
      };

      if (bodyStr) opts.headers["Content-Length"] = Buffer.byteLength(bodyStr);

      var req = mod.request(opts, function(res) {
        var data = "";
        res.on("data", function(chunk) { data += chunk; });
        res.on("end", function() {
          try {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data));
            } else {
              var errMsg = "HTTP " + res.statusCode;
              try { var parsed = JSON.parse(data); errMsg = parsed.error || parsed.message || errMsg; } catch(e) {}
              var err = new Error(errMsg);
              err.status = res.statusCode;
              reject(err);
            }
          } catch(e) {
            reject(new Error("Invalid JSON response: " + e.message));
          }
        });
      });

      req.on("error", reject);
      req.on("timeout", function() { req.destroy(); reject(new Error("Request timeout")); });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  // === 健康检查 ===
  health() { return this._request("GET", "/api/v1/health"); }

  // === 平台列表 ===
  platforms() { return this._request("GET", "/api/v1/platforms"); }

  // === 单平台发布 ===
  publish(body) { return this._request("POST", "/api/v1/publish", body); }

  // === 批量发布 ===
  batchPublish(body) { return this._request("POST", "/api/v1/batch-publish", body); }

  // === 定时发布 ===
  schedule(body) { return this._request("POST", "/api/v1/schedule", body); }
  listSchedules() { return this._request("GET", "/api/v1/schedule"); }
  cancelSchedule(body) { return this._request("POST", "/api/v1/schedule/cancel", body); }

  // === Webhook ===
  registerWebhook(body) { return this._request("POST", "/api/v1/webhook", body); }
  listWebhooks() { return this._request("GET", "/api/v1/webhook"); }
  removeWebhook(body) { return this._request("POST", "/api/v1/webhook/remove", body); }

  // === 发布日志 ===
  getLogs() { return this._request("GET", "/api/v1/logs"); }
  clearLogs() { return this._request("POST", "/api/v1/logs/clear"); }

  // === 发布计划 ===
  createPlan(body) { return this._request("POST", "/api/v1/plan", body); }
  listPlans() { return this._request("GET", "/api/v1/plan"); }
  executePlan(body) { return this._request("POST", "/api/v1/plan/execute", body); }
  deletePlan(body) { return this._request("POST", "/api/v1/plan/delete", body); }

  // === 指标 ===
  metrics() { return this._request("GET", "/api/v1/metrics"); }
}

module.exports = { PublishApiClient };