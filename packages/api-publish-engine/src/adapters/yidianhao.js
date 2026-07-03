const { BasePlatformAdapter } = require("../base-adapter");

class YiDianHaoAdapter extends BasePlatformAdapter {
  constructor() {
    super("yidianhao");
    this.apiBase = "https://mp.yidianzixun.com";
  }
  getReferer() { return "https://mp.yidianzixun.com"; }
  getOrigin() { return "https://mp.yidianzixun.com"; }
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
    const resp = await this.http.post("https://mp.yidianzixun.com/api/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "yidianhao", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "yidianhao" };
  }
}
module.exports = YiDianHaoAdapter;