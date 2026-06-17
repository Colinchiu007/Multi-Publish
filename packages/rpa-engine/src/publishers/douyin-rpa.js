/**
 * 抖音 RPA 发布器
 *
 * 使用 Playwright 自动化操作 creator.douyin.com
 * 流程: 登录 → 创作中心 → 发布图文 → 填写内容 → 发布
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const { smartWait } = require('../playwright-manager')

const DOUYIN_URL = 'https://www.douyin.com/'
const DOUYIN_CREATOR_URL = 'https://creator.douyin.com/'
const LOGIN_TIMEOUT = 120000

class DouyinPublisher extends BaseRPAPublisher {
  constructor () {
    super('douyin')
  }

  async checkLogin () {
    await this.page.goto(DOUYIN_CREATOR_URL, { waitUntil: 'networkidle' })
    // 检查是否已登录（有用户名或创作中心内容）
    const userInfo = await this.page.$('.user-info, .account-info, .creator-header')
    if (userInfo) return true
    return false
  }

  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    try {
      await this.page.waitForSelector('.user-info, .account-info, .creator-header', { timeout })
      return true
    } catch {
      return false
    }
  }

  async publish (article) {
    this._progress('进入抖音创作中心...')
    await this.page.goto(DOUYIN_CREATOR_URL, { waitUntil: 'networkidle' })
    await smartWait(this.page, null, 2000)

    this._progress('填写标题...')
    await this._fillTitle(article.title)

    this._progress('填写正文...')
    await this._fillContent(article.content)

    this._progress('发布中...')
    const result = await this._doPublish()
    return result
  }

  async _fillTitle (title) {
    const titleInput = await this.page.$('.publish-title-input, .title-input, input[placeholder*="标题"]')
    if (titleInput) {
      await titleInput.click()
      await titleInput.fill(title)
      await smartWait(this.page, null, 300)
    }
  }

  async _fillContent (contentHtml) {
    const editor = await this.page.$('.ql-editor, .notranslate, [contenteditable="true"], .DraftEditor-root')
    if (editor) {
      await editor.click()
      await this.page.evaluate((html) => {
        const el = document.querySelector('.ql-editor') ||
                    document.querySelector('.notranslate') ||
                    document.querySelector('[contenteditable="true"]')
        if (el) el.innerHTML = html
      }, contentHtml)
      await smartWait(this.page, null, 500)
    }
  }

  async _doPublish () {
    const publishBtn = await this.page.$('button:has-text("发布"), .publish-btn, .confirm-btn')
    if (publishBtn) {
      await publishBtn.click()
      await smartWait(this.page, null, 3000)
      return { success: true, url: this.page.url(), platform: 'douyin' }
    }
    return { success: false, error: '未找到抖音发布按钮', url: this.page.url(), platform: 'douyin' }
  }
}

module.exports = DouyinPublisher