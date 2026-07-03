const { BasePlatformAdapter } = require("../base-adapter");

class DuoDuoAdapter extends BasePlatformAdapter {
  constructor() {
    super("duoduo");
    this.apiBase = "https://live.pinduoduo.com";
  }
  getReferer() { return "https://live.pinduoduo.com"; }
  getOrigin() { return "https://live.pinduoduo.com"; }
  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra });
  }
  async uploadVideo() { return null; }
  async uploadCover() { return null; }
  buildPostData(t) {
    return { title: t.title || "", content: t.content || "", tags: t.tags || [] };
  }
  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post("https://live.pinduoduo.com/api/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "duoduo", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "duoduo" };
  }
}
module.exports = DuoDuoAdapter;