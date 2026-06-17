/**
 * RPA 发布器基类 — 无 Electron 依赖
 * userDataDir 通过构造注入传入
 * P0-D6: 添加 validateResult 发布结果验证
 * P0-D7: 集成 SelectorEngine 选择器降级
 */
const playwrightManager = require('../playwright-manager')
const cookieStore = require('../cookie-store')
const { SelectorEngine } = require('../selector-engine')

class BaseRPAPublisher {
  constructor (platform, options = {}) {
    this.platform = platform
    this.page = null
    this.context = null
    this._progressCallback = null
    this._userDataDir = options.userDataDir
  }

  onProgress (cb) {
    this._progressCallback = cb
  }

  _progress (stage) {
    if (this._progressCallback) {
      this._progressCallback({ platform: this.platform, stage })
    }
  }

  async init () {
    this.page = await playwrightManager.newPage()
    this.context = await playwrightManager.getContext()
  }

  /**
   * 使用 SelectorEngine 查找元素（Level 1: 配置 → Level 2: 语义降级）
   * @param {string} elementKey - 元素键名 (publish_btn, title_input, ...)
   * @param {object} [options] - 选项
   * @returns {Promise<import('playwright').Locator|null>}
   */
  async findElement (elementKey, options = {}) {
    if (!this.page) throw new Error('Page not initialized. Call init() first.')
    return SelectorEngine.find(this.page, this.platform, elementKey, options)
  }

  async checkLogin () {
    throw new Error('checkLogin() must be implemented by subclass')
  }

  async waitForLogin (timeout = 120000) {
    throw new Error('waitForLogin() must be implemented by subclass')
  }

  async publish (article) {
    throw new Error('publish() must be implemented by subclass')
  }

  async validateResult (result) {
    if (!result || typeof result !== 'object') {
      throw new Error('Publish result is empty')
    }
    if (result.error) {
      throw new Error('Publish failed: ' + result.error)
    }
    if (this.page && !this.page.isClosed()) {
      try {
        var errorText = await this.page.evaluate(function () {
          var el = document.querySelector('.toast_error, .error_msg, .alert-danger, [class*="error"]')
          return el ? el.textContent.trim() : null
        })
        if (errorText) result._pageError = errorText
      } catch (e) { /* ignore page errors */ }
    }
    result.verifiedAt = new Date().toISOString()
    return result
  }

  async publishArticle (article) {
    if (!article || typeof article !== 'object') {
      throw new Error('article 参数无效')
    }
    if (!article.title && !article.content && !article.video_path) {
      throw new Error('article 必须包含 title、content 或 video_path')
    }

    this._progress('启动浏览器...')
    await this.init()

    this._progress('检查登录状态...')
    const loggedIn = await this.checkLogin()

    if (!loggedIn) {
      this._progress('需要扫码登录，请扫描二维码...')
      const loginOk = await this.waitForLogin()
      if (!loginOk) {
        throw new Error('扫码登录超时')
      }
      await this._saveCookies()
    } else {
      this._progress('登录状态有效')
    }

    this._progress('正在发布文章...')
    let result = await this.publish(article)

    this._progress('保存登录态...')
    await this._saveCookies()

    this._progress('验证发布结果...')
    result = await this.validateResult(result)
    this._progress('发布完成')
    return result
  }

  async _saveCookies () {
    if (!this.context || !this._userDataDir) return
    const cookies = await this.context.cookies()
    cookieStore.saveCookies(this.platform, cookies, this._userDataDir)
  }

  async _loadCookies () {
    if (!this.context || !this._userDataDir) return
    const cookies = cookieStore.loadCookies(this.platform, this._userDataDir)
    if (cookies && cookies.length > 0) {
      await this.context.addCookies(cookies)
    }
  }

  async cleanup () {
    if (this.page) {
      try { await this.page.close() } catch (e) { /* ignore */ }
      this.page = null
    }
  }
}

module.exports = BaseRPAPublisher