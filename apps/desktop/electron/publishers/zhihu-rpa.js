/**
 * 知乎 RPA 发布器
 *
 * 使用 Playwright 自动化操作 zhuanlan.zhihu.com/write
 * 流程: 登录检查 → 创作中心 → 写文章 → 填写内容 → 保存草稿
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const { smartWait } = require('../playwright-manager')

const ZHIHU_URL = 'https://www.zhihu.com/'
const ZHIHU_WRITE_URL = 'https://zhuanlan.zhihu.com/write'
const LOGIN_TIMEOUT = 120000

class ZhiHuPublisher extends BaseRPAPublisher {
  constructor () {
    super('zhihu')
  }

  async checkLogin () {
    await this.page.goto(ZHIHU_URL, { waitUntil: 'networkidle' })

    // 检查是否有登录头像（个人中心图标）
    const avatar = await this.page.$('.AppHeader-profileAvatar, .ProfileHeader-avatar, img[alt="avatar"]')
    if (avatar) return true

    // 检查 URL 是否跳转到登录页
    const currentUrl = this.page.url()
    if (currentUrl.includes('signin') || currentUrl.includes('login')) {
      return false
    }

    // 尝试直接访问创作中心
    await this.page.goto(ZHIHU_WRITE_URL, { waitUntil: 'networkidle', timeout: 15000 })
    const writeEditor = await this.page.$('.WriteIndex-titleInput, .DraftEditor-title, .title-input')
    if (writeEditor) return true

    return false
  }

  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    // 知乎登录有多种方式：扫码、手机、账号密码
    // 等待页面跳转 or 登录成功后的元素出现
    try {
      await this.page.waitForURL((url) => {
        return !url.includes('signin') && !url.includes('login') && url.includes('zhihu')
      }, { timeout })
      return true
    } catch {
      return false
    }
  }

  async publish (article) {
    this._progress('进入创作中心...')
    await this.page.goto(ZHIHU_WRITE_URL, { waitUntil: 'networkidle' })
    await smartWait(this.page, null, 2000)

    // 填写标题
    this._progress('填写标题...')
    await this._fillTitle(article.title)

    // 填写正文
    this._progress('填写正文...')
    await this._fillContent(article.content)

    // 保存草稿
    this._progress('保存草稿...')
    const result = await this._saveDraft()

    return result
  }

  async _fillTitle (title) {
    // 知乎标题输入框
    const titleInput = await this.page.$('.WriteIndex-titleInput, .DraftEditor-title, .title-input, .Editable-title')
    if (titleInput) {
      await titleInput.click()
      await titleInput.fill(title)
    } else {
      // fallback
      await this.page.evaluate((t) => {
        const el = document.querySelector('.WriteIndex-titleInput') ||
                   document.querySelector('.DraftEditor-title') ||
                   document.querySelector('.title-input')
        if (el) el.textContent = t
      }, title)
    }
    await smartWait(this.page, null, 500)
  }

  async _fillContent (contentHtml) {
    // 知乎编辑器使用 contenteditable
    const editor = await this.page.$('.DraftEditor-root, .Editable-editor, .ql-editor, [contenteditable="true"]')
    if (editor) {
      await editor.click()
      // 清空并写入 HTML
      await this.page.evaluate((html) => {
        const el = document.querySelector('.DraftEditor-root') ||
                    document.querySelector('.Editable-editor') ||
                    document.querySelector('.ql-editor') ||
                    document.querySelector('[contenteditable="true"]')
        if (el) {
          if (el.tagName === 'DIV' || el.tagName === 'SECTION') {
            el.innerHTML = html
          } else {
            el.focus()
            document.execCommand('insertHTML', false, html)
          }
        }
      }, contentHtml)
    } else {
      throw new Error('无法定位知乎编辑器')
    }
    await smartWait(this.page, null, 1000)
  }

  async _saveDraft () {
    // 点击"保存草稿"按钮
    const saveBtn = await this.page.$('button:has-text("保存草稿"), .WriteIndex-saveDraft, .PublishPanel-saveDraft')
    if (saveBtn) {
      await saveBtn.click()
      await smartWait(this.page, null, 2000)

      // 获取文章 URL
      const currentUrl = this.page.url()
      return {
        success: true,
        url: currentUrl,
        platform: 'zhihu'
      }
    }

    // 如果没有保存按钮，可能已自动保存
    return {
      success: true,
      url: this.page.url(),
      platform: 'zhihu'
    }
  }
}

module.exports = ZhiHuPublisher