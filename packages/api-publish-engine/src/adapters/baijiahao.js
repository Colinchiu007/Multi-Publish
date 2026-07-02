const { BasePlatformAdapter } = require("../base-adapter");
const qs = require("querystring");

class BaijiahaoAdapter extends BasePlatformAdapter {
  constructor() {
    super("baijiahao");
    this.apiBase = "https://baijiahao.baidu.com";
  }
  getReferer() { return "https://baijiahao.baidu.com/builder/rc/edit?type=0"; }
  getOrigin() { return "https://baijiahao.baidu.com"; }

  getHeaders(cookie, extra) {
    return super.getHeaders(cookie, {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      ...extra,
    });
  }

  async uploadVideo() { return null; }
  async uploadCover() { return null; }

  buildPostData(taskData) {
    return {
      title: taskData.title || "",
      content: taskData.content || "",
      tags: (taskData.tags || []).join(","),
      cover_url: taskData.cover || "",
      save_type: taskData.draft ? "draft" : "publish",
    };
  }

  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post(this.apiBase + "/builder/rc/publish", qs.stringify(postData), {
      headers: { ...h, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    });
    if (resp.data?.errno === 0 || resp.data?.status === 0 || resp.status === 200) {
      return { success: true, platform: "baijiahao", publishId: resp.data?.id || resp.data?.item_id };
    }
    return { success: false, error: resp.data?.errmsg || resp.data?.msg || "Publish failed", platform: "baijiahao" };
  }
}
module.exports = BaijiahaoAdapter;
