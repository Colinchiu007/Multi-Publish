const { BasePlatformAdapter } = require("../base-adapter");

class BilibiliAdapter extends BasePlatformAdapter {
  constructor() {
    super("bilibili");
    this.apiBase = "https://member.bilibili.com";
  }
  getReferer() { return "https://member.bilibili.com/platform/upload/video/frame"; }
  getOrigin() { return "https://member.bilibili.com"; }
  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra });
  }
  async uploadVideo() { return null; }
  async uploadCover() { return null; }
  buildPostData(t) {
    return { title: t.title || "", content: t.content || "", tags: t.tags || [], cover: t.cover || "" };
  }
  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post(this.apiBase + "/api/v1/video/archive/", postData, { headers: h });
    if (resp.data?.code === 0) return { success: true, platform: "bilibili", publishId: resp.data?.data?.aid };
    return { success: false, error: resp.data?.message || "Publish failed", platform: "bilibili" };
  }
}
module.exports = BilibiliAdapter;