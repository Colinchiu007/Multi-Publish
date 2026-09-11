// 哔哩哔哩适配器 — 基于蚁小二逆向工程
const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");

class BilibiliAdapter extends BasePlatformAdapter {
  constructor() {
    super("bilibili");
    this.apiBase = "https://member.bilibili.com";
  }
  getReferer() { return "https://member.bilibili.com/platform/upload/video/frame"; }
  getOrigin() { return "https://member.bilibili.com"; }

  async uploadVideo(td, cookie) {
    const r = await upload({ ...td, platform: "bilibili" }, cookie);
    return r?.video || null;
  }
  async uploadCover(td, cookie) {
    const r = await upload({ ...td, platform: "bilibili" }, cookie);
    return r?.cover || null;
  }

  buildPostData(taskData) {
    return {
      title: taskData.title || "",
      desc: taskData.content || "",
      tag: (taskData.tags || []).join(","),
      copyright: taskData.copyright || 2,
      tid: taskData.category || 17,
    };
  }

  async publish(cookie, postData) {
    const h = this.getHeaders(cookie, { "Content-Type": "application/x-www-form-urlencoded" });
    const params = new URLSearchParams(postData);
    const resp = await this.http.post(this.apiBase + "/x/vu/client/web/add-archive", params.toString(), { headers: h });
    if (resp.data?.code === 0 || resp.data?.data?.aid) {
      return { success: true, platform: "bilibili", publishId: resp.data?.data?.aid };
    }
    return { success: false, error: resp.data?.message || "Publish failed", platform: "bilibili" };
  }
}
module.exports = BilibiliAdapter;
