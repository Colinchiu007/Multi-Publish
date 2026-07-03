const { BasePlatformAdapter } = require("../base-adapter");

class DeWuAdapter extends BasePlatformAdapter {
  constructor() {
    super("dewu");
    this.apiBase = "https://creator.dewu.com";
  }
  getReferer() { return "https://creator.dewu.com/release"; }
  getOrigin() { return "https://creator.dewu.com"; }
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
    const resp = await this.http.post("https://creator.dewu.com/api/release", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "dewu", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "dewu" };
  }
}
module.exports = DeWuAdapter;