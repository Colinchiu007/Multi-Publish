const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");

class CheJiaHaoAdapter extends BasePlatformAdapter {
  constructor() {
    super("chejiahao");
    this.apiBase = "https://creator.autohome.com.cn";
  }
  getReferer() { return "https://creator.autohome.com.cn"; }
  getOrigin() { return "https://creator.autohome.com.cn"; }
  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra });
  }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "chejiahao"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "chejiahao"}, cookie); return r?.cover || null; }
  buildPostData(t) {
    return { title: t.title || "", content: t.content || "", tags: t.tags || [] };
  }
  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post("https://creator.autohome.com.cn/api/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.ret === 0)
      return { success: true, platform: "chejiahao", publishId: resp.data?.data?.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "chejiahao" };
  }
}
module.exports = CheJiaHaoAdapter;