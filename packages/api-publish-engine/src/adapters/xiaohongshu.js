const { BasePlatformAdapter } = require("../base-adapter");

class XiaohongshuAdapter extends BasePlatformAdapter {
  constructor() {
    super("xiaohongshu");
    this.apiBase = "https://creator.xiaohongshu.com";
  }
  getReferer() { return "https://creator.xiaohongshu.com/"; }
  getOrigin() { return "https://creator.xiaohongshu.com"; }

  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, {
      "Content-Type": "application/json;charset=UTF-8",
      ...extra,
    });
  }

  async uploadVideo() { return null; }
  async uploadCover() { return null; }

  buildPostData(taskData) {
    return { title: taskData.title || "", content: taskData.content || "", tags: taskData.tags || [] };
  }

  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post(this.apiBase + "/api/v1/publish", postData, { headers: h });
    if (resp.data?.success) return { success: true, platform: "xiaohongshu", publishId: resp.data.id };
    return { success: false, error: resp.data?.msg || "Publish failed", platform: "xiaohongshu" };
  }
}
module.exports = XiaohongshuAdapter;
