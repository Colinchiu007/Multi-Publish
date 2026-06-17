/**
 * 视频号 RPA 发布器
 *
 * 视频号创作者中心: https://channels.weixin.qq.com/
 * 支持：视频发布（需视频文件路径）
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const { smartWait } = require('../playwright-manager')

const WX_VIDEO_URL = 'https://channels.weixin.qq.com/'
const WX_VIDEO_LOGIN_URL = 'https://wx.qq.com/'
const LOGIN_TIMEOUT = 120000

class TencentVideoPublisher extends BaseRPAPublisher {
  constructor () {
    super('tencent_video')
  }

  async checkLogin () {
    await this.page.goto(WX_VIDEO_URL, { waitUntil: 'networkidle', timeout: 30000 })
    // 视频号已登录特征：创作者后台顶部有"视频号"标识
    const header = await this.page.$('.channel-header, .creator-header, [class*="weixinChannel"]')
    if (header) return true
    // 检查是否跳转到了登录页
    const url = this.page.url()
    return !url.includes('login') && !url.includes('weixin.qq.com/cgi-bin')
  }

  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    try {
      await this.page.waitForSelector('.channel-header, .creator-header, [class*="weixinChannel"]', { timeout })
      return true
    } catch {
      return false
    }
  }

  async publish (article) {
    this._progress('进入视频号创作平台...')
    await this.page.goto(WX_VIDEO_URL, { waitUntil: 'networkidle' })
    await smartWait(this.page, null, 2000)

    // 如果没有视频路径，只能发图文
    if (!article.video_path) {
      return await this._publishImage(article)
    }

    return await this._publishVideo(article)
  }

  /**
   * 发布视频
   */
  async _publishVideo (article) {
    this._progress('点击上传视频...')

    // 点击"发表视频"按钮
    const uploadBtn = await this.page.$(
      'button:has-text("发表视频"), [class*="upload"], [class*="videoBtn"], a:has-text("发表视频")'
    )
    if (uploadBtn) await uploadBtn.click()
    await smartWait(this.page, null, 1500)

    // 上传视频文件
    const fileInput = await this.page.$('input[type="file"]')
    if (fileInput) {
      this._progress(`上传视频: ${article.video_path}`)
      await fileInput.setInputFiles(article.video_path)
    }

    // 等待上传进度完成
    this._progress('等待视频上传...')
    try {
      await this.page.waitForFunction(
        () => {
          const progress = document.querySelector('[class*="progress"], [class*="upload"]')
          return progress && (progress.textContent.includes('100') || progress.textContent.includes('完成'))
        },
        { timeout: 120000, polling: 3000 }
      )
    } catch {
      this._progress('视频上传超时，继续发布...')
    }

    // 填写标题
    if (article.title) {
      this._progress('填写视频标题...')
      await this._fillTitle(article.title)
    }

    // 填写简介
    if (article.content) {
      this._progress('填写视频简介...')
      await this._fillDesc(article.content)
    }

    return await this._doPublish()
  }

  /**
   * 发布图文（无视频时）
   */
  async _publishImage (article) {
    this._progress('发表图文...')
    const publishBtn = await this.page.$(
      'button:has-text("发表"), [class*="image"], a:has-text("发表图文")'
    )
    if (publishBtn) await publishBtn.click()
    await smartWait(this.page, null, 1500)

    if (article.title) await this._fillTitle(article.title)
    if (article.content) await this._fillDesc(article.content)

    return await this._doPublish()
  }

  async _fillTitle (title) {
    const input = await this.page.$('input[placeholder*="标题"], [class*="title"] input, .title-input')
    if (input) await input.fill(title)
    await smartWait(this.page, null, 300)
  }

  async _fillDesc (html) {
    // 去掉 HTML 标签
    const plain = html.replace(/<[^>]+>/g, '').trim()
    const textarea = await this.page.$('textarea, [class*="desc"] input, [class*="desc"] textarea')
    if (textarea) await textarea.fill(plain)
    await smartWait(this.page, null, 300)
  }

  async _doPublish () {
    const btn = await this.page.$('button:has-text("发布"), [class*="publish"] button, .submit-btn')
    if (btn) {
      await btn.click()
      await smartWait(this.page, null, 3000)
      return { success: true, url: this.page.url(), platform: 'tencent_video' }
    }
    return { success: false, error: '未找到视频号发布按钮', url: this.page.url(), platform: 'tencent_video' }
  }
}

module.exports = TencentVideoPublisher