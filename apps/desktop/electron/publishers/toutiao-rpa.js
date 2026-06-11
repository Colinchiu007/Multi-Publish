/**
 * 今日头条 RPA 发布器
 *
 * 头条号后台: https://mp.toutiao.com/
 * 支持：图文发布、视频发布
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const { smartWait } = require('../playwright-manager')

const TOUTIAO_URL = 'https://mp.toutiao.com/'
const LOGIN_TIMEOUT = 120000

class ToutiaoPublisher extends BaseRPAPublisher {
  constructor () {
    super('toutiao')
  }

  async checkLogin () {
    await this.page.goto(TOUTIAO_URL, { waitUntil: 'networkidle', timeout: 30000 })
    const header = await this.page.$('.user-avatar, .header-avatar, [class*="avatar"], .nickname')
    if (header) return true
    const url = this.page.url()
    return !url.includes('login')
  }

  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    try {
      await this.page.waitForSelector('.user-avatar, .header-avatar, [class*="avatar"], .nickname', { timeout })
      return true
    } catch {
      return false
    }
  }

  async publish (article) {
    this._progress('进入头条号后台...')
    await this.page.goto(TOUTIAO_URL, { waitUntil: 'networkidle' })
    await smartWait(this.page, null, 2000)

    if (article.video_path) {
      return await this._publishVideo(article)
    }
    return await this._publishArticle(article)
  }

  async _publishArticle (article) {
    this._progress('点击发表图文...')
    // 点击"发表文章"
    const writeBtn = await this.page.$('a:has-text("发表文章"), button:has-text("写文章"), [class*="write"], a:has-text("创作")')
    if (writeBtn) await writeBtn.click()
    await smartWait(this.page, null, 2000)

    // 填写标题
    if (article.title) {
      this._progress('填写标题...')
      const titleInput = await this.page.$('input[placeholder*="标题"], .title-input input, [class*="title"] input')
      if (titleInput) await titleInput.fill(article.title)
      await smartWait(this.page, null, 300)
    }

    // 填写正文
    if (article.content) {
      this._progress('填写正文...')
      const editor = await this.page.$('[contenteditable="true"], .ql-editor, .editor-content, .notranslate')
      if (editor) {
        await editor.click()
        await this.page.evaluate((html) => {
          const el = document.querySelector('[contenteditable="true"]') ||
                      document.querySelector('.ql-editor') ||
                      document.querySelector('.editor-content')
          if (el) el.innerHTML = html
        }, article.content)
        await smartWait(this.page, null, 500)
      }
    }

    return await this._doPublish()
  }

  async _publishVideo (article) {
    this._progress('点击发布视频...')
    const videoBtn = await this.page.$('a:has-text("发布视频"), button:has-text("视频"), [class*="video"]')
    if (videoBtn) await videoBtn.click()
    await smartWait(this.page, null, 2000)

    // 上传视频
    const fileInput = await this.page.$('input[type="file"]')
    if (fileInput) {
      this._progress(`上传视频: ${article.video_path}`)
      await fileInput.setInputFiles(article.video_path)
    }

    this._progress('等待视频上传...')
    try {
      await this.page.waitForFunction(
        () => {
          const el = document.querySelector('[class*="progress"], [class*="percent"]')
          return el && (el.textContent.includes('100') || el.textContent.includes('完成'))
        },
        { timeout: 180000, polling: 3000 }
      )
    } catch { /* 超时继续 */ }

    if (article.title) {
      this._progress('填写视频标题...')
      const titleInput = await this.page.$('input[placeholder*="标题"], [class*="title"] input')
      if (titleInput) await titleInput.fill(article.title)
      await smartWait(this.page, null, 300)
    }

    if (article.content) {
      this._progress('填写视频简介...')
      const plain = article.content.replace(/<[^>]+>/g, '').trim().slice(0, 200)
      const desc = await this.page.$('textarea, [class*="desc"] textarea, [class*="description"] textarea')
      if (desc) await desc.fill(plain)
      await smartWait(this.page, null, 300)
    }

    return await this._doPublish()
  }

  async _doPublish () {
    const btn = await this.page.$('button:has-text("发布"), button:has-text("发表"), .publish-btn, [class*="submit"]')
    if (btn) {
      await btn.click()
      await smartWait(this.page, null, 3000)
    }
    return { success: true, url: this.page.url(), platform: 'toutiao' }
  }
}

module.exports = ToutiaoPublisher