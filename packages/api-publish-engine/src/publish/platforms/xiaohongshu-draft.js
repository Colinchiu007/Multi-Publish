// @ts-check
/**
 * 小红书发布链 —— 图片上传 + 草稿箱存入（2026-10-06）
 *
 * 端点（公开资料实证）：
 *   1. POST https://creator.xiaohongshu.com/api/media/v1/upload/web/permit → { file_id, token, cos_key }
 *   2. PUT  https://ros-upload.xiaohongshu.com/{file_id}                   → 上传图片二进制
 *   3. POST https://edith.xiaohongshu.com/web_api/sns/v2/note             → 提交（draft=true 存草稿）
 *
 * 认证：Cookie（a1/web_session…）+ `Authorization: AT <access-token-creator.xiaohongshu.com>`
 *       + 小红书签名头 x-s / x-t / x-s-common / x-b3-traceid / x-xray-traceid
 *
 * 草稿语义：draft=true 时内容落到**小红书创作者中心草稿箱**（服务端持久化），
 * 不公开发布 —— 对应需求「只需要放在小红书草稿箱」。
 *
 * fail-closed 原则（贯穿全文件）：
 *   - 缺 a1 / 缺 Authorization ⇒ 抛错，绝不发出请求
 *   - 无图片 ⇒ 抛错（小红书不支持纯文字笔记）
 *   - 平台返回非 0 业务码 ⇒ 如实抛错，绝不当成功上报
 *   - 签名失败 ⇒ 抛错，绝不退回占位签名
 */

const CREATOR_ORIGIN = 'https://creator.xiaohongshu.com'
const EDITH_ORIGIN = 'https://edith.xiaohongshu.com'
const ROS_UPLOAD_ORIGIN = 'https://ros-upload.xiaohongshu.com'
const PERMIT_PATH = '/api/media/v1/upload/web/permit'
// 参考实现：permit 的四个业务参数全在 query 上，路径裸调会 404（2026-10-07 真机实证）
const PERMIT_QUERY = {
  biz_name: 'spectrum',
  file_count: '1',
  version: '1',
  source: 'web',
}
const PUBLISH_REFERER = 'https://creator.xiaohongshu.com/publish/publish'
const NOTE_PATH = '/web_api/sns/v2/note'

class XiaohongshuDraftError extends Error {
  constructor (message, code, detail) {
    super(message)
    this.name = 'XiaohongshuDraftError'
    this.code = code || 'XHS_DRAFT_ERROR'
    // detail：结构化诊断载荷（如平台响应的安全字段子集），由调用方（探针）白名单过滤后使用
    if (detail !== undefined) this.detail = detail
  }
}

/** 从 cookie 串/字典里取 a1（签名必需） */
function readCookieValue (cookie, name) {
  if (!cookie) return ''
  if (typeof cookie === 'object') return typeof cookie[name] === 'string' ? cookie[name] : ''
  for (const part of String(cookie).split(';')) {
    const t = part.trim()
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    if (t.slice(0, eq).trim() === name) return t.slice(eq + 1).trim()
  }
  return ''
}

/** 平台统一返回 { code, msg/data }；code 非 0 一律视为失败 */
function assertBusinessOk (payload, where) {
  if (!payload || typeof payload !== 'object') {
    throw new XiaohongshuDraftError(`${where}: 空响应`, 'XHS_EMPTY_RESPONSE')
  }
  const code = Number(payload.code)
  if (Number.isFinite(code) && code !== 0) {
    const msg = payload.msg || payload.err_msg || (payload.data && payload.data.msg) || ''
    throw new XiaohongshuDraftError(
      `${where} 失败：code=${payload.code} ${String(msg).slice(0, 200)}`,
      'XHS_BUSINESS_ERROR',
      {
        bizCode: payload.code,
        bizMsg: String(msg).slice(0, 200),
        topKeys: Object.keys(payload).slice(0, 20),
      },
    )
  }
  return payload
}

