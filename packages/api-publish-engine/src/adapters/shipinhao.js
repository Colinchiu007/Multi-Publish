const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");
class ShipinhaoAdapter extends BasePlatformAdapter {
  constructor() { super("tencent_video"); this.apiBase = "https://channels.weixin.qq.com"; }
  getReferer() { return "https://channels.weixin.qq.com/platform/post/create"; }
  getOrigin() { return "https://channels.weixin.qq.com"; }
  getHeaders(cookie, extra) { return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra }); }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "tencent_video"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "tencent_video"}, cookie); return r?.cover || null; }
  buildPostData(td) { const ml = td.video_path ? [{ type: "video", path: td.video_path }] : []; return { title: td.title || "", content: td.content || "", mediaList: ml, tags: td.tags || [] }; }
  async publish(cookie, pd) {
    const h = this.getHeaders(cookie);
    const body = { title: pd.title, desc: pd.content, media_list: pd.mediaList, topic_list: pd.tags };
    const r = await this.http.post(this.apiBase + "/micro/content/cgi-bin/mmfinderassistant-bin/post/post_create", body, { headers: h });
    if (r.data?.base_resp?.errcode === 0 || r.data?.errcode === 0) return { success: true, platform: "tencent_video", publishId: r.data?.publish_id || r.data?.id };
    return { success: false, error: r.data?.base_resp?.errmsg || r.data?.errmsg || "Publish failed", platform: "tencent_video" };
  }
}
module.exports = ShipinhaoAdapter;
