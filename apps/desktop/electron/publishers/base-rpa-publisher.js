/**
 * RPA 发布器基类
 * 所有平台 RPA 发布器继承此类
 */
const playwrightManager = require('../playwright-manager')
const cookieStore = require('../cookie-store')
const { app } = require('electron')

class BaseRPAPublisher {
  /**
   * @param {string} platform - 平台标识
   */
  constructor (platform) {
    this.platform = platform
    this.page = null
    this.context = null
    this._progressCallback = null
  }

  /**
   * 设置进度回调
   * @param {Function} cb - (stage: string) => void
   */
  onProgress (cb) {
    this._progressCallback = cb
  }

  /**
   * 发送进度消息
   */
  _progress (stage) {
    if (this._progressCallback) {
      this._progressCallback({ platform: this.platform, stage })
    }
  }

  /**
   * 初始化：获取 Playwright page
   */
  async init () {
    this.page = await playwrightManager.newPage()
    this.context = await playwrightManager.getContext()
  }

  /**
   * 检查登录状态 — 子类必须实现
   * @returns {Promise<boolean>} true=已登录, false=需扫码
   */
  async checkLogin () {
    throw new Error('checkLogin() must be implemented by subclass')
  }

  /**
   * 等待用户扫码 — 子类必须实现
   * @param {number} timeout - 最长等待 (ms)
   * @returns {Promise<boolean>} true=扫码成功
   */
  async waitForLogin (timeout = 120000) {
    throw new Error('waitForLogin() must be implemented by subclass')
  }

  /**
   * 执行发布 — 子类必须实现
   * @param {object} article - { title, content, coverUrl }
   * @returns {Promise<object>} - { success, url, mediaId? }
   */
  async publish (article) {
    throw new Error('publish() must be implemented by subclass')
  }

  /**
   * 完整的发布流程：检查登录 → 等待扫码 → 发布
   */
  async publishArticle (article) {
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
      // 保存 Cookie
      await this._saveCookies()
    } else {
      this._progress('登录状态有效')
    }

    this._progress('正在发布文章...')
    const result = await this.publish(article)

    this._progress('保存登录态...')
    await this._saveCookies()

    this._progress('发布完成')
    return result
  }

  /**
   * 保存 Cookie 到加密文件
   */
  async _saveCookies () {
    if (!this.context) return
    const cookies = await this.context.cookies()
    const userDataDir = app.getPath('userData')
    cookieStore.saveCookies(this.platform, cookies, userDataDir)
  }

  /**
   * 加载 Cookie 到 browser context
   */
  async _loadCookies () {
    if (!this.context) return
    const userDataDir = app.getPath('userData')
    const cookies = cookieStore.loadCookies(this.platform, userDataDir)
    if (cookies && cookies.length > 0) {
      await this.context.addCookies(cookies)
    }
  }

  /**
   * 清理资源
   */
  async cleanup () {
    if (this.page) {
      try { await this.page.close() } catch (e) { /* ignore */ }
      this.page = null
    }
  }
}

module.exports = BaseRPAPublisher