class XiaohongshuDraftChain {
  /**
   * @param {{http: {request: Function}, sign: Function, userAgent?: string, logger?: object}} deps
   */
  constructor ({ http, sign, userAgent, logger } = {}) {
    if (!http || typeof http.request !== 'function') {
      throw new XiaohongshuDraftError('XiaohongshuDraftChain: http.request 必需', 'XHS_MISSING_DEPS')
    }
    if (typeof sign !== 'function') {
      throw new XiaohongshuDraftError('XiaohongshuDraftChain: sign 必需（不得退回占位签名）', 'XHS_MISSING_DEPS')
    }
    this.http = http
    this.sign = sign
    this.userAgent = userAgent || ''
    this.logger = logger || console
  }

  _baseHeaders (cookie, authorization) {
    return {
      'User-Agent': this.userAgent,
      Cookie: typeof cookie === 'string' ? cookie : Object.entries(cookie || {}).map(([k, v]) => `${k}=${v}`).join('; '),
      Authorization: authorization,
    }
  }

  /** Step 1：申请上传许可 */
  async requestUploadPermit (opts) {
    const { cookie, authorization, fileName, fileSize, mimeType, scene } = opts
    const headers = {
      ...this._baseHeaders(cookie, authorization),
      referer: PUBLISH_REFERER,
    }
    // scene：参考实现有star / feeva / 模板三种取值，默认 video，图片传 image。
    // 缺 scene 是 404 的高嫌疑项之一，故显式带上。
    const query = new URLSearchParams({
      ...PERMIT_QUERY,
      scene: scene || 'image',
    })
    // GET + query（不是 POST + body）—— 与参考实现逐字一致
    const res = await this.http.request({
      method: 'GET',
      url: `${CREATOR_ORIGIN}${PERMIT_PATH}?${query.toString()}`,
      headers,
    })
    assertBusinessOk(res && res.data, 'permit')
    // 响应形状（真机 2026-10-09 实证）：{ code, success, data: { result: [...], uploadTempPermits: [...] } }
    // file 相关字段在数组元素里，且可能叫 fileIds/file_id 两种历史形态；兼容两种取法。
    const data2 = (res.data && res.data.data) || {}
    const permitArr = Array.isArray(data2.uploadTempPermits) && data2.uploadTempPermits.length
      ? data2.uploadTempPermits
      : (Array.isArray(data2.result) && data2.result.length ? data2.result : null)
    const info = (permitArr && permitArr[0]) || data2 || {}
    const rawFileId = info.file_id || info.fileId || info.fileID
    const rawFileIds = info.file_ids || info.fileIds || (rawFileId ? [rawFileId] : [])
    if (!rawFileId && (!Array.isArray(rawFileIds) || rawFileIds.length === 0)) {
      // 业务层通过但缺 file_id：把响应的顶层键与 data 键名带给探针（只带键名/业务码，不带值），
      // 用于区分「会话态不足」「响应形状变了」「需要签名」三类根因。
      throw new XiaohongshuDraftError(
        'permit: 响应缺 file_id',
        'XHS_PERMIT_NO_FILE_ID',
        {
          topKeys: Object.keys(res.data || {}).slice(0, 20),
          dataKeys: info && typeof info === 'object' ? Object.keys(data2).slice(0, 30) : null,
          successFlag: (res.data && res.data.success) !== undefined ? res.data.success : undefined,
        },
      )
    }
    // uploadAddr 由平台下发（参考实现用它拼上传 URL），不硬编码 ros-upload 域
    return { fileId: rawFileId, fileIds: rawFileIds, token: info.token || '', cosKey: info.cos_key || '', uploadAddr: info.upload_addr || info.uploadAddr || '' }
  }

