// @ts-check
/**
 * zhihu-image-localizer — 知乎正文图片本地化（2026-10-03，PRD C1）
 *
 * 背景：知乎图床（zhimg.com 等）有 Referer 防盗链，原链发布到其他平台会裂图。
 * 本模块把采集到的内联图片下载到本地 `{userData}/collected-images/`，
 * 请求带 `Referer: https://www.zhihu.com/` 伪装来源；本地路径写入条目 images
 * 数组（与发布侧 ARTICLE_FIELDS.images 契约对齐）。
 *
 * 失败语义（Q4C）：单图下载失败/超时/空响应 → 返回 null，调用方把原链记入
 * imageFallbacks 回退展示，**不中断采集**。
 *
 * 注入：fetchFn（测试）或 dir（显式落盘目录）；生产缺省用 electron app.getPath。
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp)(?:[?#]|$)/i
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * 下载域白名单（QM-6 m6 SSRF 缓解）：知乎图片固定出自 zhimg.com 系与 zhihu.com 系，
 * 收藏条目正文可能被注入任意外链图（含 http://169.254.169.254/ 等内网探测端点），
 * 白名单外的 URL 一律不下载 → 调用方回退原链展示，不发起请求。
 */
const ALLOWED_HOST_SUFFIXES = ['.zhimg.com', '.zhihu.com']

function isAllowedImageUrl (url) {
  let u
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const host = u.hostname.toLowerCase()
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))
}

class ZhihuImageLocalizer {
  /**
   * @param {object} [opts]
   * @param {string} [opts.dir] - 落盘目录（缺省生产用 userData/collected-images）
   * @param {function} [opts.fetchFn] - async (url) => Buffer（测试注入）
   * @param {number} [opts.timeoutMs]
   * @param {object} [opts.log]
   */
  constructor (opts = {}) {
    this._dirOverride = typeof opts.dir === 'string' ? opts.dir : null
    this._fetchFn = typeof opts.fetchFn === 'function' ? opts.fetchFn : null
    this._timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 20000
    this._log = opts.log || { info: () => {}, warn: () => {}, error: () => {} }
    this._dir = null
  }

  /**
   * 下载单张图片到本地。
   * @param {string} url - 图片原链
   * @param {number} [index] - 同条目内序号（文件名去重用）
   * @returns {Promise<string|null>} 本地绝对路径；失败 null（回退原链）
   */
  async localize (url, index = 0) {
    if (typeof url !== 'string' || !isAllowedImageUrl(url)) return null
    const dir = this._ensureDir()
    if (!dir) return null
    let buf
    try {
      buf = this._fetchFn ? await this._fetchFn(url) : await this._download(url)
    } catch (e) {
      this._log.warn('zhihu-image-localizer', '图片下载失败，回退原链', { url, error: e && e.message ? e.message : String(e) })
      return null
    }
    if (!buf || !Buffer.isBuffer(buf) || buf.length < 128) {
      // 空响应/占位图防御：过小的响应体基本不是有效图片
      this._log.warn('zhihu-image-localizer', '图片响应过小，视为失败', { url, bytes: buf ? buf.length : 0 })
      return null
    }
    const name = crypto.createHash('sha256').update(url).digest('hex').slice(0, 8) + '-' + Number(index) + this._extOf(url)
    const dest = path.join(dir, name)
    try {
      fs.writeFileSync(dest, buf)
    } catch (e) {
      this._log.warn('zhihu-image-localizer', '图片写盘失败', { dest, error: e && e.message ? e.message : String(e) })
      return null
    }
    return dest
  }

  /** 下载（生产路径）：axios arraybuffer + Referer 伪装 + 重定向跟随 */
  async _download (url) {
    // 惰性 require：单测环境由 test-setup 的 Module._load 拦截，无真出站
    const axios = require('axios')
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: this._timeoutMs,
      maxRedirects: 5,
      headers: {
        Referer: 'https://www.zhihu.com/',
        'User-Agent': UA,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    })
    return Buffer.from(res.data)
  }

  _ensureDir () {
    if (this._dir) return this._dir
    const base = this._dirOverride || this._userDataDir()
    if (!base) return null
    try {
      fs.mkdirSync(base, { recursive: true })
      this._dir = base
    } catch (e) {
      this._log.warn('zhihu-image-localizer', '目录创建失败，图片本地化停用', { base, error: e && e.message ? e.message : String(e) })
      this._dir = null
    }
    return this._dir
  }

  _userDataDir () {
    try {
      // Electron 运行时才有 app；单测/CLI 环境缺 dir 注入时本地化停用（返回 null 回退原链）
      // eslint-disable-next-line global-require
      const { app } = require('electron')
      return path.join(app.getPath('userData'), 'collected-images')
    } catch {
      return null
    }
  }

  _extOf (url) {
    const m = IMAGE_EXT_RE.exec(url)
    if (m) return '.' + m[1].toLowerCase().replace('jpeg', 'jpg')
    return '.jpg'
  }
}

module.exports = ZhihuImageLocalizer
