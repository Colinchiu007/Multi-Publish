const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");

class TengxunShipinAdapter extends BasePlatformAdapter {
  constructor() {
    super("tengxun_shipin");
    this.apiBase = "https://mp.v.qq.com";
  }
  getReferer() { return "https://mp.v.qq.com/publishVideo"; }
  getOrigin() { return "https://mp.v.qq.com"; }
  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra });
  }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "tengxun_shipin"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "tengxun_shipin"}, cookie); return r?.cover || null; }
  buildPostData(t) {
    return { title: t.title || "", content: t.content || "", tags: t.tags || [] };
  }
  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post("https://mp.v.qq.com/api/video/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "tengxun_shipin", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "tengxun_shipin" };
  }
}
module.exports = TengxunShipinAdapter;