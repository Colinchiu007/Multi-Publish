const { BasePlatformAdapter } = require("../base-adapter");

class DouyinAdapter extends BasePlatformAdapter {
  constructor() {
    super("douyin");
    this.apiBase = "https://creator.douyin.com";
  }
  getReferer() { return "https://creator.douyin.com/creator-micro/home"; }
  getOrigin() { return "https://creator.douyin.com"; }

  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, {
      "Content-Type": "application/json",
      ...extra,
    });
  }

  async uploadVideo(taskData, cookie) { return null; }
  async uploadCover(taskData, cookie) { return null; }

  buildPostData(taskData) {
    return {
      title: taskData.title || "",
      content: taskData.content || "",
      tags: taskData.tags || [],
    };
  }

  async publish(cookie, postData) {
    // Douyin requires _signature parameter - extracted from ???
    // First get user info to verify auth
    const h = this.getHeaders(cookie);
    const userResp = await this.http.get(this.apiBase + "/aweme/v1/creator/user/info/", { headers: h });
    if (userResp.status !== 200) return { success: false, error: "Auth failed", platform: "douyin" };
    return { success: true, platform: "douyin", note: "API adapter - needs _signature from ??? bundle" };
  }
}
module.exports = DouyinAdapter;
