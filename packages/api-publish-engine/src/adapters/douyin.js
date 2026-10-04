// 抖音视频发布适配器（W2 §4.1/§4.4：变薄委托新链 DouyinVideoChain）
// 外部接口不变（constructor 'douyin'、getReferer/getOrigin/getHeaders、execute），
// HTTP/CDN/vod-imagex 上传/签名单一事实源在 src/publish/platforms/douyin-video.js。
// 旧 `web/api/media/aweme/post` 发布链与远程 `_signature` 消费点整体下线（W2 §4.2）。
// 合规：只直连 creator.douyin.com 官方域名；clientSign 进程内本地签名，无任何远程签名通道。
const { BasePlatformAdapter } = require("../base-adapter");
const { HttpConfig } = require("../base-adapter");
const { formatContent } = require("../content-formatter");
const { errorCode } = require("../error-codes");
const logger = require("../logger");
const { DouyinVideoChain } = require("../publish/platforms/douyin-video");
const { DouyinImageChain } = require("../publish/platforms/douyin-image");

const UA = HttpConfig.userAgent;

class DouyinAdapter extends BasePlatformAdapter {
  constructor() {
    super("douyin");
    this.apiBase = "https://creator.douyin.com";
  }
  getReferer() { return "https://creator.douyin.com/creator-micro/content/upload"; }
  getOrigin() { return "https://creator.douyin.com"; }
  getHeaders(cookie, extra) { return super.getHeaders(cookie, { "Content-Type": "application/json", ...extra }); }

  // 抖音为单体链发布（execute → chain.run 内部编排 csrf→auth→upload→cover→create_v2），
  // 故 granular 步骤不作为独立发布路径；仅满足统一入口（upload-orchestrator）契约：空任务返回 null、零请求。
  async uploadVideo(taskData) {
    if (!taskData || !taskData.video || !taskData.video.path) return null;
    return null;
  }
  async uploadCover() { return null; }

  // 构造委托链；测试可注入 _chainOverride（假链）或 clients（四类 base）覆盖，零外发。
  _chain(cookie, clients) {
    if (this._chainOverride) return this._chainOverride;
    return new DouyinVideoChain(Object.assign({ cookie, userAgent: this._ua || UA }, clients || {}));
  }

  // D 方案（publish-throughput-optimization）：图文链构造；_imageChainOverride 供测试注入假链。
  _imageChain(cookie, clients) {
    if (this._imageChainOverride) return this._imageChainOverride;
    return new DouyinImageChain(Object.assign({ cookie, userAgent: this._ua || UA }, clients || {}));
  }

  // buildPostData 委托链模块纯函数（供薄适配器/服务层复用，非主发布路径必经）。
  buildPostData(taskData, uploadResult) {
    return this._chain().buildPostData(taskData, {
      videoId: (uploadResult && uploadResult.video && uploadResult.video.videoId) || "",
      coverPoster: (uploadResult && uploadResult.cover && uploadResult.cover.poster) || "",
      visibilityType: Number(taskData && taskData.visibility_type != null ? taskData.visibility_type : 0),
    });
  }

  // 抖音链为单体 run()（csrf→auth→upload→cover→create_v2 内部编排），
  // 故 override execute 直接委托链，保留 base 的 dryRun/错误归一契约。
  // D 方案：图文任务（images 非空且无 video）走 DouyinImageChain；视频任务走原视频链；
  // 两者皆缺 fail-closed（错误信息显式列出两种可接受的媒体形状）。
  async execute(taskData, cookie, opts) {
    opts = opts || {};
    if (opts.dryRun) return { success: true, dryRun: true, platform: "douyin" };
    if (!cookie) return { success: false, error: "douyin: 账号信息缺失，请重新授权此账号再试", code: errorCode.data_error, platform: "douyin" };
    const hasVideo = Boolean(taskData && taskData.video && taskData.video.path);
    const hasImages = Boolean(taskData && Array.isArray(taskData.images) && taskData.images.length > 0);
    if (!hasVideo && !hasImages) {
      return { success: false, error: "douyin: taskData requires images or video.path", code: errorCode.data_error, platform: "douyin" };
    }
    const td = formatContent(this.name, taskData);
    try {
      if (hasImages && !hasVideo) {
        // 图文 API 链：API 失败由上层（rpa-view-manager fallback）自动回退 RPA 图文链
        const chain = this._imageChain(cookie, opts.clients);
        const r = await chain.run(td, opts);
        if (r && typeof r === "object" && !r.platform) r.platform = "douyin";
        if (r && !r.success && r.code === undefined) r.code = errorCode.request_error;
        if (r && r.success && r.code === undefined) r.code = errorCode.success;
        return r;
      }
      const chain = this._chain(cookie, opts.clients);
      const r = await chain.run(td, opts);
      if (r && typeof r === "object" && !r.platform) r.platform = "douyin";
      if (r && !r.success && r.code === undefined) r.code = errorCode.request_error;
      if (r && r.success && r.code === undefined) r.code = errorCode.success;
      return r;
    } catch (err) {
      // fail-closed（签名材料缺失/文件不存在）在此透传，链已保证零网络请求
      logger.error("adapter:douyin", "execute failed", {
        error: err.message, code: err.code || errorCode.unknown_error,
        stack: String(err.stack || "").split("\n").slice(0, 3).join(" <- "),
      });
      return { success: false, error: err.message, code: err.code || errorCode.unknown_error, platform: "douyin", risk_blocked: !!err.risk_blocked };
    }
  }
}
module.exports = DouyinAdapter;
