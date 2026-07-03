const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");

class XhsShangjiaAdapter extends BasePlatformAdapter {
  constructor() {
    super("xhs_shangjia");
    this.apiBase = "https://ark.xiaohongshu.com";
  }
  getReferer() { return "https://ark.xiaohongshu.com"; }
  getOrigin() { return "https://ark.xiaohongshu.com"; }
  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra });
  }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "xhs_shangjia"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "xhs_shangjia"}, cookie); return r?.cover || null; }
  buildPostData(t) {
    return { title: t.title || "", content: t.content || "", tags: t.tags || [] };
  }
  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post("https://ark.xiaohongshu.com/api/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "xhs_shangjia", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "xhs_shangjia" };
  }
}
module.exports = XhsShangjiaAdapter;