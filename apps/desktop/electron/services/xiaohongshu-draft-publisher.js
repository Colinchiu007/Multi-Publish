// @ts-check
/**
 * XiaohongshuDraftPublisher —— 小红书「仅存平台草稿箱」发布轨（2026-10-09）
 *
 * ## 产品约束（用户明确要求，硬约束）
 * 小红书**不得真实发布**：该平台风控严格，自动化点「发布」按钮的风险由用户账号承担不起。
 * 内容只写进**小红书创作者中心草稿箱**，由用户在手机 App 上确认后自行发布。
 *
 * 因此本轨与 RPA 轨（`_publish_xiaohongshu` → `_publish_generic` 点发布按钮）的根本差别：
 * **永不点击平台「发布」按钮**，只调 API 且 `draft=true`。
 * ROUTE_TABLE 把 xiaohongshu 路由到这里；任何缺件都抛错——**绝不回落到 RPA 真实发布**。
 *
 * ## 采用的链
 * `@multi-publish/api-publish-engine/src/publish/platforms/xiaohongshu-draft`
 * 三步：GET permit（申请上传许可）→ PUT ros-upload（图片二进制）→ POST note（`draft=true` 存草稿）。
 * 与调试探针 `xiaohongshu:probe-draft-chain` 同一条链、同一套凭据口径；该链已真机验证
 * permit/upload 通过，note 的 406 根因（缺 `x-s-common`）已修（2026-10-09）。
 *
 * ## fail-closed 纪律（缺一即抛错，绝不静默降级）
 * 缺 Cookie / 缺 `a1`（签名必需）/ 缺 `access-token-creator.xiaohongshu.com`（Authorization AT）/
 * 无图片 / 标题为空 / 业务码非 0 / 平台未返回草稿标识 —— 一律抛错，由任务队列记失败。
 * **无图片是硬约束**：小红书不支持纯文字笔记，缺图必须如实报错，不得悄悄改走真实发布。
 */
const logger = require('./logger')

/** 与探针同源的真实 UA（平台对 UA 有会话一致性校验） */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

/** 发布链硬凭据（缺任一即 fail-closed；与 account-credential-diagnostics 的登记同源） */
const REQUIRED_COOKIE_MARKERS = ['a1', 'access-token-creator.xiaohongshu.com']
const AUTH_COOKIE_NAME = 'access-token-creator.xiaohongshu.com'

class XiaohongshuDraftPublisher {
  /**
   * @param {{platform: string, timeout?: number}} route
   * @param {object} deps
   * @param {object} deps.store 任务存储（参与账号解析）
   * @param {object} deps.accountManager 账号凭证（DPAPI 解密 + 分区 cookie 回退）
   * @param {Function} deps.buildArticle 文章装配（由 publisher-router 注入，避免循环 require）
   * @param {Function} deps.loadAuth 凭证装载（同上）
   */
  constructor (route, deps = {}) {
    this.route = route
    this.store = deps.store
    this.accountManager = deps.accountManager
    this.buildArticle = deps.buildArticle
    this.loadAuth = deps.loadAuth
    this.userAgent = deps.userAgent || DEFAULT_USER_AGENT
    // 依赖按需 require：单测可注入，避免加载即触碰网络/签名器
    this._createHttpClient = deps.createHttpClient || null
    this._loadChain = deps.loadChain || null
    this._loadSigner = deps.loadSigner || null
  }

  _httpClient (timeout) {
    if (this._createHttpClient) return this._createHttpClient({ timeout })
    const { createHttpClient } = require('@multi-publish/api-publish-engine/src/publish/core/http-base')
    return createHttpClient({ timeout })
  }

  _chainClass () {
    if (this._loadChain) return this._loadChain()
    return require('@multi-publish/api-publish-engine/src/publish/platforms/xiaohongshu-draft').XiaohongshuDraftChain
  }

  _signer () {
    if (this._loadSigner) return this._loadSigner()
    // 进程内 XYW_ 纯算法（不开窗、不触达活页）；装配失败即抛错，不退回占位签名
    return require('../signer/signer-assembly').signXiaohongshuLocal
  }

