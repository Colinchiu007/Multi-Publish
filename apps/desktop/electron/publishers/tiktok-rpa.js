/**
 * TikTok RPA 发布器
 *
 * TikTok 创作者中心 / 上传页面: https://www.tiktok.com/upload/
 * 支持：视频发布（标题+标签）
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const { smartWait } = require('../playwright-manager')

const TIKTOK_URL = 'https://www.tiktok.com/'
const TIKTOK_UPLOAD_URL = 'https://www.tiktok.com/upload/'
const LOGIN_TIMEOUT = 180000

class TikTokPublisher extends BaseRPAPublisher {
  constructor () {
    super('tiktok')
  }

  async checkLogin () {
    // TikTok 先访问首页检测登录
    await this.page.goto(TIKTOK_URL, { waitUntil: 'networkidle', timeout: 30000 })
    const userBtn = await this.page.$('[data-testid="user-avatar"], [class*="avatar"], .user-avatar')
    if (userBtn) return true
    // 检查是否有登录按钮（有则未登录）
    const loginBtn = await this.page.$('[data-testid="login-button"], a:has-text("Log in"), a:has-text("登录")')
    return !loginBtn
  }

  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    try {
      await this.page.waitForSelector('[data-testid="user-avatar"], [class*="avatar"]', { timeout })
      return true
    } catch {
      return false
    }
  }

  async publish (article) {
    this._progress('进入 TikTok 上传页...')
    await this.page.goto(TIKTOK_UPLOAD_URL, { waitUntil: 'networkidle' })
    await smartWait(this.page, null, 2000)

    if (!article.video_path) {
      return { success: false, error: 'TikTok 发布需要视频文件', platform: 'tiktok' }
    }

    return await this._publishVideo(article)
  }

  async _publishVideo (article) {
    this._progress('上传视频...')

    // TikTok 的 file input 在 upload 页面
    const fileInput = await this.page.$('input[type="file"]')
    if (fileInput) {
      this._progress(`上传视频: ${article.video_path}`)
      await fileInput.setInputFiles(article.video_path)
    } else {
      // 可能用隐藏 input
      const hiddenInput = await this.page.$('[class*="upload"] input[type="file"], #upload-btn input')
      if (hiddenInput) {
        this._progress(`上传视频: ${article.video_path}`)
        await hiddenInput.setInputFiles(article.video_path)
      }
    }

    // 等待上传和解析
    this._progress('等待视频上传...')
    try {
      await this.page.waitForFunction(
        () => {
          const progress = document.querySelector('[class*="progress"], [class*="percent"], [role="progressbar"]')
          return progress && (progress.textContent.includes('100') || progress.textContent.includes('100%'))
        },
        { timeout: 180000, polling: 3000 }
      )
    } catch { /* 超时继续 */ }

    if (article.title) {
      this._progress('填写标题...')
      const caption = await this.page.$('[class*="caption"] textarea, [class*="description"] textarea, #caption-input')
      if (caption) {
        await caption.click()
        // TikTok 标题最多 2200 字符
        const plain = article.title + '\n' + article.content.replace(/<[^>]+>/g, '').trim()
        const text = plain.slice(0, 2200)
        await caption.fill(text)
        await smartWait(this.page, null, 500)
      }
    }

    return await this._doPublish()
  }

  async _doPublish () {
    this._progress('发布中...')

    // 先找到"Post"按钮
    const postBtn = await this.page.$('button:has-text("Post"), button:has-text("发布"), [class*="post"]')
    if (postBtn) {
      await postBtn.click()
      await smartWait(this.page, null, 5000)
      return { success: true, url: this.page.url(), platform: 'tiktok' }
    }

    return { success: true, url: this.page.url(), platform: 'tiktok' }
  }
}

module.exports = TikTokPublisher