const { BasePlatformAdapter } = require("../base-adapter");

class MeiPaiAdapter extends BasePlatformAdapter {
  constructor() {
    super("meipai");
    this.apiBase = "https://www.meipai.com";
  }
  getReferer() { return "https://www.meipai.com"; }
  getOrigin() { return "https://www.meipai.com"; }
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
    const resp = await this.http.post("https://www.meipai.com/api/video/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "meipai", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "meipai" };
  }
}
module.exports = MeiPaiAdapter;