  /**
   * 收集可上传图片路径：显式图片 → 图片文件描述 → 封面。
   * 小红书草稿必须有图；顺序即发布顺序，去重保序。
   */
  collectImagePaths (article) {
    const paths = []
    const push = (value) => {
      const p = typeof value === 'string' ? value : (value && (value.path || value.filePath || value.file_path))
      if (typeof p === 'string' && p.trim()) paths.push(p.trim())
    }
    const source = article || {}
    for (const item of (Array.isArray(source.image_files) ? source.image_files : [])) push(item)
    for (const item of (Array.isArray(source.images) ? source.images : [])) push(item)
    push(source.cover_path)
    return [...new Set(paths)]
  }

  async publish (task, options = {}) {
    const platform = this.route.platform || 'xiaohongshu'
    const ownerSubject = task && task.owner_subject
    const article = typeof this.buildArticle === 'function'
      ? this.buildArticle(task, platform)
      : ((task && task.article) || {})

    const { accountId, authData } = await this.loadAuth(
      { store: this.store, accountManager: this.accountManager },
      platform, article, ownerSubject,
    )
    const cookies = Array.isArray(authData && authData.cookies) ? authData.cookies : []
    const cookieName = (c) => (c && typeof c.name === 'string' ? c.name : '')
    const cookieValue = (name) => {
      const hit = cookies.find((c) => cookieName(c) === name)
      return hit ? String(hit.value == null ? '' : hit.value) : ''
    }
    const cookieHeader = cookies
      .filter((c) => cookieName(c))
      .map((c) => cookieName(c) + '=' + (c.value == null ? '' : c.value))
      .join('; ')

    if (!cookieHeader) {
      throw new Error('小红书草稿：平台 Cookie 缺失（账号 ' + (accountId || '未指定') + ' 未登录或凭证不可用）')
    }
    const missing = REQUIRED_COOKIE_MARKERS.filter((marker) => !cookieValue(marker))
    if (missing.length > 0) {
      throw new Error('小红书草稿：缺发布链硬凭据 ' + missing.join('、'))
    }
    const authorization = cookieValue(AUTH_COOKIE_NAME)
    const title = String(article.title || '').trim()
    if (!title) throw new Error('小红书草稿：标题为空')
    const imagePaths = this.collectImagePaths(article)
    if (imagePaths.length === 0) {
      throw new Error('小红书草稿需要至少 1 张图片（小红书不支持纯文字笔记）：请在发布页选择图片或封面')
    }

    const signal = options && options.signal
    if (signal && signal.aborted) throw new Error('任务已取消')
    const onProgress = options && typeof options.onProgress === 'function' ? options.onProgress : null
    if (onProgress) onProgress(10, '准备小红书草稿')

    const ChainClass = this._chainClass()
    const chain = new ChainClass({
      http: this._httpClient(this.route.timeout || 180000),
      sign: (payload) => this._signer()(payload),
      userAgent: this.userAgent,
      logger,
    })

    const result = await chain.publishToDraft({
      title,
      content: article.content,
      images: imagePaths.map((path) => ({ path })),
      // 锁死 true：本轨的存在意义就是「不进公开发布流」，调用方无从覆盖
      draft: true,
      tags: Array.isArray(article.tags) ? article.tags : [],
      cookie: cookieHeader,
      authorization,
    })
    if (signal && signal.aborted) throw new Error('任务已取消')
    if (!result || result.success !== true) {
      throw new Error('小红书草稿：发布链未返回成功')
    }
    const draftId = String(result.draftId || result.noteId || '').trim()
    if (!draftId) {
      // 没有草稿标识 = 无法确认内容真的进了草稿箱，按失败处理（不虚报成功）
      throw new Error('小红书草稿：平台未返回草稿标识，无法确认已存入草稿箱')
    }
    if (onProgress) onProgress(100, '已存入小红书草稿箱')
    logger.notify('PublisherRouter', 'xhs-draft-saved', {
      params: { platform, accountId: accountId || '', draftId, imageCount: imagePaths.length },
    })
    return {
      success: true,
      platform,
      mode: 'xhs_draft',
      // draft 标记：记录/追踪据此把它当「草稿」而不是「已公开作品」（见 phase4-events）
      draft: true,
      postId: draftId,
      url: '',
    }
  }
}

module.exports = {
  XiaohongshuDraftPublisher,
  REQUIRED_COOKIE_MARKERS,
  DEFAULT_USER_AGENT,
}
