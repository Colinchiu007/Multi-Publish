/**
 * 快手 RPA 发布器
 *
 * 快手创作者中心: https://cp.kuaishou.com/
 * 支持：视频发布（需视频文件路径）、图文
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const { smartWait } = require('../playwright-manager')

const KUAISHOU_URL = 'https://cp.kuaishou.com/'
const KUAISHOU_HOME = 'https://www.kuaishou.com/'
const LOGIN_TIMEOUT = 120000

class KuaishouPublisher extends BaseRPAPublisher {
  constructor () {
    super('kuaishou')
  }

  async checkLogin () {
    await this.page.goto(KUAISHOU_URL, { waitUntil: 'networkidle', timeout: 30000 })
    const userEl = await this.page.$('.user-info, .profile-avatar, [class*="creator-header"]')
    if (userEl) return true
    const url = this.page.url()
    return !url.includes('login')
  }

  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    try {
      await this.page.waitForSelector('.user-info, .profile-avatar, [class*="creator-header"]', { timeout })
      return true
    } catch {
      return false
    }
  }

  async publish (article) {
    this._progress('进入快手创作者中心...')
    await this.page.goto(KUAISHOU_URL, { waitUntil: 'networkidle' })
    await smartWait(this.page, null, 2000)

    if (!article.video_path) {
      return await this._publishImage(article)
    }
    return await this._publishVideo(article)
  }

  async _publishVideo (article) {
    this._progress('点击上传视频...')

    // 点击"上传视频"
    const uploadBtn = await this.page.$(
      'button:has-text("上传视频"), [class*="upload"], a:has-text("上传视频"), [class*="video-upload"]'
    )
    if (uploadBtn) await uploadBtn.click()
    await smartWait(this.page, null, 1500)

    const fileInput = await this.page.$('input[type="file"]')
    if (fileInput) {
      this._progress(`上传视频: ${article.video_path}`)
      await fileInput.setInputFiles(article.video_path)
    }

    this._progress('等待视频上传...')
    try {
      await this.page.waitForFunction(
        () => {
          const el = document.querySelector('[class*="progress"], [class*="percent"], [class*="upload-progress"]')
          return el && (el.textContent.includes('100') || el.textContent.includes('完成'))
        },
        { timeout: 120000, polling: 3000 }
      )
    } catch {
      this._progress('视频上传超时...')
    }

    if (article.title) {
      this._progress('填写标题...')
      await this._fillTitle(article.title)
    }

    if (article.content) {
      this._progress('填写描述...')
      await this._fillDesc(article.content)
    }

    return await this._doPublish()
  }

  async _publishImage (article) {
    this._progress('发表图文...')
    const imgBtn = await this.page.$('button:has-text("图文"), [class*="image-upload"]')
    if (imgBtn) await imgBtn.click()
    await smartWait(this.page, null, 1000)

    if (article.title) await this._fillTitle(article.title)
    if (article.content) await this._fillDesc(article.content)

    return await this._doPublish()
  }

  async _fillTitle (title) {
    const input = await this.page.$('input[placeholder*="标题"], [class*="title"] input')
    if (input) await input.fill(title)
    await smartWait(this.page, null, 300)
  }

  async _fillDesc (html) {
    const plain = html.replace(/<[^>]+>/g, '').trim().slice(0, 500)
    const input = await this.page.$('textarea, [class*="desc"] textarea, [class*="description"] input')
    if (input) await input.fill(plain)
    await smartWait(this.page, null, 300)
  }

  async _doPublish () {
    const btn = await this.page.$('button:has-text("发布"), [class*="submit"], [class*="publish"] button')
    if (btn) {
      await btn.click()
      await smartWait(this.page, null, 3000)
      return { success: true, url: this.page.url(), platform: 'kuaishou' }
    }
    return { success: false, error: '未找到快手发布按钮', url: this.page.url(), platform: 'kuaishou' }
  }
}

module.exports = KuaishouPublisher