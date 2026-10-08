// @ts-check
/**
 * 小红书适配器 —— 草稿箱优先（2026-10-06 重写）
 *
 * 与旧版的三处关键差异（旧的 adapters/xiaohongshu.js 是从未跑通的占位）：
 *  1. 端点：旧的打 `/api/publish`（平台不存在该端点）；真实提交通道见
 *     platforms/xiaohongshu-draft.js（permit → ros-upload → web_api/sns/v2/note）。
 *  2. 签名结构：旧的 `params = { sign: {X-s, X-t} }` 塞进 query，会被序列化成 `sign=[object Object]`
 *     `sign=[object Object]`；现改为独立 header（x-s / x-t / x-s-common / traceid）。
 *  3. 草稿语义：默认 draft=true（落创作者中心草稿箱，不公开发布）。
 *
 * 签名来源：signer-assembly 的 'xiaohongshu.x-s-browser'（localAlgorithm 形态，
 * 进程内 XYW_ 纯算法，不创建隐藏浏览器窗口）。
 */
const { BasePlatformAdapter } = require("../base-adapter")
const { XiaohongshuDraftChain } = require("../publish/platforms/xiaohongshu-draft")

class XiaohongshuAdapter extends BasePlatformAdapter {
  constructor () {
    super("xiaohongshu")
    this.apiBase = "https://edith.xiaohongshu.com"
  }

  getReferer () { return "https://creator.xiaohongshu.com/" }
  getOrigin () { return "https://creator.xiaohongshu.com" }

  /**
   * 平台正文只取 desc；标签走 tag_list（与 xiaohongshu-draft 一致）。
   * @param {object} taskData
   */
  buildPostData (taskData) {
    return {
      title: String(taskData.title || ""),
      content: String(taskData.content == null ? "" : taskData.content),
      tags: Array.isArray(taskData.tags) ? taskData.tags : [],
      images: Array.isArray(taskData.images) ? taskData.images : [],
      cover: taskData.cover || "",
      draft: taskData.draft !== false,
    }
  }

  /**
   * 发布到小红书（默认草稿箱）。
   *
   * @param {string} cookie Cookie 头串或字典（必须含 a1）
   * @param {object} postData buildPostData 产物
   * @param {{authorization?: string, sign?: Function}} [opts]
   */
  async publish (cookie, postData, opts = {}) {
    const authorization = opts.authorization || this._authorization(cookie)
    if (!authorization) {
      // fail-closed：没有 AT token 就不发（旧的实现在这里会带着占位签名硬发）
      throw new Error("xiaohongshu: 缺少 Authorization（access-token-creator.xiaohongshu.com）")
    }
    const sign = opts.sign || this._signFn()
    if (typeof sign !== "function") {
      throw new Error("xiaohongshu: 签名器不可用（fail-closed，拒绝使用占位签名）")
    }

    const chain = new XiaohongshuDraftChain({
      http: this.http,
      sign,
      userAgent: this.userAgent,
    })

    const images = (postData.images || []).map((it) =>
      typeof it === "string" ? { path: it } : { path: it && (it.path || it.file || it.url) }
    ).filter((it) => it && it.path && !/^https?:/i.test(it.path))

    if (images.length === 0) {
      throw new Error("xiaohongshu: 至少需要 1 张本地图片（平台不支持纯文字笔记）")
    }

    const result = await chain.publishToDraft({
      title: postData.title,
      content: postData.content,
      images,
      draft: postData.draft,
      tags: postData.tags,
      cookie,
      authorization,
    })

    return {
      success: true,
      platform: "xiaohongshu",
      draft: result.draft,
      publishId: result.noteId || result.draftId || "",
      noteId: result.noteId,
      draftId: result.draftId,
    }
  }

  /**
   * 视频上传占位：统一入口契约要求所有 adapter 对空输入返回 null
   * （adapters-interface.test.js 的「可处理空上传」用例逐平台遍历）。
   * 小红书走草稿箱图文链路（permit → ros-upload → note），不暴露独立 video 上传。
   */
  async uploadVideo () {
    return null
  }

  /** 图片上传占位：同上，小红书图片经 permit/ros-upload 在草稿箱链路内完成 */
  async uploadCover () {
    return null
  }

  /** 从 cookie 里找 access-token-creator.xiaohongshu.com 作为 AT 凭据 */
  _authorization (cookie) {
    const read = (name) => {
      if (!cookie) return ""
      if (typeof cookie === "object") return typeof cookie[name] === "string" ? cookie[name] : ""
      for (const part of String(cookie).split(";")) {
        const t = part.trim()
        const eq = t.indexOf("=")
        if (eq > 0 && t.slice(0, eq).trim() === name) return t.slice(eq + 1).trim()
      }
      return ""
    }
    const at = read("access-token-creator.xiaohongshu.com")
    return at ? `AT ${at}` : ""
  }

  /** 取 signer 桥（由 main 进程 registerSignerAssembly 注入） */
  _signFn () {
    return global.__xhsSignFn || null
  }
}

module.exports = XiaohongshuAdapter
module.exports.XiaohongshuAdapter = XiaohongshuAdapter
module.exports._authorizationFromCookie = XiaohongshuAdapter.prototype._authorization