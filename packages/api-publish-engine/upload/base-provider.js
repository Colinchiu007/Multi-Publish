const axios = require("axios");
class BaseUploadProvider {
  constructor(type) { this.type = type; }
  async _post(url, cookie, ref) {
    return axios.post(url, {}, { headers: { Cookie: cookie, Referer: ref, "Content-Type": "application/json" }, validateStatus: () => true });
  }
  async uploadVideo(td, cookie) {
    if (!td.filePath) return null;
    try { return await this._doUpload(td, cookie); }
    catch(e) { console.warn("[" + this.type + "]", e.message); return null; }
  }
  async uploadCover(td, cookie) { return this.uploadVideo({...td, filePath: td.coverPath}, cookie); }
}
module.exports = BaseUploadProvider;
