const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");

class AiqiyiAdapter extends BasePlatformAdapter {
  constructor() {
    super("aiqiyi");
    this.apiBase = "https://mp.iqiyi.com";
  }
  getReferer() { return "https://mp.iqiyi.com/wemedia/publish/video"; }
  getOrigin() { return "https://mp.iqiyi.com"; }
  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra });
  }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "aiqiyi"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "aiqiyi"}, cookie); return r?.cover || null; }
  buildPostData(t) {
    return { title: t.title || "", content: t.content || "", tags: t.tags || [] };
  }
  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post("https://mp.iqiyi.com/wemedia/video/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "aiqiyi", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "aiqiyi" };
  }
}
module.exports = AiqiyiAdapter;