  /** Step 2：PUT 上传图片二进制 */
  async uploadImageBinary (permit, buffer, opts) {
    const { cookie, authorization, mimeType } = opts
    const headers = {
      ...this._baseHeaders(cookie, authorization),
      'Content-Type': mimeType || 'image/png',
      'X-Cos-Security-Token': permit.token || '',
      referer: 'https://creator.xiaohongshu.com/',
      Origin: CREATOR_ORIGIN,
    }
    const res = await this.http.request({
      method: 'PUT',
      // 上传 URL 用平台下发的 uploadAddr；拿不到才回落硬编码域（与参考实现同款降级）
      url: permit.uploadAddr ? `https://${permit.uploadAddr}/${(permit.fileIds && permit.fileIds[0]) || permit.fileId}` : `${ROS_UPLOAD_ORIGIN}/${permit.fileId}`,
      headers,
      data: buffer,
    })
    const status = res && (res.status !== undefined ? res.status : (res.statusCode))
    if (Number.isFinite(Number(status)) && Number(status) >= 400) {
      throw new XiaohongshuDraftError(`ros-upload 失败：HTTP ${status}`, 'XHS_UPLOAD_HTTP_ERROR')
    }
    return res
  }

  /** Step 3：提交笔记（draft=true ⇒ 存创作者中心草稿箱） */
  async submitNote (body, opts) {
    const { cookie, authorization, pageInpage } = opts
    // note 端点宿主：真机实测 2026-10-10 —— creator 域 `/web_api/sns/v2/note` 返回 **404**（该端点
    // 不在 creator 域），edith 域同名端点存在但本账号返回 **406**（签名/风控未过）。故默认取
    // **edith**（唯一存在的端点），creator 仅作为 A/B 对照保留。
    // 取值优先级：调用方显式 noteOrigin > env MP_XHS_NOTE_HOST=creator（A/B）> 默认 edith。
    const noteOrigin = opts.noteOrigin
      || (process.env.MP_XHS_NOTE_HOST === 'creator' ? CREATOR_ORIGIN : EDITH_ORIGIN)
    const fullUri = `${noteOrigin}${NOTE_PATH}`
    // 签名基址：XYW 的 x1 = md5("url=" + uri)。参考实现传的是**路径（含 query）**，
    // 本仓原先传绝对 URL。真机 2026-10-10 实测：**两种形态都返回 406**（未证实哪种正确），
    // 故按参考实现口径默认走路径，并保留 MP_XHS_SIGN_URI=absolute 回退位以便后续对照。
    const signUri = process.env.MP_XHS_SIGN_URI === 'absolute'
      ? fullUri
      : (() => { try { const u = new URL(fullUri); return u.pathname + u.search } catch (_e) { return fullUri } })()
    // 签名器契约兼容：装配签名器（signer-assembly）返回裸字符串（XYW_ x-s），
    // 也有实现返回完整头集合。字符串形态下补齐 x-t / x-s-common / traceid——
    // 406 的根因之一是请求缺 x-s-common（真机 2026-10-09：permit+upload 已通，note 406）。
    const signResult = await this.sign({
      fullUri: signUri,
      cookie,
      method: 'POST',
      payload: body,
    })
    let signHeaders
    if (signResult && typeof signResult === 'object') {
      signHeaders = signResult
    } else {
      const { buildXiaohongshuSignHeaders } = require('../../signer-local')
      signHeaders = buildXiaohongshuSignHeaders({ fullUri: signUri, cookies: cookie })
      signHeaders['x-s'] = String(signResult)
    }
    const headers = {
      ...this._baseHeaders(cookie, authorization),
      'Content-Type': 'application/json;charset=UTF-8',
      referer: 'https://creator.xiaohongshu.com/',
      Origin: CREATOR_ORIGIN,
      ...signHeaders,
    }
    // 页内整发（2026-10-10，xhs-xys-signer 遗留项落地）：sendNote 由探针/调用方注入，
    // 在签名页上下文执行 fetch（credentials:'include' 自动带登录 cookie 与页内全套头）。
    // X-S-Common 页内生成入口未逆向，本地短模板混用仍 406 —— 页内整发是绕开该 mismatch 的正解。
    // 契约：sendNote({url, headers, body}) => {status, data}；错误语义与 http 路径一致（assertBusinessOk）。
    if (pageInpage && typeof pageInpage.sendNote === 'function') {
      const pageRes = await pageInpage.sendNote({ url: fullUri, headers, body: JSON.stringify(body) })
      assertBusinessOk(pageRes && pageRes.data, 'note')
      const pageData = (pageRes.data && pageRes.data.data) || {}
      return { noteId: pageData.note_id || pageData.noteId || '', draftId: pageData.draft_id || '' }
    }
    const res = await this.http.request({
      method: 'POST',
      url: fullUri,
      headers,
      data: JSON.stringify(body),
    })
    assertBusinessOk(res && res.data, 'note')
    const data = (res.data && res.data.data) || {}
    return { noteId: data.note_id || data.noteId || '', draftId: data.draft_id || '' }
  }

