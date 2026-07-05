const REGISTRY = {
  // Complex adapters (custom publish logic)
  zhihu: require("./adapters/zhihu"),
  douyin: require("./adapters/douyin"),
  kuaishou: require("./adapters/kuaishou"),
  baijiahao: require("./adapters/baijiahao"),
  wechat_mp: require("./adapters/wechat_mp"),
  tencent_video: require("./adapters/shipinhao"),
  weibo: require("./adapters/weibo"),
  // API-mode adapters (no publish method)
  youtube: require("./adapters/youtube"),
  tiktok: require("./adapters/tiktok"),
  twitter: require("./adapters/twitter"),
};


const { ScheduledPublish } = require("./scheduled-publish");
const { WebhookManager } = require("./webhook-manager");
const { AuditLog } = require("./audit-log");
const { PublishingPlan } = require("./publish-plan");
const { RateLimiter } = require("./rate-limiter");
const { AccessLogger } = require("./access-log");
const PluginLoader = require("./plugin-loader");

// ─── Plugin System Integration ───
const pluginLoader = new PluginLoader();
pluginLoader.loadAll();

/** 热重载所有插件 */
function reloadPlugins() {
  pluginLoader.loadAll();
}

/** Get all platforms including plugins */
function supportsApi(p) { return !!REGISTRY[p] || !!pluginLoader.get(p); }

/** Get adapter (built-in or plugin) */
function getAdapter(p) {
  var C = REGISTRY[p];
  if (C) return new C();
  // Try generic adapter for boilerplate platforms
  try {
    var { createAdapter } = require("./adapters/generic-adapter");
    var adapter = createAdapter(p);
    if (adapter) return adapter;
  } catch(e) { /* generic-adapter not available */ }
  var plugin = pluginLoader.get(p);
  return plugin || null;
}

async function publishViaApi(platform, taskData, cookie, opts) {
  var adapter = getAdapter(platform);
  if (!adapter) throw new Error("No API adapter for platform: " + platform);
  if (typeof adapter.publishViaApi === "function") return adapter.publishViaApi(taskData, cookie, opts);
  if (typeof adapter.publish === "function") return adapter.publish(taskData, cookie);
  var result = await adapter.execute(taskData, cookie, opts);
  if (!result || !result.success) throw new Error((result && result.error) || "API publish failed for " + platform);
  return result;
}

async function batchPublish(platforms, taskData, cookie, opts) {
  // Filter out disabled plugins
  platforms = platforms.filter(function(p) {
    var enabled = pluginLoader.isEnabled(p);
    // pluginLoader returns null for non-plugin platforms (built-in adapters)
    return enabled === null || enabled === true;
  });
  opts = opts || {};
  var results = [];
  var total = platforms.length;
  for (var i = 0; i < total; i++) {
    var plat = platforms[i];
    var entry = { platform: plat };
    try {
      if (!supportsApi(plat)) {
        entry.success = false;
        entry.error = "No API adapter for platform: " + plat;
      } else if (opts.dryRun) {
        entry.success = true;
        entry.dryRun = true;
      } else {
        entry.result = await publishViaApi(plat, taskData, cookie, opts);
        entry.success = true;
      }
    } catch (e) {
      entry.success = false;
      entry.error = e.message;
    }
    results.push(entry);
    if (opts.onProgress) opts.onProgress(Math.round((i + 1) / total * 100), plat);
  }
  return results;
}

module.exports = {
  getAdapter, supportsApi, publishViaApi, batchPublish, reloadPlugins,
  REGISTRY, pluginLoader,
  ScheduledPublish, WebhookManager, AuditLog, PublishingPlan, RateLimiter, AccessLogger,
  apiRouter: require("./api-router"),
  batchPublishWithRouting: require("./api-router").batchPublishWithRouting,
  publishWithFallback: require("./api-router").publishWithFallback,
};
