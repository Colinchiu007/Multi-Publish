const { OssUploader } = require("../../src/oss-uploader");
const { getAcquirer } = require("../token-acquirer");
const Base = require("../base-provider");
class OssUploadProvider extends Base {
  constructor() { super("oss"); }
  async _doUpload(td, cookie) {
    const aq = getAcquirer(td.platform);
    if (!aq) throw new Error("No OSS acquirer for " + td.platform);
    const vendor = await aq.acquireToken(cookie);
    if (!vendor) return null;
    const u = new OssUploader();
    const result = await u.upload(td.filePath, vendor, null);
    return { objectKey: result.objectKey, url: "https://" + vendor.endpoint + "/" + result.objectKey };
  }
}
module.exports = OssUploadProvider;
