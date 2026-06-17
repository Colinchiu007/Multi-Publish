/**
 * 百家号 (BaiJiaHao) RPA 发布器
 *
 * 登录方式：百度账号 Cookie（扫码登录）
 * 发布类型：图文
 * 编辑器 URL：https://baijiahao.baidu.com/
 *
 * 文件位置: packages/rpa-engine/src/publishers/baijiahao-rpa.js
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const cookieStore = require('../cookie-store')

class BaiJiaHaoPublisher extends BaseRPAPublisher {
  constructor (options = {}) {
    super('baijiahao', options)
  }

  /**
   * 检查登录状态
   */
  async checkLogin () {
    try {
      await this.init()
      await this.page.goto('https://baijiahao.baidu.com/', {
        waitUntil: 'networkidle',
        timeout: 20000,
      })
      // 检查是否有用户头像/昵称（表示已登录）
      const loginIndicator = await this.page.$(
        '.user-info, .user-avatar, .nickname, [class*="user"]'
      )
      if (loginIndicator) return true

      // 检查 URL 是否跳转到登录页
      const url = this.page.url()
      return !url.includes('passport.baidu.com')
    } catch (e) {
      return false
    }
  }

  /**
   * 等待扫码登录
   */
  async waitForLogin (timeout = 120000) {
    await this.page.goto('https://baijiahao.baidu.com/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    // 如果自动跳转到登录页
    if (this.page.url().includes('passport')) {
      this._progress('请在浏览器中扫码登录百度账号...')
    } else {
      // 手动触发登录
      const loginBtn = await this.page.$('.login-btn, [class*="login"], a[href*="login"]')
      if (loginBtn) {
        await loginBtn.click()
        await new Promise(r => setTimeout(r, 2000))
      }
      this._progress('请在浏览器中扫码登录...')
    }

    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      try {
        // 等待登录成功跳转
        await this.page.waitForURL('https://baijiahao.baidu.com/**', { timeout: 5000 })
        // 确认已登录
        const indicator = await this.page.$('.user-info, .user-avatar, .nickname')
        if (indicator) {
          // 保存 Cookie
          const cookies = await this.context.cookies()
          cookieStore.saveCookies(this.platform, cookies, this._userDataDir)
          return true
        }
      } catch (e) {
        // 还没登录
        await new Promise(r => setTimeout(r, 2000))
      }
    }
    return false
  }

  /**
   * 发布图文
   */
  async publish (article) {
    this._progress('打开百家号创作中心...')
    await this.page.goto('https://baijiahao.baidu.com/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    this._progress('点击写文章...')
    // 找写文章入口
    const writeBtn = await this.page.$(
      'a[href*="write"], [class*="write"], .publish-btn, [class*="publish"], button:has-text("写文章")'
    )
    if (writeBtn) {
      await writeBtn.click()
    } else {
      // 尝试直接导航到编辑器
      await this.page.goto('https://baijiahao.baidu.com/pc/write', {
        waitUntil: 'networkidle',
        timeout: 20000,
      })
    }
    await new Promise(r => setTimeout(r, 3000))

    this._progress('填写标题...')
    // 标题输入框
    const titleInput = await this.page.$(
      'input[placeholder*="标题"], .title-input input, [class*="title"] input, #title'
    )
    if (titleInput) {
      await titleInput.click()
      await titleInput.fill(article.title || '')
    }

    this._progress('填写正文...')
    // 正文编辑器（可能嵌套在 iframe 中）
    let contentWritten = false
    const textContent = article.content
      ? article.content.replace(/<[^>]+>/g, '').trim()
      : ''

    if (textContent) {
      // 尝试 iframe 内的编辑器
      const editorFrame = await this.page.$('iframe[class*="editor"], iframe[src*="editor"]')
      if (editorFrame) {
        const frame = await editorFrame.contentFrame()
        if (frame) {
          const editor = await frame.$('[contenteditable], .editor-content, body')
          if (editor) {
            await editor.click()
            await editor.fill(textContent)
            contentWritten = true
          }
        }
      }

      if (!contentWritten) {
        // 直接页面上的编辑器
        const editor = await this.page.$(
          '[contenteditable], .editor-content, .article-content, [class*="editor"]'
        )
        if (editor) {
          await editor.click()
          await editor.fill(textContent)
          contentWritten = true
        }
      }
    }

    this._progress('设置封面图...')
    if (article.cover_url || article.coverImage) {
      const coverUrl = article.cover_url || article.coverImage
      try {
        // 尝试点击上传封面按钮
        const coverBtn = await this.page.$(
          'button:has-text("封面"), [class*="cover"], .set-cover'
        )
        if (coverBtn) await coverBtn.click()
        await new Promise(r => setTimeout(r, 1000))
      } catch (e) { /* 忽略封面设置 */ }
    }

    this._progress('添加标签...')
    if (article.tags && Array.isArray(article.tags) && article.tags.length > 0) {
      const tagInput = await this.page.$(
        'input[placeholder*="标签"], .tag-input input, [class*="tag"] input'
      )
      if (tagInput) {
        for (const tag of article.tags.slice(0, 5)) {
          await tagInput.fill(tag)
          await new Promise(r => setTimeout(r, 500))
          await this.page.keyboard.press('Enter')
          await new Promise(r => setTimeout(r, 300))
        }
      }
    }

    this._progress('提交发布...')
    const submitBtn = await this.page.$(
      'button:has-text("发布"), button:has-text("提交"), .submit-btn, [class*="submit"]'
    )
    if (submitBtn) {
      await submitBtn.click()
      await smartWait(this.page, null, 5000)
      this._progress('发布完成')
      return {
        success: true,
        platform: 'baijiahao',
        url: this.page.url(),
        message: '发布成功（等待审核）',
      }
    }

    return {
      success: false,
      error: '未找到百家号发布按钮',
      platform: 'baijiahao',
      url: this.page.url(),
    }
  }

  async cleanup () {
    if (this.page && !this.page.isClosed()) {
      try { await this.page.close() } catch (e) { /* ignore */ }
    }
  }
}

module.exports = BaiJiaHaoPublisher
