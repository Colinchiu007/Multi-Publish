const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");

class WangyiAdapter extends BasePlatformAdapter {
  constructor() {
    super("wangyi");
    this.apiBase = "https://mp.163.com";
  }
  getReferer() { return "https://mp.163.com/subscribe_v4"; }
  getOrigin() { return "https://mp.163.com"; }
  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra });
  }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "wangyi"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "wangyi"}, cookie); return r?.cover || null; }
  buildPostData(t) {
    return { title: t.title || "", content: t.content || "", tags: t.tags || [] };
  }
  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post("https://mp.163.com/api/video/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "wangyi", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "wangyi" };
  }
}
module.exports = WangyiAdapter;