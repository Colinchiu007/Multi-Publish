const { BasePlatformAdapter } = require("../base-adapter");

class MeiYouAdapter extends BasePlatformAdapter {
  constructor() {
    super("meiyou");
    this.apiBase = "https://mp.meiyou.com";
  }
  getReferer() { return "https://mp.meiyou.com"; }
  getOrigin() { return "https://mp.meiyou.com"; }
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
    const resp = await this.http.post("https://mp.meiyou.com/api/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "meiyou", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "meiyou" };
  }
}
module.exports = MeiYouAdapter;