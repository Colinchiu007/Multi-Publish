const axios = require("axios");
const { CancelToken } = require("./cancel-token");
const { ProgressEmitter, publishStatusEnum } = require("./progress-emitter");
const { formatContent } = require("./content-formatter");
const { errorCode, getMsg } = require("./error-codes");
const { withRetry, withCache, withMiddleware } = require("./retry-middleware");
const HttpConfig = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  timeout: 60000,
};

function buildHeaders(cookie, referer, origin, extra) {
  const h = {
    "User-Agent": HttpConfig.userAgent,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
  };
  if (cookie) h.Cookie = cookie;
  if (referer) h.Referer = referer;
  if (origin) h.Origin = origin;
  if (extra) Object.assign(h, extra);
  return h;
}

class BasePlatformAdapter {
  constructor(name) {
    this.name = name;
    this.http = axios.create({ timeout: HttpConfig.timeout, validateStatus: () => true });
  }

  /** @returns {string} */
  /** @returns {string} */
  getReferer() { throw new Error("subclass must implement getReferer()"); }
  getOrigin() { return new URL(this.getReferer()).origin; }
  getHeaders(cookie, extra) { return buildHeaders(cookie, this.getReferer(), this.getOrigin(), extra); }

  async uploadVideo(taskData, cookie, cancelToken) { throw new Error("subclass must implement uploadVideo()"); }
  async uploadCover(taskData, cookie, cancelToken) { throw new Error("subclass must implement uploadCover()"); }
  buildPostData(taskData, uploadResult) { throw new Error("subclass must implement buildPostData()"); }
  /**
   * @returns {Promise<{success: boolean, platform?: string, publishId?: string, error?: string, code?: number}>}
   */
  async publish(cookie, postData, cancelToken) { throw new Error('subclass must implement publish()'); }

  async execute(taskData, cookie, opts) {
    // 自动应用内容格式化（标签风格 / 截断）
    taskData = formatContent(this.name, taskData);
    this._cancelToken = new CancelToken();
    this._progress = new ProgressEmitter();
    const { cancelToken, onProgress } = opts || {};
    try {
      if (onProgress) onProgress(10, "Uploading video...");
      const videoResult = await this.uploadVideo(taskData, cookie, cancelToken);
      if (cancelToken && cancelToken.isCancelled) return { success: false, error: "Cancelled" };

      let coverResult = null;
      if (taskData.cover) {
        if (onProgress) onProgress(70, "Uploading cover...");
        coverResult = await this.uploadCover(taskData, cookie, cancelToken);
        if (cancelToken && cancelToken.isCancelled) return { success: false, error: "Cancelled" };
      }

      if (onProgress) onProgress(85, "Publishing...");
      const postData = this.buildPostData(taskData, { video: videoResult, cover: coverResult });
      const result = await this.publish(cookie, postData, cancelToken);
      if (!result.code && !result.success) result.code = errorCode.request_error;
      if (!result.code && result.success) result.code = errorCode.success;
      if (onProgress) onProgress(100, result.success ? "Published!" : "Failed: " + (result.error || "unknown"));
      return result;
    } catch (err) {
      if (onProgress) onProgress(100, "Error: " + err.message);
      // ???????????????
      var code = errorCode.unknown_error;
      if (err.message && err.message.indexOf("timeout") >= 0) code = errorCode.request_error;
      if (err.message && err.message.indexOf("parse") >= 0) code = errorCode.data_error;
      if (err.message && err.message.indexOf("cancel") >= 0) code = errorCode.cancel_error;
      if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") code = errorCode.request_error;
      return { success: false, error: err.message, code: code, platform: this.name };
    }
  }
}


function isCookieExpired(response, platform) {
  if (!response) return false;
  if (response.status === 401 || response.status === 403) return true;
  if (response.code === 401) return true;
  switch (platform) {
    case "douyin": return !!(response.code === 401 || (response.msg && response.msg.indexOf("\u767b\u5f55") >= 0));
    case "kuaishou": return !!(response.data && response.data.result === 1);
    case "zhihu": return !!(response.error && response.error.code === "not_logged_in");
    case "xiaohongshu": return !!(response.msg && response.msg.indexOf("\u767b\u5f55") >= 0);
    case "weibo": return !!(response.code === 0 && !response.data);
    default: return false;
  }
}

var UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
]

function randomUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]
}

function randomDelay(min, max) {
  min = min || 500
  max = max || 2000
  var ms = Math.floor(Math.random() * (max - min + 1)) + min
  return new Promise(function(resolve) { setTimeout(resolve, ms) })
}

function buildBrowserFingerprint(ua) {
  ua = ua || randomUA()
  var isWin = ua.indexOf("Windows") >= 0
  var match = ua.match(/Chrome\/(\d+)/)
  var version = match ? match[1] : "120"
  return {
    cookie_enabled: "true",
    screen_width: isWin ? "1920" : "1440",
    screen_height: isWin ? "1080" : "900",
    browser_language: "zh-CN",
    browser_platform: isWin ? "Win32" : "MacIntel",
    browser_name: "Chrome",
    browser_version: version,
    browser_online: "true",
    timezone_name: "Asia/Shanghai",
  }
}

module.exports = { BasePlatformAdapter, buildHeaders, HttpConfig, CancelToken, ProgressEmitter, publishStatusEnum, isCookieExpired, randomUA, randomDelay, buildBrowserFingerprint };