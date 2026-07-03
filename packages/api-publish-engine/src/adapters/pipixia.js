const { BasePlatformAdapter } = require("../base-adapter");

class PiPiXiaAdapter extends BasePlatformAdapter {
  constructor() {
    super("pipixia");
    this.apiBase = "https://pipix.com";
  }
  getReferer() { return "https://pipix.com/mp/upload"; }
  getOrigin() { return "https://pipix.com"; }
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
    const resp = await this.http.post("https://pipix.com/api/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "pipixia", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "pipixia" };
  }
}
module.exports = PiPiXiaAdapter;