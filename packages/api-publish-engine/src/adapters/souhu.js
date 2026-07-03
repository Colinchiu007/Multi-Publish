const { BasePlatformAdapter } = require("../base-adapter");

class SouhuAdapter extends BasePlatformAdapter {
  constructor() {
    super("souhu");
    this.apiBase = "https://mp.sohu.com";
  }
  getReferer() { return "https://mp.sohu.com/mpfe/v4/contentManagement"; }
  getOrigin() { return "https://mp.sohu.com"; }
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
    const resp = await this.http.post("https://mp.sohu.com/api/content/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "souhu", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "souhu" };
  }
}
module.exports = SouhuAdapter;