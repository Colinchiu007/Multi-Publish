const http = require("http");
const crypto = require("crypto");
const zlib = require("zlib");
const { getAdapter, supportsApi, publishViaApi, batchPublish, reloadPlugins, pluginLoader } = require("./index");
const { ScheduledPublish } = require("./scheduled-publish");
const { WebhookManager } = require("./webhook-manager");
const { AuditLog } = require("./audit-log");
const { PublishingPlan } = require("./publish-plan");
const { RateLimiter } = require("./rate-limiter");
const { AccessLogger } = require("./access-log");
const { loadConfig } = require("./config-loader");
const ApiKeyManager = require("./api-key-manager");
const { requireScopes } = require("./auth/logto-auth");
const { BusinessIdentityError, assertBusinessUserActive, ensureBusinessUser } = require("./auth/business-identity");
const { LOGTO_WEBHOOK_SIGNATURE_HEADER, LogtoWebhookError } = require("./auth/logto-webhook");

const GZIP_MIN_BYTES = 256;

function acceptsGzip(header) {
  if (typeof header !== "string") return false;
  var exactQuality = null;
  var wildcardQuality = null;
  header.split(",").forEach(function(entry) {
    var parts = entry.trim().split(";");
    var encoding = String(parts.shift() || "").trim().toLowerCase();
    var quality = 1;
    parts.forEach(function(parameter) {
      var match = /^q\s*=\s*([0-9.]+)$/i.exec(parameter.trim());
      if (!match) return;
      var parsed = Number(match[1]);
      quality = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
    });
    if (encoding === "gzip") exactQuality = quality;
    else if (encoding === "*") wildcardQuality = quality;
  });
  return (exactQuality === null ? wildcardQuality : exactQuality) > 0;
}

function safeErrorCode(error, fallback) {
  const code = error && typeof error.code === "string" ? error.code : "";
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(code) ? code : fallback;
}

function apiKeyOwnerSubject(key) {
  return `api-key:${crypto.createHash("sha256").update(String(key)).digest("hex")}`;
}

