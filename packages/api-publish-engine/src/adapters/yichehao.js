const { BasePlatformAdapter } = require("../base-adapter");

class YiCheHaoAdapter extends BasePlatformAdapter {
  constructor() {
    super("yichehao");
    this.apiBase = "https://baa.yiche.com";
  }
  getReferer() { return "https://baa.yiche.com"; }
  getOrigin() { return "https://baa.yiche.com"; }
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
    const resp = await this.http.post("https://baa.yiche.com/api/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "yichehao", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "yichehao" };
  }
}
module.exports = YiCheHaoAdapter;