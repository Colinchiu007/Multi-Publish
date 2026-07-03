const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");
class DeWuAdapter extends BasePlatformAdapter {
  constructor() { super("dewu"); this.apiBase = "https://creator.dewu.com"; }
  getReferer() { return "https://creator.dewu.com/release"; }
  getOrigin() { return "https://creator.dewu.com"; }
  getHeaders(cookie, extra) { return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra }); }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "dewu"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "dewu"}, cookie); return r?.cover || null; }
  buildPostData(t) { return { title: t.title || "", content: t.content || "", tags: t.tags || [] }; }
  async publish(cookie, pd) {
    const h = this.getHeaders(cookie);
    const r = await this.http.post("https://creator.dewu.com/api/release", pd, { headers: h });
    if (r.data?.code === 0 || r.data?.ret === 0) return { success: true, platform: "dewu", publishId: r.data?.data?.id };
    return { success: false, error: r.data?.msg || "Publish failed", platform: "dewu" };
  }
}
module.exports = DeWuAdapter;
