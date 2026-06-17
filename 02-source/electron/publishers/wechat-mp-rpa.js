/**
 * 微信公众号 RPA 发布器
 *
 * 使用 Playwright 自动化操作 mp.weixin.qq.com
 * 流程: 登录检查 → 新建图文 → 填写内容 → 保存草稿 → [群发]
 */
const BaseRPAPublisher = require('./base-rpa-publisher')
const { smartWait } = require('../playwright-manager')

const WECHAT_MP_URL = 'https://mp.weixin.qq.com/'
const LOGIN_TIMEOUT = 120000  // 扫码等待 2 分钟

class WeChatMPPublisher extends BaseRPAPublisher {
  constructor () {
    super('wechat_mp')
  }

  async checkLogin () {
    await this.page.goto(WECHAT_MP_URL, { waitUntil: 'networkidle' })
    const qrVisible = await this.page.$('canvas#login_page_wx_qr')
    if (qrVisible) return false
    const dashboard = await this.page.$('.index_main, .menu_box, a[href*="cgi-bin/home"]')
    if (dashboard) return true
    const currentUrl = this.page.url()
    if (currentUrl.includes('cgi-bin/home') || currentUrl.includes('cgi-bin/appmsg')) return true
    return false
  }

  async waitForLogin (timeout = LOGIN_TIMEOUT) {
    try {
      await Promise.race([
        this.page.waitForSelector('canvas#login_page_wx_qr', { state: 'hidden', timeout }),
        this.page.waitForSelector('.index_main, .menu_box', { timeout })
      ])
      return true
    } catch (e) {
      return false
    }
  }

  async publish (article) {
    this._progress('进入素材管理...')
    await this._gotoDraftPage()

    this._progress('填写标题...')
    await this._fillTitle(article.title)

    this._progress('填写正文...')
    await this._fillContent(article.content)

    if (article.author) {
      await this._fillAuthor(article.author)
    }

    this._progress('保存草稿...')
    const draftResult = await this._saveDraft()

    if (article.massSend && draftResult.mediaId) {
      this._progress('正在群发...')
      const massResult = await this._massSend(draftResult.mediaId)
      return { ...draftResult, massSend: massResult }
    }
    return draftResult
  }

  async _gotoDraftPage () {
    await this.page.goto(
      'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=10&create=1',
      { waitUntil: 'networkidle' }
    )
    await smartWait(this.page, null, 2000)
  }

  async _fillTitle (title) {
    const titleInput = await this.page.$('#title, input.weui-desktop-input')
    if (titleInput) {
      await titleInput.click()
      await titleInput.fill(title)
    } else {
      await this.page.evaluate((t) => {
        const el = document.querySelector('#title') || document.querySelector('input.weui-desktop-input')
        if (el) el.value = t
      }, title)
    }
    await smartWait(this.page, null, 500)
  }

  async _fillContent (contentHtml) {
    const editorFrame = await this._getEditorFrame()
    if (!editorFrame) throw new Error('无法定位编辑器 iframe')
    await editorFrame.evaluate((html) => {
      const editor = document.querySelector('#js_editor_content') ||
                     document.querySelector('.rich_media_area_primary_inner') ||
                     document.querySelector('[contenteditable="true"]')
      if (editor) editor.innerHTML = html
    }, contentHtml)
    await smartWait(this.page, null, 1000)
  }

  async _getEditorFrame () {
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
        const el = await this.page.$(sel)
        if (el) {
          return { evaluate: (fn, ...args) => this.page.evaluate(fn, ...args) }
        }
      }
    }
    const hasEditable = await this.page.evaluate(() => {
      return document.querySelector('[contenteditable="true"]') !== null
    })
    if (hasEditable) {
      return { evaluate: (fn, ...args) => this.page.evaluate(fn, ...args) }
    }
    return null
  }

  async _fillAuthor (author) {
    const authorInput = await this.page.$('#author, input[name="author"]')
    if (authorInput) {
      await authorInput.click()
      await authorInput.fill(author)
      await smartWait(this.page, null, 300)
    }
  }

  async _saveDraft () {
    const agreeCheckbox = await this.page.$('.weui-desktop-btn_wrp .weui-desktop-checkbox, input#js_agree')
    if (agreeCheckbox) {
      const checked = await agreeCheckbox.isChecked()
      if (!checked) {
        await agreeCheckbox.click()
        await smartWait(this.page, null, 300)
      }
    }
    const saveBtn = await this.page.$('a[data-action="save"], a#js_sync_save, a:has-text("保存")')
    if (!saveBtn) {
      return { success: true, url: this.page.url(), mediaId: null }
    }
    await saveBtn.click()
    try {
      await this.page.waitForSelector('.weui-desktop-toast_wrp, .dialog_bd, .toast', { timeout: 10000 })
      await smartWait(this.page, null, 1000)
      const currentUrl = this.page.url()
      const mediaId = currentUrl.match(/appmsgid=(\d+)/)
      return { success: true, url: currentUrl, mediaId: mediaId ? mediaId[1] : null }
    } catch (e) {
      await smartWait(this.page, null, 2000)
      return { success: true, url: this.page.url(), mediaId: null }
    }
  }

  async _massSend (mediaId) {
    await this.page.goto(
      'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&type=10&action=list',
      { waitUntil: 'networkidle' }
    )
    await smartWait(this.page, null, 2000)
    await this.page.evaluate((id) => {
      const row = document.querySelector(`[appmsgid="${id}"]`)
      if (row) row.click()
    }, mediaId)
    const massBtn = await this.page.$('a.btn_masssend, a[data-action="masssend"], a:has-text("群发")')
    if (!massBtn) {
      const publishBtn = await this.page.$('a.btn_publish, a:has-text("发布")')
      if (publishBtn) {
        await publishBtn.click()
      } else {
        return { success: false, error: '未找到群发按钮' }
      }
    } else {
      await massBtn.click()
    }
    await smartWait(this.page, null, 2000)
    const confirmBtn = await this.page.$('.dialog_bd_btn a:has-text("确定"), .weui-desktop-btn:has-text("确定"), a:has-text("群发")')
    if (confirmBtn) await confirmBtn.click()
    await smartWait(this.page, null, 3000)
    return { success: true }
  }
}

module.exports = WeChatMPPublisher