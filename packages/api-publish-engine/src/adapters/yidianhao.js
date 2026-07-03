const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");
class YiDianHaoAdapter extends BasePlatformAdapter {
  constructor() { super("yidianhao"); this.apiBase = "https://mp.yidianzixun.com"; }
  getReferer() { return "https://mp.yidianzixun.com"; }
  getOrigin() { return "https://mp.yidianzixun.com"; }
  getHeaders(cookie, extra) { return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra }); }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "yidianhao"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "yidianhao"}, cookie); return r?.cover || null; }
  buildPostData(t) { return { title: t.title || "", content: t.content || "", tags: t.tags || [] }; }
  async publish(cookie, pd) {
    const h = this.getHeaders(cookie);
    const r = await this.http.post("https://mp.yidianzixun.com/api/publish", pd, { headers: h });
    if (r.data?.code === 0 || r.data?.ret === 0) return { success: true, platform: "yidianhao", publishId: r.data?.data?.id };
    return { success: false, error: r.data?.msg || "Publish failed", platform: "yidianhao" };
  }
}
module.exports = YiDianHaoAdapter;
