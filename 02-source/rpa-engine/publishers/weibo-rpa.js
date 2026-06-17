/**
 * 微博 RPA 发布器
 *
 * 使用 Playwright 自动化操作 weibo.com
 * 流程: 登录检查 → 创作中心 → 写文章 → 发布
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const { smartWait } = require('../playwright-manager')

const WEIBO_URL = 'https://weibo.com/'
const WEIBO_COMPOSE_URL = 'https://weibo.com/compose'
const LOGIN_TIMEOUT = 120000

class WeiboPublisher extends BaseRPAPublisher {
  constructor () {
    super('weibo')
  }

  async checkLogin () {
    await this.page.goto(WEIBO_URL, { waitUntil: 'networkidle' })
    // 检查是否有已登录标识（头像/昵称）
    const avatar = await this.page.$('.gn_name, .Avatar, [node-type="userInfo"]')
    if (avatar) return true
    // 检查登录框
    const loginBox = await this.page.$('.W_login_box, .loginWrap')
    return !loginBox
  }

  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    try {
      await this.page.waitForSelector('.gn_name, .Avatar, [node-type="userInfo"]', { timeout })
      return true
    } catch {
      return false
    }
  }

  async publish (article) {
    this._progress('进入微博创作页...')
    await this.page.goto(WEIBO_COMPOSE_URL, { waitUntil: 'networkidle' })
    await smartWait(this.page, null, 2000)

    this._progress('填写微博内容...')
    await this._fillContent(article)

    this._progress('发布中...')
    const result = await this._doPublish()
    return result
  }

  async _fillContent (article) {
    const textarea = await this.page.$('.publisher_text textarea, .W_input, textarea[node-type="textEl"]')
    if (!textarea) {
      throw new Error('无法定位微博发布输入框')
    }
    await textarea.click()
    const plainText = (article.content || '').replace(/<[^>]+>/g, '').trim()
    const fullText = article.title ? `${article.title}\n\n${plainText}` : plainText
    const maxLen = 2000
    const truncated = fullText.length > maxLen ? fullText.slice(0, maxLen) : fullText
    await textarea.fill(truncated)
    await smartWait(this.page, null, 500)
  }

  async _doPublish () {
    const sendBtn = await this.page.$('a[node-type="submit"], .W_btn_b, button:has-text("发布")')
    if (sendBtn) {
      await sendBtn.click()
      await smartWait(this.page, null, 3000)
      return { success: true, url: this.page.url(), platform: 'weibo' }
    }
    return { success: false, error: '未找到微博发布按钮', url: this.page.url(), platform: 'weibo' }
  }
}

module.exports = WeiboPublisher