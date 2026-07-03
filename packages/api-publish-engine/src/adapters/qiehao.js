const { BasePlatformAdapter } = require("../base-adapter");

class QiehaoAdapter extends BasePlatformAdapter {
  constructor() {
    super("qiehao");
    this.apiBase = "https://om.qq.com";
  }
  getReferer() { return "https://om.qq.com/main/creation/video"; }
  getOrigin() { return "https://om.qq.com"; }
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
    const resp = await this.http.post("https://om.qq.com/api/video/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "qiehao", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "qiehao" };
  }
}
module.exports = QiehaoAdapter;