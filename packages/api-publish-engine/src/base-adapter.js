const axios = require("axios");
const { CancelToken } = require("./cancel-token");
const { ProgressEmitter, publishStatusEnum } = require("./progress-emitter");
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

  getReferer() { throw new Error("subclass must implement getReferer()"); }
  getOrigin() { return new URL(this.getReferer()).origin; }
  getHeaders(cookie, extra) { return buildHeaders(cookie, this.getReferer(), this.getOrigin(), extra); }

  async uploadVideo(taskData, cookie, cancelToken) { throw new Error("subclass must implement uploadVideo()"); }
  async uploadCover(taskData, cookie, cancelToken) { throw new Error("subclass must implement uploadCover()"); }
  buildPostData(taskData, uploadResult) { throw new Error("subclass must implement buildPostData()"); }
  async publish(cookie, postData, cancelToken) { throw new Error("subclass must implement publish()"); }

  async execute(taskData, cookie, opts) {
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
      if (onProgress) onProgress(100, result.success ? "Published!" : "Failed: " + (result.error || "unknown"));
      return result;
    } catch (err) {
      if (onProgress) onProgress(100, "Error: " + err.message);
      return { success: false, error: err.message, platform: this.name };
    }
  }
}

module.exports = { BasePlatformAdapter, buildHeaders, HttpConfig, CancelToken, ProgressEmitter, publishStatusEnum };
