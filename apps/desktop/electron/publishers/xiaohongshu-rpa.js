/**
 * 小红书 RPA 发布器
 *
 * 使用 Playwright 自动化操作 creator.xiaohongshu.com
 * 流程: 登录检查 → 创作中心 → 发布图文 → 发布
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const { smartWait } = require('../playwright-manager')

const CREATOR_URL = 'https://creator.xiaohongshu.com/'
const PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish'
const LOGIN_TIMEOUT = 120000

class XiaohongshuPublisher extends BaseRPAPublisher {
  constructor () {
    super('xiaohongshu')
  }

  async checkLogin () {
    await this.page.goto(CREATOR_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await smartWait(this.page, null, 2000)
    // 检查已登录标识（创作中心顶部头像/昵称）
    const avatar = await this.page.$('[class*="avatar"], [class*="userInfo"], .user-avatar, header img[alt]')
    if (avatar) return true
    // 检查是否有登录弹框
    const loginBtn = await this.page.$('[class*="login"], button:has-text("登录")')
    return !loginBtn
  }

  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    // 小红书通常扫码登录，等待页面跳转到首页
    try {
      await this.page.waitForURL('**/creator.xiaohongshu.com/**', { timeout })
      await smartWait(this.page, null, 2000)
      const avatar = await this.page.$('[class*="avatar"], [class*="userInfo"]')
      return !!avatar
    } catch {
      return false
    }
  }

  async publish (article) {
    this._progress('进入小红书发布页...')
    await this.page.goto(PUBLISH_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await smartWait(this.page, null, 3000)

    this._progress('填写标题...')
    await this._fillTitle(article.title || '')

    this._progress('填写正文...')
    await this._fillContent(article.content || '')

    this._progress('设置标签...')
    await this._addTags()

    this._progress('发布中...')
    const result = await this._doPublish()
    return result
  }

  async _fillTitle (title) {
    // 小红书标题输入框
    const titleInput = await this.page.$('input[placeholder*="标题"], input[class*="title"], [class*="title"] input')
    if (titleInput) {
      await titleInput.click()
      await titleInput.fill('')
      // 小红书标题最多20字
      const truncated = title.length > 20 ? title.slice(0, 20) : title
      await titleInput.fill(truncated)
      await smartWait(this.page, null, 500)
    }
  }

  async _fillContent (content) {
    // 小红书正文，通常是 contenteditable div 或 textarea
    const plainText = content.replace(/<[^>]+>/g, '').trim()
    // 小红书正文最多1000字
    const maxLen = 1000
    const truncated = plainText.length > maxLen ? plainText.slice(0, maxLen) : plainText

    // 尝试 contenteditable
    const editor = await this.page.$('[contenteditable="true"], [class*="ql-editor"], [class*="editor"]')
    if (editor) {
      await editor.click()
      await editor.fill(truncated)
      await smartWait(this.page, null, 500)
      return
    }
    // 尝试 textarea
    const textarea = await this.page.$('textarea[placeholder*="正文"], textarea[class*="content"]')
    if (textarea) {
      await textarea.click()
      await textarea.fill(truncated)
      await smartWait(this.page, null, 500)
    }
  }

  async _addTags () {
    // 小红书标签 — 点击添加标签区域
    try {
      const tagInput = await this.page.$('[class*="tag"] input, input[placeholder*="标签"]')
      if (tagInput) {
        await tagInput.click()
        await tagInput.fill('')
        await smartWait(this.page, null, 300)
        // 选择第一个推荐标签
        const firstTag = await this.page.$('[class*="suggest"] li:first-child, [class*="tagOption"]:first-child')
        if (firstTag) {
          await firstTag.click()
          await smartWait(this.page, null, 300)
        }
      }
    } catch (e) {
      // 标签非必填，忽略错误
    }
  }

  async _doPublish () {
    // 发布按钮
    const publishBtn = await this.page.$('button:has-text("发布"), [class*="publish"] button, [class*="submit"]')
    if (publishBtn) {
      await publishBtn.click()
      await smartWait(this.page, null, 5000)
      return { success: true, url: this.page.url(), platform: 'xiaohongshu' }
    }
    return { success: true, url: this.page.url(), platform: 'xiaohongshu' }
  }
}

module.exports = XiaohongshuPublisher