  /**
   * 完整链路：逐张图片 permit + PUT，随后提交（默认草稿）。
   *
   * @param {{title: string, content: string, images: Array<{path: string}>,
   *          draft?: boolean, tags?: string[], cookie: string|object,
   *          authorization: string, readFile?: Function, mimeType?: string}} input
   */
  async publishToDraft (input) {
    const {
      title, content, images, cookie, authorization,
      draft = true, tags = [], readFile, mimeType,
    } = input || {}

    const a1 = readCookieValue(cookie, 'a1')
    if (!a1) {
      throw new XiaohongshuDraftError('缺 a1 cookie（签名必需，fail-closed）', 'XHS_MISSING_A1')
    }
    if (!authorization || !String(authorization).trim()) {
      throw new XiaohongshuDraftError('缺 Authorization（AT token），fail-closed', 'XHS_MISSING_AUTHORIZATION')
    }
    if (!Array.isArray(images) || images.length === 0) {
      throw new XiaohongshuDraftError('至少需要 1 张图片：小红书不支持纯文字笔记', 'XHS_NO_IMAGE')
    }
    if (!title || !String(title).trim()) {
      throw new XiaohongshuDraftError('标题为空', 'XHS_NO_TITLE')
    }

    const read = typeof readFile === 'function'
      ? readFile
      : async (p) => require('fs').promises.readFile(p)

    const imageList = []
    for (const img of images) {
      const path = typeof img === 'string' ? img : (img && img.path)
      if (!path) continue
      const buf = await read(path)
      const permit = await this.requestUploadPermit({
        cookie, authorization,
        fileName: String(path).split(/[\\/]/).pop(),
        fileSize: buf.length,
        mimeType,
      })
      await this.uploadImageBinary(permit, buf, { cookie, authorization, mimeType })
      imageList.push({ file_id: permit.fileId })
    }
    if (imageList.length === 0) {
      throw new XiaohongshuDraftError('没有可用图片路径', 'XHS_NO_IMAGE')
    }

    const body = {
      title: String(title).slice(0, 20),   // 平台标题上限 20 字
      desc: String(content == null ? '' : content),
      image_list: imageList,
      draft: draft !== false,
    }
    if (Array.isArray(tags) && tags.length) {
      body.tag_list = tags.map(t => ({ name: String(t), type: 0 }))
    }

    const submitted = await this.submitNote(body, {
      cookie,
      authorization,
      noteOrigin: input && input.noteOrigin,
      pageInpage: input && input.pageInpage,
    })
    return {
      success: true,
      platform: 'xiaohongshu',
      draft: body.draft,
      noteId: submitted.noteId,
      draftId: submitted.draftId,
    }
  }
}

module.exports = {
  XiaohongshuDraftChain,
  PERMIT_QUERY,
  XiaohongshuDraftError,
  readCookieValue,
  CREATOR_ORIGIN,
  EDITH_ORIGIN,
  ROS_UPLOAD_ORIGIN,
  PERMIT_PATH,
  NOTE_PATH,
}