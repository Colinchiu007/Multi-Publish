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
const NOTE_PATH = '/web_api/sns/v2/note'

class XiaohongshuDraftError extends Error {
  constructor (message, code) {
    super(message)
    this.name = 'XiaohongshuDraftError'
    this.code = code || 'XHS_DRAFT_ERROR'
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
    throw new XiaohongshuDraftError(`${where} 失败：code=${payload.code} ${String(msg).slice(0, 200)}`, 'XHS_BUSINESS_ERROR')
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
    const { cookie, authorization, fileName, fileSize, mimeType } = opts
    const headers = this._baseHeaders(cookie, authorization)
    const res = await this.http.request({
      method: 'POST',
      url: `${CREATOR_ORIGIN}${PERMIT_PATH}`,
      headers,
      data: {
        file_name: fileName,
        file_size: fileSize,
        media_type: mimeType || 'image/png',
      },
    })
    assertBusinessOk(res && res.data, 'permit')
    const info = (res.data && res.data.data) || {}
    if (!info.file_id) {
      throw new XiaohongshuDraftError('permit: 响应缺 file_id', 'XHS_PERMIT_NO_FILE_ID')
    }
    return { fileId: info.file_id, token: info.token || '', cosKey: info.cos_key || '' }
  }

  /** Step 2：PUT 上传图片二进制 */
  async uploadImageBinary (permit, buffer, opts) {
    const { cookie, authorization, mimeType } = opts
    const headers = {
      ...this._baseHeaders(cookie, authorization),
      'Content-Type': mimeType || 'image/png',
      'X-Cos-Security-Token': permit.token || '',
    }
    const res = await this.http.request({
      method: 'PUT',
      url: `${ROS_UPLOAD_ORIGIN}/${permit.fileId}`,
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
    const { cookie, authorization } = opts
    const fullUri = `${EDITH_ORIGIN}${NOTE_PATH}`
    // 签名覆盖完整 URL —— 与平台侧一致（signer-local 的 fullUri 语义）
    const signHeaders = await this.sign({
      fullUri,
      cookie,
      method: 'POST',
      payload: body,
    })
    const headers = {
      ...this._baseHeaders(cookie, authorization),
      'Content-Type': 'application/json;charset=UTF-8',
      ...signHeaders,
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

    const submitted = await this.submitNote(body, { cookie, authorization })
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
  XiaohongshuDraftError,
  readCookieValue,
  CREATOR_ORIGIN,
  EDITH_ORIGIN,
  ROS_UPLOAD_ORIGIN,
  PERMIT_PATH,
  NOTE_PATH,
}