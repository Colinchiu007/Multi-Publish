const { BasePlatformAdapter } = require("../base-adapter");

class KuaishouAdapter extends BasePlatformAdapter {
  constructor() {
    super("kuaishou");
    this.apiBase = "https://cp.kuaishou.com";
  }
  getReferer() { return "https://cp.kuaishou.com/"; }
  getOrigin() { return "https://cp.kuaishou.com"; }

  getHeaders(cookie, extra) {
    const h = super.getHeaders(cookie, { "Content-Type": "application/json", ...extra });
    // extract api_ph from cookie for kuaishou
    const phMatch = cookie && cookie.match(/kuaishou\.web\.cp\.api_ph=([^;]+)/);
    if (phMatch) h["kuaishou.web.cp.api_ph"] = phMatch[1];
    return h;
  }

  async uploadVideo() { return null; }
  async uploadCover() { return null; }

  buildPostData(taskData) {
    return { title: taskData.title || "", content: taskData.content || "", tags: taskData.tags || [] };
  }

  async publish(cookie, postData) {
    const h = this.getHeaders(cookie);
    const resp = await this.http.post(this.apiBase + "/rest/cp/works/v2/video/pc/upload/finish", postData, { headers: h });
    if (resp.data?.result === 1 || resp.data?.code === 200) {
      return { success: true, platform: "kuaishou", publishId: resp.data?.id };
    }
    return { success: false, error: resp.data?.error_msg || resp.data?.msg || "Publish failed", platform: "kuaishou" };
  }
}
module.exports = KuaishouAdapter;
