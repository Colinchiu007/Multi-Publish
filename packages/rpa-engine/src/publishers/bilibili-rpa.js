/**
 * B站 (BiliBili) 发布器 — API + RPA 双模式
 *
 * 发布模式：
 *   1. API 模式：使用 Cookie 调用 B站 内部 API（推荐，更快更稳）
 *   2. RPA 模式：Playwright 操作浏览器页面（回退方案）
 *
 * 支持的发布类型：
 *   - 视频：上传 + 发布
 *   - 专栏/文章：图文发布
 *
 * B站 API 认证方式：
 *   - Cookie: SESSDATA + bili_jct + buvid3
 *   - CSRF Token: bili_jct 的后 16 位即为 csrf token
 *
 * 文件位置: packages/rpa-engine/src/publishers/bilibili-rpa.js
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const cookieStore = require('../cookie-store')
const log = require('../../../../apps/desktop/electron/logger')

// B站 API 端点
const BILIBILI_API = {
  // 用户信息
  USER_INFO: 'https://api.bilibili.com/x/web-interface/nav',
  // 专栏发布
  ARTICLE_PUBLISH: 'https://api.bilibili.com/x/studio/article/create',
  // 专栏草稿列表
  ARTICLE_LIST: 'https://api.bilibili.com/x/studio/article/list',
  // 图片上传
  IMAGE_UPLOAD: 'https://api.bilibili.com/x/studio/article/upload',
  // 视频预上传
  VIDEO_PRE_UPLOAD: 'https://member.bilibili.com/x/vupre/web/upload/pre',
  // 视频上传完成
  VIDEO_UPLOAD_COMPLETE: 'https://member.bilibili.com/x/vupre/web/upload/complete',
  // 视频发布
  VIDEO_PUBLISH: 'https://member.bilibili.com/x/v2/video/add',
  // 视频分类
  VIDEO_TYPES: 'https://member.bilibili.com/x/web/archive/types',
}

class BiliBiliPublisher extends BaseRPAPublisher {
  constructor (options = {}) {
    super('bilibili', options)
    this._csrfToken = null
    this._cookies = null
  }

  /**
   * 从存储的 Cookie 中提取 CSRF Token
   */
  _extractCsrf (cookies) {
    if (!cookies) return null
    const biliJct = cookies.find(c => c.name === 'bili_jct')
    return biliJct ? biliJct.value.slice(-16) : null
  }

  /**
   * 将 cookies 数组转换成 HTTP Header 字符串
   */
  _cookiesToHeader (cookies) {
    if (!cookies || cookies.length === 0) return ''
    return cookies.map(c => `${c.name}=${c.value}`).join('; ')
  }

  /**
   * 发起 B站 API 请求
   */
  async _apiCall (method, url, data = null) {
    const axios = require('axios')
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.bilibili.com/',
      'Cookie': this._cookies,
    }

    const config = {
      method,
      url,
      headers,
      timeout: 30000,
    }

    if (data) {
      if (method === 'GET') {
        config.params = data
      } else {
        config.data = data
        if (this._csrfToken) {
          config.data.csrf = this._csrfToken
          config.data.csrf_token = this._csrfToken
        }
      }
    }

    try {
      const response = await axios(config)
      const body = response.data

      if (body.code !== 0) {
        throw new Error(`B站 API 错误 [${body.code}]: ${body.message || JSON.stringify(body)}`)
      }

      return body.data
    } catch (e) {
      if (e.response) {
        throw new Error(`B站 API 请求失败 (${e.response.status}): ${e.response.statusText}`)
      }
      throw e
    }
  }

  // ─── 登录检查 ─────────────────────────────────

  async checkLogin () {
    try {
      // 尝试从 cookieStore 加载已保存的 Cookie
      const cookies = cookieStore.loadCookies(this.platform, this._userDataDir)
      if (!cookies || cookies.length === 0) return false

      this._cookies = this._cookiesToHeader(cookies)
      this._csrfToken = this._extractCsrf(cookies)

      if (!this._csrfToken) {
        log.warn('BiliBili', 'No CSRF token (bili_jct) found in cookies')
        return false
      }

      // 验证 Cookie 是否有效
      const userInfo = await this._apiCall('GET', BILIBILI_API.USER_INFO)
      return !!(userInfo && userInfo.mid)
    } catch (e) {
      log.warn('BiliBili', 'Cookie invalid:', e.message)
      return false
    }
  }

  async waitForLogin (timeout = 120000) {
    // RPA 模式：打开B站登录页
    await this.init()
    await this.page.goto('https://passport.bilibili.com/login', {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    this._progress('请在浏览器中扫码登录 B站...')

    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      // 等待页面跳转（登录成功后会跳转到首页）
      try {
        await this.page.waitForURL('https://www.bilibili.com/**', { timeout: 5000 })
        // 登录成功
        const cookies = await this.context.cookies()
        this._cookies = this._cookiesToHeader(cookies)
        this._csrfToken = this._extractCsrf(cookies)

        // 保存 Cookie
        cookieStore.saveCookies(this.platform, cookies, this._userDataDir)
        return true
      } catch (e) {
        // 还没登录成功，继续等待
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    return false
  }

  // ─── 发布逻辑 ─────────────────────────────────

  async publish (article) {
    // 根据发布类型选择方式
    if (article.type === 'video' || article.videoPath) {
      return this._publishVideo(article)
    }
    return this._publishArticle(article)
  }

  /**
   * 发布专栏/文章
   */
  async _publishArticle (article) {
    this._progress('准备发布专栏文章...')

    // 上传封面图（如果有）
    let coverUrl = article.coverImage
    if (article.coverImage && article.coverImage.startsWith('http')) {
      try {
        const uploadResult = await this._uploadImage(article.coverImage)
        coverUrl = uploadResult.url || article.coverImage
      } catch (e) {
        log.warn('BiliBili', 'Cover upload failed, using original URL:', e.message)
      }
    }

    // 构建发布参数
    const params = {
      title: article.title,
      content: article.content,
      category: article.category || 4, // 默认：杂谈
      tags: Array.isArray(article.tags) ? article.tags.join(',') : (article.tags || ''),
      cover: coverUrl || '',
      tid: article.tid || 4, // 分区 ID
      reprint: article.reprint || 0, // 0=原创 1=转载
    }

    this._progress('正在提交专栏文章...')
    const result = await this._apiCall('POST', BILIBILI_API.ARTICLE_PUBLISH, params)

    this._progress('专栏发布成功')
    return {
      success: true,
      postId: String(result.article_id || result.aid || ''),
      url: `https://www.bilibili.com/read/cv${result.article_id || ''}`,
      platform: 'bilibili',
    }
  }

  /**
   * 发布视频
   */
  async _publishVideo (article) {
    // B站视频发布走 RPA 模式（API 上传视频文件较复杂）
    this._progress('准备发布视频...')
    return this._publishVideoViaRPA(article)
  }

  /**
   * 通过 RPA 浏览发布视频
   */
  async _publishVideoViaRPA (article) {
    await this.init()

    this._progress('打开 B站 创作者中心...')
    await this.page.goto('https://member.bilibili.com/platform/upload/video', {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    this._progress('正在上传视频文件（若文件较大请耐心等待）...')
    // 使用 Playwright 的 file chooser
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser', { timeout: 10000 }),
      this.page.click('.upload-btn, .upload-file, [class*=\"upload\"]'),
    ])
    await fileChooser.setFiles(article.videoPath)

    // 等待上传完成
    await this.page.waitForSelector('.upload-success, .finish-btn, [class*=\"success\"]', {
      timeout: 300000,
    })

    this._progress('正在填写视频信息...')
    // 填写标题
    const titleInput = await this.page.$('input[placeholder*="标题"], .video-title input')
    if (titleInput) {
      await titleInput.fill(article.title)
    }

    // 填写简介
    const descInput = await this.page.$('textarea[placeholder*="简介"], .video-desc textarea')
    if (descInput && article.content) {
      await descInput.fill(article.content.replace(/<[^>]+>/g, '').slice(0, 250))
    }

    this._progress('正在提交视频...')
    await this.page.click('button:has-text("发布"), .submit-btn, [class*=\"submit\"]')

    // 等待发布完成
    await this.page.waitForSelector('.publish-success, [class*=\"success\"]', {
      timeout: 60000,
    })

    this._progress('视频发布成功')
    return {
      success: true,
      platform: 'bilibili',
    }
  }

  /**
   * 上传图片到 B站
   */
  async _uploadImage (imageUrl) {
    const axios = require('axios')
    const FormData = require('form-data')

    // 下载图片
    const imageResp = await axios.get(imageUrl, { responseType: 'stream', timeout: 15000 })

    const form = new FormData()
    form.append('file_up', imageResp.data, { filename: 'cover.jpg' })
    form.append('type', 'cover')
    form.append('biz', 'article')

    const headers = {
      ...form.getHeaders(),
      'Cookie': this._cookies,
      'Referer': 'https://www.bilibili.com/',
    }

    const uploadResp = await axios.post(BILIBILI_API.IMAGE_UPLOAD, form, {
      headers,
      timeout: 30000,
    })

    return uploadResp.data.data || {}
  }

  async cleanup () {
    if (this.page && !this.page.isClosed()) {
      try { await this.page.close() } catch (e) { /* ignore */ }
    }
  }
}

module.exports = BiliBiliPublisher
