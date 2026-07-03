const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");
class XiaohongshuAdapter extends BasePlatformAdapter {
  constructor() { super("xiaohongshu"); this.apiBase = "https://creator.xiaohongshu.com"; }
  getReferer() { return "https://creator.xiaohongshu.com/"; }
  getOrigin() { return "https://creator.xiaohongshu.com"; }
  getHeaders(cookie, extra) { return super.getHeaders(cookie, { "Content-Type": "application/json;charset=UTF-8", ...extra }); }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "xiaohongshu"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "xiaohongshu"}, cookie); return r?.cover || null; }
  buildPostData(td) { return { title: td.title || "", content: td.content || "", tags: td.tags || [] }; }
  async publish(cookie, pd) {
    const h = this.getHeaders(cookie);
    const r = await this.http.post(this.apiBase + "/api/v1/publish", pd, { headers: h });
    if (r.data?.success) return { success: true, platform: "xiaohongshu", publishId: r.data.id };
    return { success: false, error: r.data?.msg || "Publish failed", platform: "xiaohongshu" };
  }
}
module.exports = XiaohongshuAdapter;