class PublishApiServer {
  constructor(opts) {
    this._opts = opts || {};
    this._server = null;
    this._apiKey = this._opts.apiKey || null
    this._logtoVerifier = this._opts.logtoVerifier || null
    this._identityAuthRequired = this._logtoVerifier ? this._opts.identityAuthRequired !== false : false
    this._logtoWebhookConsumer = this._opts.logtoWebhookConsumer || null
    this._businessIdentityRepository = this._opts.businessIdentityRepository || null
    this._entitlementProvider = this._opts.entitlementProvider || null
    this._entitlementSigner = this._opts.entitlementSigner || null
    this._publishViaApi = typeof this._opts.publishViaApi === "function" ? this._opts.publishViaApi : publishViaApi
    this._keyManager = new ApiKeyManager(this._opts.keysPath)
    // 将配置型 Key 以原值纳入统一管理，磁盘上只保存哈希。
    if (this._apiKey && this._opts.autoMigrate !== false) {
      this._keyManager.load()
      this._keyManager.ensureKey(this._apiKey, "migrated-from-config", ["*"])
    };
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
        webhookManager: this._webhookManager,
        authorizeEntry: (entry) => this._authorizeScheduledEntry(entry)
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
      // 安全：绑定 127.0.0.1（原默认绑定 0.0.0.0 暴露到整个网络）
      self._server.listen(port, "127.0.0.1", function() {
        self._startedAt = new Date().toISOString();
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
    var body = Buffer.from(JSON.stringify(data));
    var headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "http://localhost:5174",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-ID",
      "Vary": "Accept-Encoding",
    };
    var request = res.req;
    var acceptEncoding = request && request.headers ? request.headers["accept-encoding"] : null;
    if (body.length > GZIP_MIN_BYTES && acceptsGzip(acceptEncoding)) {
      var compressed = zlib.gzipSync(body);
      headers["Content-Encoding"] = "gzip";
      headers["Content-Length"] = compressed.length;
      res.writeHead(status, headers);
      res.end(compressed);
      return;
    }
    headers["Content-Length"] = body.length;
    res.writeHead(status, headers);
    res.end(body);
  }

  _checkApiKeyAuth(req, requiredScope, allowAnonymous) {
    if (req.url === "/api/v1/health") return { authorized: true }
    this._keyManager.load()
    if (this._keyManager.loadError) {
      return { authorized: false, status: 503, error: "API_KEY_STORE_UNAVAILABLE" }
    }
    const auth = (req.headers["authorization"] || "").trim()
    const key = auth.startsWith("Bearer ") ? auth.slice(7) : ""

    if (!key) {
      if (allowAnonymous && !this._apiKey) return { authorized: true }
      return { authorized: false, error: "Valid API key required via Authorization: Bearer <key>" }
    }

    const result = this._keyManager.validateKey(key, requiredScope)
    if (result.valid) {
      return {
        authorized: true,
        name: result.name,
        scopes: result.scopes,
        ownerSubject: apiKeyOwnerSubject(key),
        authType: "api_key",
      }
    }

    if (this._apiKey && key === this._apiKey && result.error === "API key not found") {
      return { authorized: true, ownerSubject: apiKeyOwnerSubject(key), authType: "api_key" }
    }

    return { authorized: false, error: result.error || "Invalid API key" }
  }

  _checkAuth(req, requiredScope) {
    if (!this._logtoVerifier) return this._checkApiKeyAuth(req, requiredScope, true)
    if (req.url === "/api/v1/health") return { authorized: true }
    const auth = (req.headers["authorization"] || "").trim()
    const key = auth.startsWith("Bearer ") ? auth.slice(7) : ""
    if (!key) {
      return this._identityAuthRequired
        ? Promise.resolve({ authorized: false, status: 401, error: "AUTH_TOKEN_MISSING" })
        : Promise.resolve(this._checkApiKeyAuth(req, requiredScope, false))
    }
    return Promise.resolve()
      .then(() => this._logtoVerifier.verify(key))
      .then((claims) => {
        requireScopes(claims, requiredScope ? [requiredScope] : [])
        return {
          authorized: true,
          name: claims.subject,
          scopes: claims.scopes,
          subject: claims.subject,
          ownerSubject: claims.subject,
          authType: "logto",
          profile: claims.profile || null,
        }
      })
      .catch((error) => {
        if (!this._identityAuthRequired) {
          const legacyResult = this._checkApiKeyAuth(req, requiredScope, false)
          if (legacyResult.authorized) return legacyResult
          if (legacyResult.status && legacyResult.status >= 500) return legacyResult
        }
        return {
          authorized: false,
          status: error && error.status === 403 ? 403 : 401,
          error: error && error.code ? error.code : "AUTH_TOKEN_INVALID",
        }
      })
  }

  _readRawBody(req, maxBytes) {
    return new Promise(function(resolve, reject) {
      var chunks = [];
      var total = 0;
      var tooLarge = false;
      req.on("data", function(chunk) {
        total += chunk.length;
        if (total <= maxBytes) chunks.push(chunk);
        else tooLarge = true;
      });
      req.on("error", reject);
      req.on("end", function() {
        if (tooLarge) {
          reject(new LogtoWebhookError("WEBHOOK_BODY_TOO_LARGE", undefined, 413));
          return;
        }
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
  }

  _requiredScope(req) {
    const url = req.url || ""
    if (url === "/api/v1/health") return null
    if (url === "/api/v1/me") return "profile:read"
    if (url.startsWith("/api/v1/keys") || url.startsWith("/api/v1/plugins") || url.startsWith("/api/v1/logs")) return "admin:users"
    if (req.method === "POST" || url.startsWith("/api/v1/schedule") || url.startsWith("/api/v1/plan")) return "publish:submit"
    return "publish:read"
  }

  _requiredFeature(req) {
    if (!req || req.method !== "POST") return null
    const url = String(req.url || "").split("?", 1)[0]
    if (url === "/api/v1/publish" || url === "/api/v1/batch-publish" ||
      url === "/api/v1/schedule" || url === "/api/v1/schedule/cancel" ||
      url === "/api/v1/plan" || url === "/api/v1/plan/execute" || url === "/api/v1/plan/delete" ||
      url === "/api/v1/webhook" || url === "/api/v1/webhook/remove") return "cloud_publish"
    return null
  }

  _usesLogtoIdentity(req) {
    return Boolean(this._logtoVerifier && req && req.auth && req.auth.authType !== "api_key" &&
      typeof req.auth.subject === "string" && req.auth.subject)
  }

  _ownerSubject(req) {
    if (req && req.auth && typeof req.auth.ownerSubject === "string" && req.auth.ownerSubject) {
      return req.auth.ownerSubject
    }
    return this._usesLogtoIdentity(req) ? req.auth.subject : null
  }

  _isApiKeyOwnerSubject(ownerSubject) {
    return typeof ownerSubject === "string" && /^api-key:[a-f0-9]{64}$/.test(ownerSubject)
  }

  _authorizeApiKeyScheduledOwner(ownerSubject) {
    const result = this._keyManager.validateOwnerSubject(ownerSubject, "publish:submit")
    if (!result.valid) {
      if (result.code === "API_KEY_STORE_UNAVAILABLE") {
        throw Object.assign(new Error(result.code), { code: result.code, status: 503 })
      }
      const code = result.code === "API_KEY_REVOKED"
        ? "SCHEDULE_OWNER_REVOKED"
        : "SCHEDULE_OWNER_INVALID"
      throw Object.assign(new Error(code), { code, status: 403 })
    }
    return true
  }

  _isOwnedResource(resource, req) {
    const owner = this._ownerSubject(req)
    if (!resource || typeof resource !== "object") return false
    const resourceOwner = typeof resource.ownerSubject === "string" && resource.ownerSubject
      ? resource.ownerSubject
      : null
    return resourceOwner === owner
  }

  _ownedResources(resources, req) {
    if (!Array.isArray(resources)) return []
    return resources.filter((resource) => this._isOwnedResource(resource, req))
  }

  _publicResource(resource) {
    if (!resource || typeof resource !== "object") return resource
    const result = { ...resource }
    delete result.ownerSubject
    return result
  }

  _publicResources(resources) {
    return (Array.isArray(resources) ? resources : []).map((resource) => this._publicResource(resource))
  }

  async _ensureRequestIdentity(req, url) {
    if (!this._usesLogtoIdentity(req)) return null
    if (!this._businessIdentityRepository) {
      throw Object.assign(new Error("BUSINESS_USER_REPOSITORY_NOT_CONFIGURED"), { code: "BUSINESS_USER_REPOSITORY_NOT_CONFIGURED", status: 503 })
    }
    const user = await ensureBusinessUser(this._businessIdentityRepository, req.auth, req.auth.profile || {})
    req.auth.businessUser = user
    return user
  }

  async _assertEntitlementFeature(req, feature) {
    if (!feature || !this._usesLogtoIdentity(req)) return true
    if (!this._entitlementProvider) {
      throw Object.assign(new Error("ENTITLEMENT_PROVIDER_NOT_CONFIGURED"), { code: "ENTITLEMENT_PROVIDER_NOT_CONFIGURED", status: 503 })
    }
    const context = { auth: req.auth, businessUser: req.auth.businessUser, feature }
    if (typeof this._entitlementProvider.requireFeature === "function") {
      const result = await this._entitlementProvider.requireFeature(context)
      if (result === false) throw Object.assign(new Error("ENTITLEMENT_FEATURE_REQUIRED"), { code: "ENTITLEMENT_FEATURE_REQUIRED", status: 403 })
      return true
    }
    if (typeof this._entitlementProvider.getForUser !== "function") {
      throw Object.assign(new Error("ENTITLEMENT_PROVIDER_INVALID"), { code: "ENTITLEMENT_PROVIDER_INVALID", status: 503 })
    }
    const entitlement = await this._entitlementProvider.getForUser(context)
    const features = entitlement && Array.isArray(entitlement.features) ? entitlement.features : []
    if (!features.includes(feature)) {
      throw Object.assign(new Error("ENTITLEMENT_FEATURE_REQUIRED"), { code: "ENTITLEMENT_FEATURE_REQUIRED", status: 403 })
    }
    return true
  }

  async _consumeEntitlementFeature(req, feature, amount = 1) {
    if (!feature || !this._usesLogtoIdentity(req)) return null
    if (!this._entitlementProvider || typeof this._entitlementProvider.consumeFeature !== "function") {
      throw Object.assign(new Error("ENTITLEMENT_USAGE_PROVIDER_NOT_CONFIGURED"), {
        code: "ENTITLEMENT_USAGE_PROVIDER_NOT_CONFIGURED", status: 503,
      })
    }
    return this._entitlementProvider.consumeFeature({
      auth: req.auth,
      businessUser: req.auth.businessUser,
      feature,
    }, amount)
  }

  async _authorizeScheduledEntry(entry) {
    const ownerSubject = entry && entry.ownerSubject
    if (!this._identityAuthRequired && this._isApiKeyOwnerSubject(ownerSubject)) {
      return this._authorizeApiKeyScheduledOwner(ownerSubject)
    }
    if (!this._logtoVerifier) return true
    if (typeof ownerSubject !== "string" || !ownerSubject) {
      throw Object.assign(new Error("SCHEDULE_OWNER_REQUIRED"), { code: "SCHEDULE_OWNER_REQUIRED", status: 403 })
    }
    if (!this._businessIdentityRepository || typeof this._businessIdentityRepository.findBySubject !== "function") {
      throw Object.assign(new Error("BUSINESS_USER_REPOSITORY_NOT_CONFIGURED"), {
        code: "BUSINESS_USER_REPOSITORY_NOT_CONFIGURED",
        status: 503,
      })
    }
    const user = await this._businessIdentityRepository.findBySubject("logto", ownerSubject)
    if (!user) throw new BusinessIdentityError("BUSINESS_USER_NOT_FOUND", undefined, 403)
    assertBusinessUserActive(user)
    const requestContext = { auth: { subject: ownerSubject, businessUser: user } }
    await this._assertEntitlementFeature(requestContext, "cloud_publish")
    const amount = Array.isArray(entry.platforms) ? entry.platforms.length : 1
    await this._consumeEntitlementFeature(requestContext, "cloud_publish", Math.max(1, amount))
    return true
  }

  async _buildEntitlement(req) {
    const user = req.auth.businessUser
    let entitlement = this._entitlementProvider && typeof this._entitlementProvider.getForUser === "function"
      ? await this._entitlementProvider.getForUser({ auth: req.auth, businessUser: user })
      : { plan: "free", features: [] }
    entitlement = entitlement && typeof entitlement === "object" ? entitlement : {}
    const plan = typeof entitlement.plan === "string" && entitlement.plan ? entitlement.plan : "free"
    const features = Array.from(new Set(Array.isArray(entitlement.features)
      ? entitlement.features.filter((feature) => typeof feature === "string" && feature.length <= 100)
      : []))
    const response = { plan, features }
    if (entitlement.quota && typeof entitlement.quota === "object" && !Array.isArray(entitlement.quota)) response.quota = entitlement.quota
    return response
  }

  async _buildEntitlementSnapshot(req, entitlement) {
    if (!this._entitlementSigner || typeof this._entitlementSigner.sign !== "function") return null
    const deviceId = req.headers && req.headers["x-device-id"]
    if (typeof deviceId !== "string" || !/^[A-Za-z0-9._:-]{16,128}$/.test(deviceId)) {
      throw Object.assign(new Error("DEVICE_ID_INVALID"), { code: "DEVICE_ID_INVALID", status: 400 })
    }
    const now = Math.floor(Date.now() / 1000)
    const snapshot = {
      sub: req.auth.subject,
      device_id: deviceId,
      plan: entitlement.plan,
      features: entitlement.features,
      ...(entitlement.quota ? { quota: entitlement.quota } : {}),
      iat: now,
      exp: now + 7 * 24 * 60 * 60,
    }
    const signed = await this._entitlementSigner.sign(snapshot)
    return signed && typeof signed === "object" ? signed : { token: signed }
  }

  async _handle(req, res) {
    var url = req.url || "/";
    var method = req.method || "GET";
    var _startTime = Date.now();
    var _self = this;
    var _origEnd = res.end;
    res.end = function() { res.end = _origEnd; res.end.apply(res, arguments); if (_self._accessLogger) _self._accessLogger.log(req, res, _startTime); };

    if (method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "http://localhost:5174", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Device-ID" });
      res.end();
      return;
    }

    // Logto webhook 使用独立 HMAC 信任边界，不经过 Bearer/API key 鉴权。
    if (url === "/api/v1/auth/logto/webhook") {
      if (method !== "POST") {
        this._json(res, 405, { success: false, error: "METHOD_NOT_ALLOWED" });
        return;
      }
      if (!this._logtoWebhookConsumer) {
        this._json(res, 404, { success: false, error: "WEBHOOK_NOT_CONFIGURED" });
        return;
      }
      try {
        var webhookMaxBodyBytes = Number.isInteger(this._logtoWebhookConsumer.maxBodyBytes)
          ? this._logtoWebhookConsumer.maxBodyBytes
          : 256 * 1024;
        var rawWebhookBody = await this._readRawBody(req, webhookMaxBodyBytes);
        var webhookResult = await this._logtoWebhookConsumer.consume({
          rawBody: rawWebhookBody,
          signature: req.headers[LOGTO_WEBHOOK_SIGNATURE_HEADER],
        });
        this._json(res, 200, { success: true, ...webhookResult });
      } catch (error) {
        var webhookStatus = error && Number.isInteger(error.status) ? error.status : 500;
        var webhookCode = error && error.code ? error.code : "WEBHOOK_PROCESSING_FAILED";
        this._json(res, webhookStatus, { success: false, error: webhookCode });
      }
      return;
    }

    // Rate limiting
    if (this._rateLimiter && !this._rateLimiter.check(req.socket.remoteAddress || req.headers["x-forwarded-for"] || "unknown")) {
      this._json(res, 429, { error: "Too Many Requests", message: "Rate limit exceeded. Try again later." });
      return;
    }

    const authResult = this._logtoVerifier
      ? await this._checkAuth(req, this._requiredScope(req))
      : this._checkAuth(req)
    if (!authResult.authorized) {
      this._json(res, authResult.status || 401, { error: "Unauthorized", message: authResult.error || "Valid API key required" });
      return;
    }

    // 认证上下文必须挂在当前请求对象，不能写入 server 级共享字段。
    if (authResult.subject || authResult.ownerSubject) {
      req.auth = {
        ...(authResult.subject ? { subject: authResult.subject } : {}),
        ownerSubject: authResult.ownerSubject || authResult.subject,
        authType: authResult.authType || (authResult.subject ? "logto" : "api_key"),
        scopes: Array.isArray(authResult.scopes) ? authResult.scopes.slice() : [],
        profile: authResult.profile || null,
      };
    }
    if (authResult.subject) {
      try {
        await this._ensureRequestIdentity(req, url);
        await this._assertEntitlementFeature(req, this._requiredFeature(req));
      } catch (error) {
        this._json(res, error && error.status ? error.status : 503, {
          error: error && error.code ? error.code : "BUSINESS_USER_UNAVAILABLE",
          message: error && error.status === 403 ? "当前账号无权执行此操作" : "业务用户或权益服务暂时不可用",
        });
        return;
      }
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
        this._json(res, 200, { status: "ok", version: "1.0.0", platforms: Object.keys(require("./index").REGISTRY).length });
        return;
      }

      // --- Current business identity ---
      if (method === "GET" && url === "/api/v1/me") {
        if (!req.auth || !req.auth.businessUser) {
          this._json(res, 503, { error: "BUSINESS_USER_REPOSITORY_NOT_CONFIGURED" });
          return;
        }
        const businessUser = req.auth.businessUser;
        let entitlement;
        let entitlementSnapshot;
        try {
          entitlement = await this._buildEntitlement(req);
          entitlementSnapshot = await this._buildEntitlementSnapshot(req, entitlement);
        } catch (error) {
          this._json(res, error && error.status ? error.status : 503, {
            error: error && error.code ? error.code : "ENTITLEMENT_UNAVAILABLE",
            message: error && error.status === 400 ? "设备标识无效" : "权益暂时不可用",
          });
          return;
        }
        this._json(res, 200, {
          user: {
            id: businessUser.id,
            status: businessUser.status || "active",
            displayName: businessUser.display_name || null,
            avatarUrl: businessUser.avatar_url || null,
          },
          entitlement,
          ...(entitlementSnapshot ? { entitlementSnapshot } : {}),
        });
        return;
      }

      // --- Key Management ---
      if (url === "/api/v1/keys") {
        if (method === "GET") {
          var includeRevoked = req.url.indexOf("?revoked=true") !== -1;
          this._keyManager.load();
          this._json(res, 200, { keys: this._keyManager.listKeys(includeRevoked), count: this._keyManager.listKeys(includeRevoked).length });
          return;
        }
        if (method === "POST") {
          var b = await this._parseBody(req);
          if (!b || !b.name) { this._json(res, 400, { error: "name is required" }); return; }
          try {
            var k = this._keyManager.createKey(b.name, b.scopes);
            this._json(res, 200, { success: true, key: k.key, name: k.name, scopes: k.scopes, createdAt: k.createdAt });
          } catch(e) {
            this._json(res, 400, { error: e.message });
          }
          return;
        }
      }
      if (method === "POST" && url === "/api/v1/keys/revoke") {
        var b = await this._parseBody(req);
        if (!b || !b.key) { this._json(res, 400, { error: "key is required" }); return; }
        this._keyManager.load();
        var ok = this._keyManager.revokeKey(b.key);
        if (!ok) { this._json(res, 404, { error: "Key not found" }); return; }
        this._json(res, 200, { success: true });
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
          await this._consumeEntitlementFeature(req, "cloud_publish", 1);
        } catch (error) {
          this._json(res, error && error.status ? error.status : 503, {
            error: error && error.code ? error.code : "ENTITLEMENT_USAGE_UNAVAILABLE",
          });
          return;
        }

        try {
          if (this._opts.dryRun) {
            var supported = supportsApi(platform);
            this._auditLog.log({ ownerSubject: this._ownerSubject(req), type: "publish", platform: platform, title: taskData.title, status: supported ? "success" : "failed", details: { dryRun: true } });
            this._json(res, 200, { success: supported, platform: platform, dryRun: true, error: supported ? undefined : "No API adapter for platform: " + platform });
          } else {
            var result = await this._publishViaApi(platform, taskData, cookie);
            this._auditLog.log({ ownerSubject: this._ownerSubject(req), type: "publish", platform: platform, title: taskData.title, status: "success", publishId: result.publishId });
            this._json(res, 200, { success: true, platform: platform, url: result.url, publishId: result.publishId });
          }
        } catch (e) {
          this._auditLog.log({ ownerSubject: this._ownerSubject(req), type: "publish", platform: platform, title: taskData.title, status: "failed", error: safeErrorCode(e, "PUBLISH_FAILED") });
          this._json(res, 200, { success: false, platform: platform, error: "PUBLISH_FAILED" });
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
        try {
          await this._consumeEntitlementFeature(req, "cloud_publish", Math.max(1, platforms.length));
        } catch (error) {
          this._json(res, error && error.status ? error.status : 503, {
            error: error && error.code ? error.code : "ENTITLEMENT_USAGE_UNAVAILABLE",
          });
          return;
        }
        var results = await batchPublish(platforms, taskData, cookie, opts);
        this._auditLog.log({ ownerSubject: this._ownerSubject(req), type: "batch", platform: platforms, title: taskData.title, status: results.every(function(r){return r.success}) ? "success" : "failed", details: results });
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
              ownerSubject: this._ownerSubject(req),
              platforms: body.platforms,
              title: body.title,
              content: body.content,
              tags: body.tags,
              cookie: body.cookie,
              scheduledAt: body.scheduledAt
            });
            this._json(res, 200, { success: true, entry: this._publicResource(entry) });
          } catch (e) {
            this._json(res, 400, { success: false, error: e.message });
          }
          return;
        }
        if (method === "GET" && url === "/api/v1/schedule") {
          this._json(res, 200, { entries: this._publicResources(this._ownedResources(this._scheduler.list(), req)) });
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
        var entry = this._scheduler.get(body.id);
        if (!this._isOwnedResource(entry, req)) {
          this._json(res, 404, { success: false, error: "Not found" });
          return;
        }
        var ok = this._scheduler.cancel(body.id);
        this._json(res, ok ? 200 : 404, { success: ok });
        return;
      }

            // --- Webhook ---
      if (url === "/api/v1/webhook") {
        if (method === "POST") {
          var body = await this._parseBody(req);
          try {
            var wh = await this._webhookManager.register({
              url: body.url,
              events: body.events,
              ownerSubject: this._ownerSubject(req),
            });
            this._json(res, 200, { success: true, webhook: this._publicResource(wh) });
          } catch (e) {
            this._json(res, 400, { success: false, error: e.message });
          }
          return;
        }
        if (method === "GET") {
          this._json(res, 200, { webhooks: this._publicResources(this._ownedResources(this._webhookManager.list(), req)) });
          return;
        }
      }

      // --- Webhook Remove ---
      if (method === "POST" && url === "/api/v1/webhook/remove") {
        var body = await this._parseBody(req);
        var ok = this._webhookManager.remove(body.id, this._ownerSubject(req));
        this._json(res, ok ? 200 : 404, { success: ok });
        return;
      }

      // --- Audit Log ---
      if (method === "GET" && url === "/api/v1/logs") {
        const owner = this._ownerSubject(req);
        this._json(res, 200, { logs: this._publicResources(this._auditLog.list(undefined, undefined, owner)), stats: this._auditLog.stats(owner) });
        return;
      }
      if (method === "POST" && url === "/api/v1/logs/clear") {
        this._auditLog.clear(this._ownerSubject(req));
        this._json(res, 200, { success: true });
        return;
      }

      // --- Publishing Plan ---
      if (url === "/api/v1/plan") {
        if (method === "POST") {
          var body = await this._parseBody(req);
          try {
            var plan = await this._planManager.create({ ownerSubject: this._ownerSubject(req), name: body.name, items: body.items });
            this._json(res, 200, { success: true, plan: this._publicResource(plan) });
          } catch (e) {
            this._json(res, 400, { success: false, error: e.message });
          }
          return;
        }
        if (method === "GET") {
          this._json(res, 200, { plans: this._publicResources(this._ownedResources(this._planManager.list(), req)) });
          return;
        }
      }
      if (method === "POST" && url === "/api/v1/plan/execute") {
        var body = await this._parseBody(req);
        var requestedPlan = this._planManager.get(body.id);
        if (!this._isOwnedResource(requestedPlan, req)) {
          this._json(res, 404, { success: false, error: "Plan not found" });
          return;
        }
        if (requestedPlan) {
          const usageAmount = requestedPlan.items.reduce((total, item) => {
            if (item.status !== "pending") return total;
            return total + (Array.isArray(item.platform) ? item.platform.length : 1);
          }, 0);
          if (usageAmount > 0) {
            try {
              await this._consumeEntitlementFeature(req, "cloud_publish", usageAmount);
            } catch (error) {
              this._json(res, error && error.status ? error.status : 503, {
                error: error && error.code ? error.code : "ENTITLEMENT_USAGE_UNAVAILABLE",
              });
              return;
            }
          }
        }
        var result = await this._planManager.execute(body.id);
        var plan = this._planManager.get(body.id);
        if (plan) this._auditLog.log({ ownerSubject: this._ownerSubject(req), type: "plan", platform: plan.items.map(function(i){return i.platform}), title: plan.name, status: result.success ? "success" : "failed", details: result });
        this._json(res, 200, result);
        return;
      }
      if (method === "POST" && url === "/api/v1/plan/delete") {
        var body = await this._parseBody(req);
        var requestedPlan = this._planManager.get(body.id);
        if (!this._isOwnedResource(requestedPlan, req)) {
          this._json(res, 404, { success: false, error: "Plan not found" });
          return;
        }
        var ok = this._planManager.delete(body.id);
        this._json(res, ok ? 200 : 404, { success: ok });
        return;
      }

      // --- Metrics ---
      if (method === "GET" && url === "/api/v1/metrics") {
        const owner = this._ownerSubject(req);
        this._json(res, 200, {
          uptime: this._startedAt ? Date.now() - new Date(this._startedAt).getTime() : 0,
          startedAt: this._startedAt,
          platforms: Object.keys(require("./index").REGISTRY).length,
          audit: this._auditLog.stats(owner),
          scheduled: this._publicResources(this._ownedResources(this._scheduler ? this._scheduler.list() : [], req)),
          webhooks: this._publicResources(this._ownedResources(this._webhookManager.list(), req)),
          plans: this._publicResources(this._ownedResources(this._planManager.list(), req))
        });
        return;
      }

      // --- Plugin Management ---
      if (url === "/api/v1/plugins") {
        if (method === "GET") {
          var plugins = [];
          try {
            var all = pluginLoader.listAll ? pluginLoader.listAll() : [];
            for (var i = 0; i < all.length; i++) {
              var p = all[i];
              plugins.push({
                platform: p.platform || p.name,
                name: p.displayName || p.platform || p.name,
                enabled: pluginLoader.isEnabled ? pluginLoader.isEnabled(p.platform || p.name) : true,
                version: p.version || (p.manifest && p.manifest.version) || "unknown"
              });
            }
          } catch(e) { /* empty */ }
          this._json(res, 200, { plugins: plugins, count: plugins.length });
          return;
        }
      }
      if (method === "POST" && url === "/api/v1/plugins/reload") {
        try {
          reloadPlugins();
          this._json(res, 200, { success: true, reloaded: true, timestamp: new Date().toISOString() });
        } catch(e) {
          this._json(res, 500, { success: false, error: e.message });
        }
        return;
      }

      // --- Plugin Management ---
      if (url === "/api/v1/plugins") {
        if (method === "GET") {
          var plugins = [];
          try {
            var all = pluginLoader.listAll ? pluginLoader.listAll() : [];
            for (var i = 0; i < all.length; i++) {
              var p = all[i];
              plugins.push({
                platform: p.platform || p.name,
                name: p.displayName || p.platform || p.name,
                enabled: pluginLoader.isEnabled ? pluginLoader.isEnabled(p.platform || p.name) : true,
                version: p.version || (p.manifest && p.manifest.version) || "unknown"
              });
            }
          } catch(e) { /* empty */ }
          this._json(res, 200, { plugins: plugins, count: plugins.length });
          return;
        }
      }
      if (method === "POST" && url === "/api/v1/plugins/reload") {
        try {
          reloadPlugins();
          this._json(res, 200, { success: true, reloaded: true, timestamp: new Date().toISOString() });
        } catch(e) {
          this._json(res, 500, { success: false, error: e.message });
        }
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
          { m: "GET", p: "/api/v1/me", d: "Get current business user and authoritative entitlement. Signed snapshots require X-Device-ID" },
          { m: "GET", p: "/api/v1/platforms", d: "List all supported platforms" },
          { m: "POST", p: "/api/v1/publish", d: "Publish to one platform. Body: { platform, title, content, tags, cookie }" },
          { m: "POST", p: "/api/v1/batch-publish", d: "Batch publish to multiple platforms. Body: { platforms, title, content, tags, cookie }" },
          { m: "POST", p: "/api/v1/schedule", d: "Schedule a future publish. Body: { platforms, title, content, tags, cookie, scheduledAt }" },
          { m: "GET", p: "/api/v1/schedule", d: "List all scheduled tasks" },
          { m: "POST", p: "/api/v1/schedule/cancel", d: "Cancel a pending scheduled task. Body: { id }" },
          { m: "POST", p: "/api/v1/webhook", d: "Register a webhook URL. Body: { url, events }" },
          { m: "GET", p: "/api/v1/webhook", d: "List registered webhooks" },
          { m: "POST", p: "/api/v1/webhook/remove", d: "Remove a webhook. Body: { id }" },
          { m: "POST", p: "/api/v1/auth/logto/webhook", d: "Receive Logto user webhook. HMAC: logto-signature-sha-256" },
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
          "/api/v1/me": { get: { summary: "获取当前业务用户和权威权益", parameters: [{ name: "X-Device-ID", in: "header", required: false, schema: { type: "string", minLength: 16, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" } }], responses: { "200": { description: "用户与 entitlement" }, "400": { description: "设备标识无效" }, "503": { description: "业务用户或权益服务不可用" } }, security: [{ bearerAuth: [] }] } },
          "/api/v1/platforms": { get: { summary: "平台列表", responses: { "200": { description: "平台列表" } } } },
          "/api/v1/publish": { post: { summary: "单平台发布", requestBody: { content: { "application/json": { schema: { type: "object", properties: { platform: { type: "string" }, title: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, cookie: { type: "string" } }, required: ["platform"] } } } }, responses: { "200": { description: "发布结果" } } } },
          "/api/v1/batch-publish": { post: { summary: "批量发布", requestBody: { content: { "application/json": { schema: { type: "object", properties: { platforms: { type: "array", items: { type: "string" } }, title: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, cookie: { type: "string" } }, required: ["platforms"] } } } }, responses: { "200": { description: "批量发布结果" } } } },
          "/api/v1/schedule": { post: { summary: "创建定时发布", requestBody: { content: { "application/json": { schema: { type: "object", properties: { platforms: { type: "array", items: { type: "string" } }, title: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, cookie: { type: "string" }, scheduledAt: { type: "string", format: "date-time" } }, required: ["platforms", "scheduledAt"] } } } }, responses: { "200": { description: "创建成功" } } }, get: { summary: "列出定时任务", responses: { "200": { description: "任务列表" } } } },
          "/api/v1/schedule/cancel": { post: { summary: "取消定时任务", requestBody: { content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } } }, responses: { "200": { description: "取消结果" } } } },
          "/api/v1/webhook": { post: { summary: "注册 webhook", requestBody: { content: { "application/json": { schema: { type: "object", properties: { url: { type: "string", format: "uri" }, events: { type: "array", items: { type: "string" } } }, required: ["url"] } } } }, responses: { "200": { description: "注册成功" } } }, get: { summary: "列出 webhook", responses: { "200": { description: "webhook 列表" } } } },
          "/api/v1/auth/logto/webhook": { post: { summary: "接收 Logto 用户 webhook（HMAC）", parameters: [{ name: "logto-signature-sha-256", in: "header", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { type: "object", required: ["event", "hookId", "createdAt", "data"] } } } }, responses: { "200": { description: "已接收或幂等重复" }, "401": { description: "签名无效" }, "413": { description: "请求体过大" } } } },
          "/api/v1/logs": { get: { summary: "获取发布日志" } },
          "/api/v1/logs/clear": { post: { summary: "清空发布日志" } },
          "/api/v1/plan": { post: { summary: "创建发布计划" }, get: { summary: "列出发布计划" } },
          "/api/v1/plan/execute": { post: { summary: "执行发布计划" } },
          "/api/v1/plan/delete": { post: { summary: "删除发布计划" } },
          "/api/v1/rate-limiter": { get: { summary: "获取当前限流状态" } },
          "/api/v1/access-log": { get: { summary: "Access 日志配置" } },
          "/api/v1/webhook/remove": { post: { summary: "删除 webhook", requestBody: { content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } } } }, responses: { "200": { description: "删除结果" } } } }
        };
        var openApiPaths = Object.assign({}, pathItems, {
          "/api/v1/keys": {
            get: { summary: "List API keys", responses: { "200": { description: "Key list" } }, security: [{ bearerAuth: [] }] },
            post: { summary: "Create API key", requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, scopes: { type: "array", items: { type: "string" } } }, required: ["name"] } } } }, responses: { "200": { description: "Created key" } }, security: [{ bearerAuth: [] }] }
          },
          "/api/v1/keys/revoke": {
            post: { summary: "Revoke API key", requestBody: { content: { "application/json": { schema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } } } }, responses: { "200": { description: "Revoked" } }, security: [{ bearerAuth: [] }] }
          },
          "/api/v1/plugins": {
            get: { summary: "List plugins", responses: { "200": { description: "Plugin list" } } }
          },
          "/api/v1/plugins/reload": {
            post: { summary: "Reload plugins", responses: { "200": { description: "Reloaded" } } }
          }
        });
        spec.paths = openApiPaths;
        this._json(res, 200, spec);
        return;
      }

      this._json(res, 404, { error: "Not found", path: url });
      } catch (e) {
        this._json(res, 500, { error: "INTERNAL_SERVER_ERROR" });
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
