const { CosUploader } = require("../../src/cos-uploader");
const Base = require("../base-provider");
class CosUploadProvider extends Base {
  constructor() { super("cos"); }
  async _doUpload(td, cookie) {
    const eps = { xiaohongshu: { url: "https://creator.xiaohongshu.com/api/v1/upload/token", ref: "https://creator.xiaohongshu.com/" }, tencent_video: { url: "https://channels.weixin.qq.com/api/video/upload/auth", ref: "https://channels.weixin.qq.com/" } };
    const cfg = eps[td.platform];
    if (!cfg) throw new Error("No COS config for " + td.platform);
    const r = await this._post(cfg.url, cookie, cfg.ref);
    if (r.status !== 200 || !r.data) return null;
    const d = r.data;
    const t = { uploadAddr: d.upload_addr || d.uploadAddr || d.domain, fileIds: d.file_ids || d.fileIds || [d.file_id || d.fileId], token: d.token || d.upload_token || d.security_token || d.credentials?.sessionToken };
    const u = new CosUploader();
    const result = await u.upload(td.filePath, t, null);
    return { fileId: result.fileId, url: t.uploadAddr + "/" + result.fileId };
  }
}
module.exports = CosUploadProvider;
