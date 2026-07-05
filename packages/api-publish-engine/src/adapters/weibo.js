const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");

class WeiboAdapter extends BasePlatformAdapter {
  constructor() {
    super("weibo");
    this.apiBase = "https://weibo.com";
  }
  getReferer() { return "https://weibo.com/upload/channel"; }
  getOrigin() { return "https://weibo.com"; }
  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": "application/x-www-form-urlencoded", ...extra });
  }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "weibo"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "weibo"}, cookie); return r?.cover || null; }
  buildPostData(t) {
    return { title: t.title || "", content: t.content || "", tags: (t.tags||[]).join(",") };
  }
  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post(this.apiBase + "/aj/v6/upload/upload_video", postData, { headers: h });
    if (resp.data?.code === 100000) return { success: true, platform: "weibo", publishId: resp.data?.data?.mid };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "weibo" };
  }
}
module.exports = WeiboAdapter;
