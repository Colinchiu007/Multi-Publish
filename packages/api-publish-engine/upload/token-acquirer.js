const axios = require("axios");
const cache = new Map();
function getCachedToken(p) { return cache.get(p) || null; }

class CosAcq {
  constructor(p, url, ref) { this.type="cos"; this.platform=p; this.url=url; this.ref=ref; }
  async acquireToken(cookie) {
    const c = cache.get(this.platform);
    if (c) return c;
    try {
      const r = await axios.post(this.url, {}, { headers: { Cookie: cookie, Referer: this.ref, "Content-Type": "application/json" }, validateStatus: () => true, timeout: 15000 });
      if (r.status !== 200 || !r.data) return null;
      const d = r.data;
      const t = { uploadAddr: d.upload_addr || d.uploadAddr || d.domain, fileIds: d.file_ids || d.fileIds || [d.file_id || d.fileId], token: d.token || d.upload_token || d.security_token || d.credentials?.sessionToken };
      if (t.uploadAddr && t.fileIds) cache.set(this.platform, t);
      return t;
    } catch(e) { console.warn("[acq/"+this.platform+"]", e.message); return null; }
  }
  invalidate() { cache.delete(this.platform); }
}

class OssAcq {
  constructor(p, url, ref) { this.type="oss"; this.platform=p; this.url=url; this.ref=ref; }
  async acquireToken(cookie) {
    const c = cache.get(this.platform);
    if (c) return c;
    try {
      const r = await axios.post(this.url, {}, { headers: { Cookie: cookie, Referer: this.ref, "Content-Type": "application/json" }, validateStatus: () => true, timeout: 15000 });
      if (r.status !== 200 || !r.data) return null;
      const d = r.data;
      const v = { endpoint: d.endpoint || d.oss_endpoint || d.host, upload_token: { access_id: d.access_id || d.accessKeyId || d.credentials?.accessKeyId, access_key: d.access_key || d.accessKeySecret || d.credentials?.accessKeySecret, access_token: d.access_token || d.securityToken || d.stsToken || d.credentials?.securityToken }, upload_file: { object_key: d.object_key || d.key || d.fileKey } };
      if (v.endpoint && v.upload_token.access_id) cache.set(this.platform, v);
      return v;
    } catch(e) { console.warn("[acq/"+this.platform+"]", e.message); return null; }
  }
  invalidate() { cache.delete(this.platform); }
}

const MAP = {
  xiaohongshu: new CosAcq("xiaohongshu", "https://creator.xiaohongshu.com/api/v1/upload/token", "https://creator.xiaohongshu.com/"),
  tencent_video: new CosAcq("tencent_video", "https://channels.weixin.qq.com/api/video/upload/auth", "https://channels.weixin.qq.com/"),
  zhihu: new OssAcq("zhihu", "https://zhuanlan.zhihu.com/api/upload/token", "https://zhuanlan.zhihu.com/write"),
  dewu: new OssAcq("dewu", "https://creator.dewu.com/api/oss/uploadAuth", "https://creator.dewu.com/release"),
  yidianhao: new OssAcq("yidianhao", "https://mp.yidianzixun.com/api/oss/token", "https://mp.yidianzixun.com"),
};

function getAcquirer(p) { return MAP[p] || null; }
function clearCache() { cache.clear(); }

module.exports = { getAcquirer, getCachedToken, clearCache, CosAcq, OssAcq };
