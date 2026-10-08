// @ts-check
/**
 * xiaohongshu:probe-draft-chain —— 在**主进程内**实跑小红书 API 草稿链的验证通道（2026-10-07）
 *
 * ## 为什么需要它
 *
 * `ROUTE_TABLE` 把 xiaohongshu 硬编码为 `mode:'rpa_vm'`（publisher-router.js:44），
 * 而 `ApiPublisher` 只在 `mode==='api'` 时实例化 ⇒ 已实现的 API 草稿三步链
 * （permit → ros-upload PUT → web_api/sns/v2/note）**从未被执行过一行**。
 * 想知道「API 链今天还能不能用」，只能真正跑一次。
 *
 * 跑不了的原因：cookie 用 AES-256-GCM 加密、主密钥经 DPAPI 封装（进程外解不开），
 * Chromium 分区 Cookie 库被运行中应用独占锁（只读也 EBUSY）。
 * ⇒ 必须在主进程内跑，而主进程只能从渲染侧经 IPC 触达。
 *
 * ## 安全边界（改这个文件前必须先读）
 *
 * 本通道会**解密并使用**真实凭据去调用平台 API，因此：
 *   - **永不回传任何 cookie value** —— 响应里只有 `cookieNames`（名字），
 *     与既有 `account:credential-names` 的边界一致。
 *   - **不回传 Authorization / AT token** —— 只回报 `hasAuthorization: boolean`。
 *   - 平台响应体**只回传业务码与 message**（`code` / `msg` 字段），
 *     不回传可能含账号信息的完整 body。
 *   - 走 withSenderCheck，与同目录其它账号接口同一套授权面。
 *   - platform / accountId 走与 account.js 同一份正则校验，不接受任意路径。
 *   - **默认 draft:true** —— 落创作者中心草稿箱，不公开发布。
 *   - 通道名带 `probe-` 前缀并在本文件顶部标注用途，便于后续审计与收敛。
 *
 * ## 它验证什么 / 不验证什么
 *
 * 验证：端点是否仍可用、签名是否被接受、AT 是否有效、图文草稿能否落库。
 * **不验证视频**：API 链无视频实现（见 xiaohongshu-draft.js 只导出 publishToDraft），
 * 故本通道无法回答「API 能否完全替代 DOM」——那还取决于视频模态。
 */

const REQUIRED_COOKIE_MARKERS = ['a1', 'access-token-creator.xiaohongshu.com']

/** 平台响应里允许回传的字段（白名单，其余一律丢弃） */
/**
 * 从 axios 错误里取失败端点（脱敏：只留 origin + path，丢掉 query）。
 *
 * 为什么必须脱敏：端点 URL 的 query 可能带 token / traceid 之类参数，
 * 原样回传等于把请求侧的敏感信息带出主进程。
 */
function extractFailedEndpoint (err) {
  const raw = err && err.config && err.config.url
  if (!raw) return ''
  try {
    const u = new URL(String(raw))
    return u.origin + u.pathname
  } catch (_) {
    // 相对 URL 或非标准形态：只截断到第一个 ?，不做解析
    return String(raw).split('?')[0]
  }
}
function pickSafeResponseFields (payload) {
  if (!payload || typeof payload !== 'object') return null
  const out = {}
  // 平台业务码：不同接口叫法不同，逐个取
  for (const key of ['code', 'status', 'errno', 'err_no', 'error_code']) {
    if (payload[key] !== undefined && payload[key] !== null) out[key] = payload[key]
  }
  // 消息字段：截断，避免带出账号/路径等不该回传的内容
  for (const key of ['msg', 'message', 'errmsg', 'err_msg', 'desc']) {
    const v = payload[key]
    if (typeof v === 'string' && v) out[key] = v.slice(0, 200)
  }
  // 成功时的作品标识：note_id / draft_id 是发布产物标识，不是凭据
  for (const key of ['note_id', 'draft_id']) {
    if (typeof payload[key] === 'string' && payload[key]) out[key] = payload[key].slice(0, 64)
  }
  return Object.keys(out).length ? out : null
}

