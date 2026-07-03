const { BasePlatformAdapter } = require("../base-adapter");

class AcFunAdapter extends BasePlatformAdapter {
  constructor() {
    super("acfun");
    this.apiBase = "https://member.acfun.cn";
  }
  getReferer() { return "https://member.acfun.cn"; }
  getOrigin() { return "https://member.acfun.cn"; }
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
    const resp = await this.http.post("https://member.acfun.cn/api/video/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "acfun", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "acfun" };
  }
}
module.exports = AcFunAdapter;