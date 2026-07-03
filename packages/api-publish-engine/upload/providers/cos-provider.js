const { CosUploader } = require("../../src/cos-uploader");
const { getAcquirer } = require("../token-acquirer");
const Base = require("../base-provider");
class CosUploadProvider extends Base {
  constructor() { super("cos"); }
  async _doUpload(td, cookie) {
    const aq = getAcquirer(td.platform);
    if (!aq) throw new Error("No COS acquirer for " + td.platform);
    const token = await aq.acquireToken(cookie);
    if (!token) return null;
    const u = new CosUploader();
    const result = await u.upload(td.filePath, token, null);
    return { fileId: result.fileId, url: token.uploadAddr + "/" + result.fileId };
  }
}
module.exports = CosUploadProvider;