function registerXiaohongshuDraftProbe ({ deps, withSenderCheck, EC, ipcLog, ipcMain }) {
  const { AccountManager } = deps

  // 复用 account.js 的账号标识校验，避免第二份实现（与 credential-diagnostics 同款）
  const isSafe = (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]+$/.test(v)

  ipcMain.handle('xiaohongshu:probe-draft-chain', withSenderCheck(async (event, arg) => {
    const accountId = arg && arg.accountId
    const article = (arg && arg.article) || {}
    // 图片路径必须由调用方给定（本地路径），不做路径拼接推导之外的处理
    const images = Array.isArray(arg && arg.images) ? arg.images : []

    if (!isSafe(accountId)) {
      return { code: EC.VALIDATION_ERROR, message: 'accountId 非法', data: { stage: 'validate' } }
    }
    // 调试通道只走草稿：draft 锁死 true，调用方传 draft:false 一律忽略（公开发布走产品正式发布通道）
    const draft = true

    // ── 阶段 1：解密凭据（只在主进程内，DPAPI 可用）──
    let cookies
    try {
      const saved = AccountManager.loadSavedCredentials(accountId, 'xiaohongshu')
      cookies = (saved && Array.isArray(saved.cookies)) ? saved.cookies : []
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      ipcLog('warn', 'xiaohongshu:probe-draft-chain', 'load-failed', `accountId=${accountId} message=${msg}`)
      return {
        code: EC.REQUEST_ERROR, message: '凭证读取失败（见日志）',
        data: { stage: 'load-credentials', readable: false },
      }
    }

    const names = cookies.map((c) => c && c.name).filter((n) => typeof n === 'string' && n)
    const missing = REQUIRED_COOKIE_MARKERS.filter((m) => !names.includes(m))
    // cookie 头串只在主进程内拼接使用，绝不回传
    const cookie = cookies.map((c) => c.name + '=' + c.value).join('; ')
    const authorizationCookie = cookies.find((c) => c && c.name === 'access-token-creator.xiaohongshu.com')
    const authorization = authorizationCookie ? String(authorizationCookie.value || '') : ''

    if (missing.length) {
      return {
        code: EC.VALIDATION_ERROR,
        message: '缺发布链硬凭据: ' + missing.join(','),
        data: {
          stage: 'credentials', cookieNames: names.sort(),
          missing, hasAuthorization: Boolean(authorization),
        },
      }
    }

    // ── 阶段 2：实跑三步链 ──
    // 签名器：进程内 XYW_ 纯算法（不开窗、不触达活页）
    let signer
    try {
      const { signXiaohongshuLocal } = require('../signer/signer-assembly')
      signer = (payload) => signXiaohongshuLocal(payload)
    } catch (e) {
      return {
        code: EC.REQUEST_ERROR, message: '签名器装配失败: ' + (e instanceof Error ? e.message : String(e)),
        data: { stage: 'signer-load' },
      }
    }

    const { XiaohongshuDraftChain } = require('@multi-publish/api-publish-engine/src/publish/platforms/xiaohongshu-draft')
    // http 必须是 axios 形状的客户端（.request({method,url,headers,data}) => {data}），
    // 链的构造器会校验 typeof http.request === "function"；注入裸 fetch 会在构造期抛
    // XHS_MISSING_DEPS，把「验证端点」变成「验证注入契约」。
    const { createHttpClient } = require('@multi-publish/api-publish-engine/src/publish/core/http-base')
    const chain = new XiaohongshuDraftChain({
      http: createHttpClient({ timeout: 30000 }),
      sign: signer,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    })

    try {
      const result = await chain.publishToDraft({
        title: article.title,
        content: article.content,
        images: images.map((p) => ({ path: p })),
        draft,
        tags: Array.isArray(article.tags) ? article.tags : [],
        cookie,
        authorization,
      })
      ipcLog('info', 'xiaohongshu:probe-draft-chain', 'ok', `accountId=${accountId} draft=${draft}`)
      return {
        code: 0,
        data: {
          stage: 'publish',
          success: true,
          draft: result.draft,
          // 作品标识是发布产物，不是凭据，可安全回传
          noteId: result.noteId || '',
          draftId: result.draftId || '',
          cookieNames: names.sort(),
          hasAuthorization: true,
        },
      }
    } catch (e) {
      // 业务失败要如实分类：能拿到平台业务码就带出来，这是判断「端点是否变了」的关键证据
      const err = e instanceof Error ? e : new Error(String(e))
      // axios 把响应体放在 err.response.data；err.payload/err.data/err.body 是别的客户端形态
      const respBody = (err.response && err.response.data) || err.payload || err.data || err.body || null
      const safePayload = pickSafeResponseFields(respBody)
      ipcLog('warn', 'xiaohongshu:probe-draft-chain', 'failed',
        `accountId=${accountId} code=${err.code || ''} message=${err.message}`)
      return {
        code: EC.REQUEST_ERROR,
        message: err.message,
        data: {
          stage: 'publish',
          success: false,
          errorCode: err.code || '',
          // 平台业务响应（白名单字段）—— 判断端点是否仍然有效的核心证据
          platformResponse: safePayload,
          // 失败发生在哪个端点 —— 定位 404 到底是 permit / ros-upload / note 的关键
          failedEndpoint: extractFailedEndpoint(err),
          httpStatus: (err.response && err.response.status) || undefined,
          cookieNames: names.sort(),
          hasAuthorization: Boolean(authorization),
        },
      }
    }
  }))
}

module.exports = { registerXiaohongshuDraftProbe, pickSafeResponseFields, extractFailedEndpoint, REQUIRED_COOKIE_MARKERS }