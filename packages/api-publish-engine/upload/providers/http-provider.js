const axios = require("axios");
const fs = require("fs");
const { getPlatformConfig } = require("./http-config");
const { buildDouyinParams } = require("../../src/signer-local");
const { randomUA, randomDelay, randomizeHeaders } = require("../../src/anti-detect");

let FormData = null;
try { FormData = require("form-data"); } catch(e) {}

class HttpUploadProvider {
  constructor() { this.type = "http"; }

  _getUploadUrl(platform) {
    const cfg = getPlatformConfig(platform);
    if (!cfg) return null;
    return "https://" + cfg.apiDomain + cfg.uploadPath;
  }

  /** @returns {{Cookie: string, Referer: string, 'User-Agent': string}} */
  _getHeaders(cfg, cookie) {
    const h = { Cookie: cookie, Referer: cfg.referer, "User-Agent": randomUA() };
    if (cfg.contentType && cfg.contentType !== "multipart/form-data") h["Content-Type"] = cfg.contentType;
    return h;
  }

  _addSigning(platform, headers, cookie) {
    if (platform === "douyin") return buildDouyinParams(headers["User-Agent"]);
    if (platform === "kuaishou") {
      const m = cookie && cookie.match(/kuaishou\.web\.cp\.api_ph=([^;]+)/);
      if (m) headers["x-api-ph"] = m[1];
    }
    return {};
  }

  async uploadVideo(td, cookie) {
    if (!td.filePath) return null;
    try {
      const cfg = getPlatformConfig(td.platform);
      if (!cfg) return null;
      const url = this._getUploadUrl(td.platform);
      var headers = this._getHeaders(cfg, cookie);
      const extra = this._addSigning(td.platform, headers, cookie);

      // 反检测：随机延迟 + Header 随机化
      await randomDelay(500, 1500);
      headers = randomizeHeaders(headers);

      if (FormData && cfg.uploadType === "form") {
        const fd = new FormData();
        fd.append("file", fs.createReadStream(td.filePath));
        Object.assign(headers, fd.getHeaders());
        const r = await axios.post(url, fd, { headers, maxBodyLength: Infinity, validateStatus: () => true });
        return r.data?.data?.fileId ? { fileId: r.data.data.fileId } : null;
      }

      // 2026-10-06：显式区分「已实现分片」与「整文件单次 POST」。
      // 本仓无这批平台的分片协议取证切片，故不编造分片实现；真正走分片的是
      // publish/platforms/ 下的新链（视频号 / B站 / 快手 / 抖音），它们不经过本文件。
      // 这里只对**未知** uploadType 显式拒绝——新增平台若忘记登记实现方式，
      // 应当当场失败，而不是静默走单次 POST 被误认为「已支持该平台的正确上传方式」。
      if (cfg.uploadType !== "single-post" && cfg.uploadType !== "form") {
        throw new Error(
          `[http] ${td.platform}: unknown uploadType "${cfg.uploadType}" — ` +
          "在 upload/providers/http-config.js 登记前必须先实现对应上传方式"
        );
      }

      // single-post：整文件读入内存后一次性 POST。**没有分片**——
      // 大文件会整份进内存，且平台侧是否接受非分片直传未经取证。
      const buf = fs.readFileSync(td.filePath);
      const r = await axios.post(url, buf, { headers, params: Object.keys(extra).length ? extra : undefined, validateStatus: () => true });
      const d = r.data?.data || r.data;
      return d?.fileId || d?.resourceId || d?.vid || d?.videoId ? { fileId: d.fileId || d.resourceId || d.vid || d.videoId, raw: r.data } : null;
    } catch(e) { console.warn("[http]", e.message); return null; }
  }

  async uploadCover(td, cookie) { return this.uploadVideo({...td, filePath: td.coverPath}, cookie); }
}

module.exports = HttpUploadProvider;