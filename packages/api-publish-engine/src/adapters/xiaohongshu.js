// 小红书适配器 — 基于参考产品逆向分析 COS 上传协议
const { BasePlatformAdapter } = require("../base-adapter");
const { upload } = require("../../upload/orchestrator");
const { getXiaohongshuSign } = require("../signer-local");

class XiaohongshuAdapter extends BasePlatformAdapter {
  constructor() {
    super("xiaohongshu");
    this.apiBase = "https://creator.xiaohongshu.com";
  }
  getReferer() { return "https://creator.xiaohongshu.com/"; }
  getOrigin() { return "https://creator.xiaohongshu.com"; }

  async uploadVideo(td, cookie) {
    const r = await upload({ ...td, platform: "xiaohongshu" }, cookie);
    return r?.video || null;
  }
  async uploadCover(td, cookie) {
    const r = await upload({ ...td, platform: "xiaohongshu" }, cookie);
    return r?.cover || null;
  }

  buildPostData(taskData) {
    const data = {
      title: taskData.title || "",
      content: taskData.content || "",
      tags: taskData.tags || [],
      // 体裁判据必须用**权威形状** taskData.video.path（嵌套，见 publish/task-data.js），
      // 不能读扁平的 taskData.video_path——后者不在形状契约里，恒为 undefined，
      // 于是视频任务会被判成 dynamic 而静默发错体裁。
      // 当前 has_api=false / dom-only，API 轨不可达，故这是**埋雷而非在线故障**；
      // 但一旦有人给本适配器补 execute() 或翻 has_api 开关，立刻变成实故障。
      type: (taskData.video && taskData.video.path) ? "video" : "dynamic",
    };
    // P3-1：商品（参考产品映射 shopping_cart）
    if (Array.isArray(taskData.goods) && taskData.goods.length > 0) {
      data.shopping_cart = { items: taskData.goods.map(function (g) { return { item_id: g.id, name: g.title } }) }
    }
    return data
  }

  async publish(cookie, postData) {
    // 签名 bug 修复（2026-10-06）：getXiaohongshuSign 返回的是 { X-s, X-t } **对象**，
    // 旧实现把整个对象塞进 `params.sign`（axios 会把对象序列化成 [object Object]），
    // 而平台要求的 X-s / X-t 是两个**请求头**。两者都不是，于是这条链此前必然被拒。
    const sig = getXiaohongshuSign("/api/publish", postData) || {};
    const h = this.getHeaders(cookie, { "Content-Type": "application/json", "X-s": sig["X-s"], "X-t": sig["X-t"] });

    const resp = await this.http.post(this.apiBase + "/api/publish", postData, { headers: h });
    if (resp.data?.code === 0 || resp.data?.success) {
      return { success: true, platform: "xiaohongshu", publishId: resp.data?.data?.id || resp.data?.id };
    }
    return { success: false, error: resp.data?.msg || resp.data?.error_msg || "Publish failed", platform: "xiaohongshu" };
  }
}
module.exports = XiaohongshuAdapter;
