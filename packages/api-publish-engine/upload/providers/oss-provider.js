const { OssUploader } = require("../../src/oss-uploader");
const Base = require("../base-provider");
class OssUploadProvider extends Base {
  constructor() { super("oss"); }
  async _doUpload(td, cookie) {
    const eps = { zhihu: { url: "https://zhuanlan.zhihu.com/api/upload/token", ref: "https://zhuanlan.zhihu.com/write" }, dewu: { url: "https://creator.dewu.com/api/oss/uploadAuth", ref: "https://creator.dewu.com/release" }, yidianhao: { url: "https://mp.yidianzixun.com/api/oss/token", ref: "https://mp.yidianzixun.com" } };
    const cfg = eps[td.platform];
    if (!cfg) throw new Error("No OSS config for " + td.platform);
    const r = await this._post(cfg.url, cookie, cfg.ref);
    if (r.status !== 200 || !r.data) return null;
    const d = r.data;
    const v = { endpoint: d.endpoint || d.oss_endpoint || d.host, upload_token: { access_id: d.access_id || d.accessKeyId || d.credentials?.accessKeyId, access_key: d.access_key || d.accessKeySecret || d.credentials?.accessKeySecret, access_token: d.access_token || d.securityToken || d.stsToken || d.credentials?.securityToken }, upload_file: { object_key: d.object_key || d.key || d.fileKey } };
    const u = new OssUploader();
    const result = await u.upload(td.filePath, v, null);
    return { objectKey: result.objectKey, url: "https://" + v.endpoint + "/" + result.objectKey };
  }
}
module.exports = OssUploadProvider;
