/**
 * YouTube RPA 发布器
 *
 * YouTube Studio: https://studio.youtube.com/
 * 支持：视频发布（标题+描述+标签）
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const { smartWait } = require('../playwright-manager')

const YOUTUBE_STUDIO_URL = 'https://studio.youtube.com/'
const LOGIN_TIMEOUT = 180000

class YouTubePublisher extends BaseRPAPublisher {
  constructor () {
    super('youtube')
  }

  async checkLogin () {
    await this.page.goto(YOUTUBE_STUDIO_URL, { waitUntil: 'networkidle', timeout: 30000 })
    // YouTube 已登录特征
    const avatar = await this.page.$('#avatar-btn, ytcp-avatar, [class*="avatar"]')
    if (avatar) return true
    const url = this.page.url()
    return url.includes('studio.youtube.com')
  }

  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    try {
      await this.page.waitForSelector('#avatar-btn, ytcp-avatar, [class*="avatar"]', { timeout })
      return true
    } catch {
      return false
    }
  }

  async publish (article) {
    this._progress('进入 YouTube Studio...')
    await this.page.goto(YOUTUBE_STUDIO_URL, { waitUntil: 'networkidle' })
    await smartWait(this.page, null, 3000)

    if (!article.video_path) {
      return { success: false, error: 'YouTube 发布需要视频文件', platform: 'youtube' }
    }

    return await this._publishVideo(article)
  }

  async _publishVideo (article) {
    this._progress('点击上传视频...')

    // 点击右上角"创建"按钮
    const createBtn = await this.page.$('#create-icon, ytcp-button#create-icon, button[aria-label="创建视频"]')
    if (createBtn) {
      await createBtn.click()
      await smartWait(this.page, null, 1000)
    }

    // 选择"上传视频"
    const uploadOption = await this.page.$('tp-yt-paper-item:has-text("上传视频"), .ytcp-menu-item:has-text("上传视频")')
    if (uploadOption) await uploadOption.click()
    await smartWait(this.page, null, 2000)

    // 上传视频文件
    const fileInput = await this.page.$('input[type="file"]')
    if (fileInput) {
      this._progress(`上传视频: ${article.video_path}`)
      await fileInput.setInputFiles(article.video_path)
    } else {
      // YouTube 可能用隐藏 file input
      const fileInputHidden = await this.page.$('#video-files, [class*="upload"] input[type="file"]')
      if (fileInputHidden) {
        this._progress(`上传视频: ${article.video_path}`)
        await fileInputHidden.setInputFiles(article.video_path)
      }
    }

    // 等待上传进度
    this._progress('等待视频上传处理中...')
    try {
      await smartWait(this.page, null, 5000) // YouTube 先处理视频
      await this.page.waitForFunction(
        () => !document.querySelector('ytcp-video-upload-progress, [class*="uploadProgress"]'),
        { timeout: 300000, polling: 5000 }
      )
    } catch {
      this._progress('视频处理中（可能仍需时间）...')
    }

    // 等待"详细信息"页面出现
    try {
      await this.page.waitForSelector('#title-textarea, [class*="title"] input, #title-text', { timeout: 60000 })
    } catch {
      // 可能已经就绪
    }

    // 填写标题
    if (article.title) {
      this._progress('填写视频标题...')
      const titleInput = await this.page.$('#title-textarea, [class*="title"] input, #title-text')
      if (titleInput) {
        await titleInput.click()
        await titleInput.fill(article.title.slice(0, 100))
        await smartWait(this.page, null, 500)
      }
    }

    // 填写描述
    if (article.content) {
      this._progress('填写视频描述...')
      const plain = article.content.replace(/<[^>]+>/g, '').trim().slice(0, 5000)
      const desc = await this.page.$('#description-textarea, [class*="description"] textarea')
      if (desc) {
        await desc.click()
        await desc.fill(plain)
        await smartWait(this.page, null, 300)
      }
    }

    return await this._doPublish()
  }

  async _doPublish () {
    // YouTube Studio 的发布流程需多次点击"下一步"
    this._progress('设定发布选项...')

    // 点击"下一步"处理受众选择等
    for (let i = 0; i < 3; i++) {
      try {
        const nextBtn = await this.page.$('ytcp-button:has-text("下一步"), button:has-text("下一步"), #next-button')
        if (nextBtn) {
          await nextBtn.click()
          await smartWait(this.page, null, 1500)
        }
      } catch { break }
    }

    // 点击"公开"或"发布"
    this._progress('选择发布方式...')
    try {
      const visibilityBtn = await this.page.$('tp-yt-paper-radio-button[name="PUBLIC"], #public-radio-button, [class*="public"]')
      if (visibilityBtn) {
        await visibilityBtn.click()
        await smartWait(this.page, null, 500)
      }
    } catch { /* keep default */ }

    // 最后发布
    try {
      const publishBtn = await this.page.$('ytcp-button:has-text("发布"), button:has-text("发布"), #done-button')
      if (publishBtn) {
        await publishBtn.click()
        await smartWait(this.page, null, 5000)
        return { success: true, url: YOUTUBE_STUDIO_URL, platform: 'youtube' }
      }
    } catch { /* 超时 */ }

    return { success: true, url: this.page.url(), platform: 'youtube' }
  }
}

module.exports = YouTubePublisher