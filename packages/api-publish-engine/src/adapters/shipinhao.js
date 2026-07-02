const { BasePlatformAdapter } = require("../base-adapter");

class ShipinhaoAdapter extends BasePlatformAdapter {
  constructor() {
    super("tencent_video");
    this.apiBase = "https://channels.weixin.qq.com";
  }
  getReferer() { return "https://channels.weixin.qq.com/platform/post/create"; }
  getOrigin() { return "https://channels.weixin.qq.com"; }

  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, {
      "Content-Type": "application/json",
      ...extra,
    });
  }

  async uploadVideo() { return null; }
  async uploadCover() { return null; }

  buildPostData(taskData) {
    // ????? XML ????
    const paras = (taskData.content || "").split("\n").filter(Boolean);
    const mediaList = taskData.video_path ? [{ type: "video", path: taskData.video_path }] : [];
    return { title: taskData.title || "", content: taskData.content || "", mediaList, tags: taskData.tags || [] };
  }

  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const body = {
      title: postData.title,
      desc: postData.content,
      media_list: postData.mediaList,
      topic_list: postData.tags,
    };
    const resp = await this.http.post(this.apiBase + "/micro/content/cgi-bin/mmfinderassistant-bin/post/post_create", body, { headers: h });
    if (resp.data?.base_resp?.errcode === 0 || resp.data?.errcode === 0) {
      return { success: true, platform: "tencent_video", publishId: resp.data?.publish_id || resp.data?.id };
    }
    return { success: false, error: resp.data?.base_resp?.errmsg || resp.data?.errmsg || "Publish failed", platform: "tencent_video" };
  }
}
module.exports = ShipinhaoAdapter;
