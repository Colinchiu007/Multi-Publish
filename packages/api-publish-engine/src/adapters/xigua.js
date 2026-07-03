const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");

class XiGuaAdapter extends BasePlatformAdapter {
  constructor() {
    super("xigua");
    this.apiBase = "https://ixigua.com";
  }
  getReferer() { return "https://ixigua.com"; }
  getOrigin() { return "https://ixigua.com"; }
  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra });
  }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "xigua"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "xigua"}, cookie); return r?.cover || null; }
  buildPostData(t) {
    return { title: t.title || "", content: t.content || "", tags: t.tags || [] };
  }
  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post("https://ixigua.com/api/video/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "xigua", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "xigua" };
  }
}
module.exports = XiGuaAdapter;