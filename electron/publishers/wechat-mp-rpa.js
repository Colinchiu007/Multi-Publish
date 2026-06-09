/**
 * 微信公众号 RPA 发布器
 *
 * 使用 Playwright 自动化操作 mp.weixin.qq.com
 * 流程: 登录检查 → 新建图文 → 填写内容 → 保存草稿
 */
const BaseRPAPublisher = require('./base-rpa-publisher')

const WECHAT_MP_URL = 'https://mp.weixin.qq.com/'
const LOGIN_TIMEOUT = 120000  // 扫码等待 2 分钟

class WeChatMPPublisher extends BaseRPAPublisher {
  constructor () {
    super('wechat_mp')
  }

  /**
   * 检查是否已登录
   */
  async checkLogin () {
    await this.page.goto(WECHAT_MP_URL, { waitUntil: 'networkidle' })

    // 登录后的页面会显示"首页"或"素材管理"等链接
    // 未登录则显示二维码 canvas
    const qrVisible = await this.page.$('canvas#login_page_wx_qr')
    if (qrVisible) {
      return false  // 需要扫码
    }

    // 检查是否已进入后台（登录态有效）
    const dashboard = await this.page.$('.index_main, .menu_box, a[href*="cgi-bin/home"]')
    if (dashboard) {
      return true
    }

    // fallback: 检查 URL 是否已跳转到后台页面
    const currentUrl = this.page.url()
    if (currentUrl.includes('cgi-bin/home') || currentUrl.includes('cgi-bin/appmsg')) {
      return true
    }

    // 未知状态，默认需要扫码
    return false
  }

  /**
   * 等待用户扫码
   */
  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    try {
      // 等待二维码消失 + 页面跳转到后台
      await Promise.race([
        this.page.waitForSelector('canvas#login_page_wx_qr', { state: 'hidden', timeout }),
        this.page.waitForSelector('.index_main, .menu_box', { timeout })
      ])
      return true
    } catch (e) {
      return false
    }
  }

  /**
   * 发布文章 (创建草稿，不群发)
   * 群发功能需要公众号高级权限，P0 只做"保存草稿"流程
   */
  async publish (article) {
    // 1. 进入素材管理 → 新建图文
    this._progress('进入素材管理...')
    await this._gotoDraftPage()

    // 2. 填写标题
    this._progress('填写标题...')
    await this._fillTitle(article.title)

    // 3. 填写正文
    this._progress('填写正文...')
    await this._fillContent(article.content)

    // 4. 填写作者（可选）
    if (article.author) {
      await this._fillAuthor(article.author)
    }

    // 5. 保存草稿
    this._progress('保存草稿...')
    const result = await this._saveDraft()

    return result
  }

  /**
   * 进入素材管理 → 新建图文
   */
  async _gotoDraftPage () {
    // 直接导航到新建图文页面
    await this.page.goto(
      'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=10&create=1',
      { waitUntil: 'networkidle' }
    )
    await this.page.waitForTimeout(2000)
  }

  /**
   * 填写标题
   */
  async _fillTitle (title) {
    // 标题输入框
    const titleInput = await this.page.$('#title, input.weui-desktop-input')
    if (titleInput) {
      await titleInput.click()
      await titleInput.fill(title)
    } else {
      // fallback: 通过 JS 设置
      await this.page.evaluate((t) => {
        const el = document.querySelector('#title') || document.querySelector('input.weui-desktop-input')
        if (el) el.value = t
      }, title)
    }
    await this.page.waitForTimeout(500)
  }

  /**
   * 填写正文 (HTML → 粘贴到编辑区)
   * 微信公众号编辑器使用 contenteditable iframe
   */
  async _fillContent (contentHtml) {
    // 等待编辑器 iframe 加载
    const editorFrame = await this._getEditorFrame()
    if (!editorFrame) {
      throw new Error('无法定位编辑器 iframe')
    }

    // 清空编辑器内容并写入新内容
    await editorFrame.evaluate((html) => {
      const editor = document.querySelector('#js_editor_content') ||
                     document.querySelector('.rich_media_area_primary_inner') ||
                     document.querySelector('[contenteditable="true"]')
      if (editor) {
        editor.innerHTML = html
      }
    }, contentHtml)

    await this.page.waitForTimeout(1000)
  }

  /**
   * 获取编辑器 iframe
   */
  async _getEditorFrame () {
    // 尝试多种选择器找到编辑器 iframe
    const selectors = [
      'iframe#ueditor_0',
      'iframe[src*="ueditor"]',
      '.rich_media_area_primary_inner',
      '.appmsg_editor'
    ]

    for (const sel of selectors) {
      if (sel.startsWith('iframe')) {
        const element = await this.page.$(sel)
        if (element) {
          const frame = await element.contentFrame()
          if (frame) return frame
        }
      } else {
        // contenteditable 直接在页面中
        const el = await this.page.$(sel)
        if (el) {
          // 模拟一个虚拟 frame（其实就是主页面）
          return {
            evaluate: (fn, ...args) => this.page.evaluate(fn, ...args)
          }
        }
      }
    }

    // 最后尝试：看看有没有 contenteditable 元素
    const hasEditable = await this.page.evaluate(() => {
      return document.querySelector('[contenteditable="true"]') !== null
    })
    if (hasEditable) {
      return {
        evaluate: (fn, ...args) => this.page.evaluate(fn, ...args)
      }
    }

    return null
  }

  /**
   * 填写作者
   */
  async _fillAuthor (author) {
    // 作者输入框
    const authorInput = await this.page.$('#author, input[name="author"]')
    if (authorInput) {
      await authorInput.click()
      await authorInput.fill(author)
      await this.page.waitForTimeout(300)
    }
  }

  /**
   * 保存草稿
   */
  async _saveDraft () {
    // 勾选"我同意"（如果有）
    const agreeCheckbox = await this.page.$('.weui-desktop-btn_wrp .weui-desktop-checkbox, input#js_agree')
    if (agreeCheckbox) {
      const checked = await agreeCheckbox.isChecked()
      if (!checked) {
        await agreeCheckbox.click()
        await this.page.waitForTimeout(300)
      }
    }

    // 点击"保存"按钮
    const saveBtn = await this.page.$('a[data-action="save"], a#js_sync_save, a:has-text("保存")')
    if (!saveBtn) {
      // 如果找不到保存按钮，可能已经自动保存了
      return { success: true, url: this.page.url(), mediaId: null }
    }

    await saveBtn.click()

    // 等待保存完成（弹窗或 URL 变化）
    try {
      await this.page.waitForSelector('.weui-desktop-toast_wrp, .dialog_bd, .toast', { timeout: 10000 })
      await this.page.waitForTimeout(1000)

      // 获取文章 URL / media_id
      const currentUrl = this.page.url()
      const mediaId = currentUrl.match(/appmsgid=(\d+)/)
      return {
        success: true,
        url: currentUrl,
        mediaId: mediaId ? mediaId[1] : null
      }
    } catch (e) {
      // 超时可能页面已经跳转
      await this.page.waitForTimeout(2000)
      return {
        success: true,
        url: this.page.url(),
        mediaId: null
      }
    }
  }
}

module.exports = WeChatMPPublisher