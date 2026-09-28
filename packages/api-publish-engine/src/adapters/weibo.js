const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");

class WeiboAdapter extends BasePlatformAdapter {
  constructor() {
    super("weibo");
    this.apiBase = "https://weibo.com";
  }
  getReferer() { return "https://weibo.com/upload/channel"; }
  getOrigin() { return "https://weibo.com"; }
  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, { "Content-Type": "application/x-www-form-urlencoded", ...extra });
  }
  async uploadVideo(td, cookie) { const r = await upload({...td, platform: "weibo"}, cookie); return r?.video || null; }
  async uploadCover(td, cookie) { const r = await upload({...td, platform: "weibo"}, cookie); return r?.cover || null; }
  buildPostData(t) {
    // 微博是无标题平台（openspec/changes/publish-capability-registry）：发布面
    // 只有正文字段，发布页填写的标题必须作为正文首行插入（与 DOM RPA
    // _composeEditorCaption / 快手链 caption 语义对齐），否则标题被丢弃。
    const title = typeof t.title === "string" ? t.title.trim() : "";
    const content = t.content == null ? "" : String(t.content).trim();
    const composed = [title, content].filter(part => part.length > 0).join("\n");
    return { title: t.title || "", content: composed, tags: (t.tags||[]).join(",") };
  }
  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post(this.apiBase + "/aj/v6/upload/upload_video", postData, { headers: h });
    if (resp.data?.code === 100000) return { success: true, platform: "weibo", publishId: resp.data?.data?.mid };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "weibo" };
  }
}
module.exports = WeiboAdapter;
