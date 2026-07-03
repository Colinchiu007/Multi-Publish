/**
 * API Router ? P0/P1/P2 API mode routing
 *
 * P0: has_api:true platforms use API mode (1-5s vs 60s+ RPA)
 * P1: New platform adapters prioritize API, RPA as fallback
 * P2: Auto-route from platforms.yaml, auto-fallback on failure
 */
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

const CONFIG_PATH = path.resolve(__dirname, "..", "..", "..", "config", "platforms.yaml");
let _platforms = null;
let _apiPlatforms = null;

function loadConfig() {
  if (_platforms) return _platforms;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    _platforms = yaml.load(raw).platforms;
    _apiPlatforms = Object.entries(_platforms)
      .filter(function(e) { return e[1].has_api; })
      .map(function(e) { return e[0]; });
    return _platforms;
  } catch (e) {
    console.error("[api-router] Failed to load platforms.yaml:", e.message);
    _platforms = {};
    _apiPlatforms = [];
    return _platforms;
  }
}

function reloadConfig() {
  _platforms = null;
  _apiPlatforms = null;
  return loadConfig();
}

function shouldUseApi(platform) {
  var cfg = loadConfig()[platform];
  return cfg ? !!cfg.has_api : false;
}

function supportsApi(platform) {
  var KEYS = [
    "zhihu", "douyin", "xiaohongshu", "tencent_video", "kuaishou",
    "baijiahao", "wechat_mp", "bilibili", "weibo", "toutiao",
    "aiqiyi", "dayu", "qiehao", "souhu", "wangyi", "tengxun_shipin",
    "weishi", "yidianhao", "souhu_shipin", "pipixia", "meipai",
    "acfun", "dewu", "chejiahao", "yichehao", "meiyou",
    "xhs_shangjia", "xigua", "duoduo",
    "youtube", "tiktok", "twitter",
  ];
  return KEYS.indexOf(platform) >= 0;
}

function listApiPlatforms() {
  loadConfig();
  return _apiPlatforms || [];
}

async function publishWithFallback(platform, taskData, cookie, opts) {
  opts = opts || {};
  var useApi = shouldUseApi(platform);
  var result = { platform: platform, apiAttempt: null, rpaFallback: false, success: false };

  if (useApi && supportsApi(platform)) {
    try {
      var { publishViaApi } = require("./index");
      result.apiAttempt = await publishViaApi(platform, taskData, cookie, opts);
      result.success = result.apiAttempt.success;
      if (result.success) return result;
    } catch (apiErr) {
      result.apiAttempt = { success: false, error: apiErr.message };
    }
  }

  if (!result.success && opts.rpaFallback !== false) {
    result.rpaFallback = true;
    result.fallbackReason = result.apiAttempt
      ? "API failed, needs RPA fallback"
      : "No API mode available, needs RPA";

    if (typeof opts.rpaPublish === "function") {
      try {
        var rpaResult = await opts.rpaPublish(platform, taskData, cookie, opts);
        result.success = rpaResult.success;
        result.rpaResult = rpaResult;
      } catch (rpaErr) {
        result.error = rpaErr.message;
      }
    } else {
      result.requiresRpa = true;
    }
  }

  return result;
}

async function batchPublishWithRouting(platforms, taskData, cookie, opts) {
  opts = opts || {};
  var results = [];
  var total = platforms.length;

  for (var i = 0; i < total; i++) {
    var plat = platforms[i];
    try {
      var r = await publishWithFallback(plat, taskData, cookie, opts);
      results.push(r);
    } catch (e) {
      results.push({ platform: plat, success: false, error: e.message });
    }
    if (opts.onProgress) {
      opts.onProgress(Math.round((i + 1) / total * 100), plat);
    }
  }
  return results;
}

module.exports = {
  shouldUseApi, supportsApi, listApiPlatforms,
  publishWithFallback, batchPublishWithRouting,
  loadConfig, reloadConfig,
};
