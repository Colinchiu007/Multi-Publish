const { BasePlatformAdapter } = require("../base-adapter");

class DayuAdapter extends BasePlatformAdapter {
  constructor() {
    super("dayu");
    this.apiBase = "https://mp.dayu.com";
  }
  getReferer() { return "https://mp.dayu.com/dashboard/video/write"; }
  getOrigin() { return "https://mp.dayu.com"; }
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
    const resp = await this.http.post("https://mp.dayu.com/api/video/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "dayu", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "dayu" };
  }
}
module.exports = DayuAdapter;