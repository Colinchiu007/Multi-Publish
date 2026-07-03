const { BasePlatformAdapter } = require("../base-adapter");

class WeiShiAdapter extends BasePlatformAdapter {
  constructor() {
    super("weishi");
    this.apiBase = "https://media.weishi.qq.com";
  }
  getReferer() { return "https://media.weishi.qq.com"; }
  getOrigin() { return "https://media.weishi.qq.com"; }
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
    const resp = await this.http.post("https://media.weishi.qq.com/api/video/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "weishi", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "weishi" };
  }
}
module.exports = WeiShiAdapter;