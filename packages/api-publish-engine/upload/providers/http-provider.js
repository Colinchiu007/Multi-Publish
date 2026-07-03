const axios = require("axios");
const fs = require("fs");
let FormData = null;
try { FormData = require("form-data"); } catch(e) {}
class HttpUploadProvider {
  constructor() { this.type = "http"; }
  async uploadVideo(td, cookie) {
    if (!td.filePath) return null;
    try {
      if (FormData) { const fd = new FormData(); fd.append("file", fs.createReadStream(td.filePath)); fd.append("type", "video"); const h = { Cookie: cookie, ...fd.getHeaders() }; const r = await axios.post((td.uploadUrl || "https://upload.example.com/api/upload"), fd, { headers: h, maxBodyLength: Infinity, validateStatus: () => true }); return r.data?.data?.fileId ? { fileId: r.data.data.fileId } : null; }
      const buf = fs.readFileSync(td.filePath); const r = await axios.put((td.uploadUrl || "https://upload.example.com/api/upload"), buf, { headers: { Cookie: cookie, "Content-Type": "video/mp4" }, validateStatus: () => true }); return r.data?.fileId ? { fileId: r.data.fileId } : null;
    } catch(e) { console.warn("[http]", e.message); return null; }
  }
  async uploadCover(td, cookie) { return this.uploadVideo({...td, filePath: td.coverPath}, cookie); }
}
module.exports = HttpUploadProvider;
