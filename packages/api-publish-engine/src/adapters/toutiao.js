// 头条号适配器 — 基于参考产品逆向分析
const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");
// 话题内联描述（publish-topic-inline-description）：头条是独立字段型平台——
// 话题从描述剥离进 tags 字段，剥离用 content-formatter 单一实现
const { stripTopicsFromContent } = require("../content-formatter");

class ToutiaoAdapter extends BasePlatformAdapter {
  constructor() {
    super("toutiao");
    this.apiBase = "https://mp.toutiao.com";
  }
  getReferer() { return "https://mp.toutiao.com/profile_v4/"; }
  getOrigin() { return "https://mp.toutiao.com"; }

  async uploadVideo(td, cookie) {
    const r = await upload({ ...td, platform: "toutiao" }, cookie);
    return r?.video || null;
  }
  async uploadCover(td, cookie) {
    const r = await upload({ ...td, platform: "toutiao" }, cookie);
    return r?.cover || null;
  }

  buildPostData(taskData) {
    // 话题内联描述：描述里已知话题剥离（头条话题走 tags 字段，正文不重复携带）
    const stripped = stripTopicsFromContent(taskData.content || "", taskData.tags || []);
    return {
      title: taskData.title || "",
      content: stripped.content,
      tags: taskData.tags || [],
      cover_type: taskData.cover_path ? 1 : 0,
    };
  }

  async publish(cookie, postData) {
    const h = this.getHeaders(cookie, { "Content-Type": "application/json" });
    const resp = await this.http.post(this.apiBase + "/api/article/publish", postData, { headers: h });
    if (resp.data?.data?.article_id || resp.data?.code === 0) {
      return { success: true, platform: "toutiao", publishId: resp.data?.data?.article_id };
    }
    return { success: false, error: resp.data?.message || "Publish failed", platform: "toutiao" };
  }
}
module.exports = ToutiaoAdapter;
