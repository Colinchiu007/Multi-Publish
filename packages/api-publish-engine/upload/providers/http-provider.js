const axios = require("axios");
const fs = require("fs");
const { getPlatformConfig } = require("./http-config");
const { buildDouyinParams } = require("../../src/signer-local");

let FormData = null;
try { FormData = require("form-data"); } catch(e) {}

class HttpUploadProvider {
  constructor() { this.type = "http"; }

  _getUploadUrl(platform) {
    const cfg = getPlatformConfig(platform);
    if (!cfg) return null;
    return "https://" + cfg.apiDomain + cfg.uploadPath;
  }

  _getHeaders(cfg, cookie) {
    const h = { Cookie: cookie, Referer: cfg.referer, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };
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
      const headers = this._getHeaders(cfg, cookie);
      const extra = this._addSigning(td.platform, headers, cookie);

      if (FormData && cfg.uploadType === "form") {
        const fd = new FormData();
        fd.append("file", fs.createReadStream(td.filePath));
        Object.assign(headers, fd.getHeaders());
        const r = await axios.post(url, fd, { headers, maxBodyLength: Infinity, validateStatus: () => true });
        return r.data?.data?.fileId ? { fileId: r.data.data.fileId } : null;
      }

      const buf = fs.readFileSync(td.filePath);
      const r = await axios.post(url, buf, { headers, params: Object.keys(extra).length ? extra : undefined, validateStatus: () => true });
      const d = r.data?.data || r.data;
      return d?.fileId || d?.resourceId || d?.vid || d?.videoId ? { fileId: d.fileId || d.resourceId || d.vid || d.videoId, raw: r.data } : null;
    } catch(e) { console.warn("[http]", e.message); return null; }
  }

  async uploadCover(td, cookie) { return this.uploadVideo({...td, filePath: td.coverPath}, cookie); }
}

module.exports = HttpUploadProvider;
