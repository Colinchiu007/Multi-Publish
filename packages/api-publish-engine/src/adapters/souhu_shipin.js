const { BasePlatformAdapter } = require("../base-adapter");

class SouhuShipinAdapter extends BasePlatformAdapter {
  constructor() {
    super("souhu_shipin");
    this.apiBase = "https://tv.sohu.com";
  }
  getReferer() { return "https://tv.sohu.com"; }
  getOrigin() { return "https://tv.sohu.com"; }
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
    const resp = await this.http.post("https://tv.sohu.com/api/video/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "souhu_shipin", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "souhu_shipin" };
  }
}
module.exports = SouhuShipinAdapter;