// @ts-check
/**
 * URL Collector — URL 内容采集引擎
 *
 * 输入 URL → 提取文章标题/正文/封面/发布时间
 *
 * 采集方式：
 *   1. HTTP 请求 + Cheerio 解析（轻量，首选）
   *   2. Playwright stealth 浏览器（知乎、百家号等反爬/SPA 站点）
 *
 * 文件位置: apps/desktop/electron/url-collector.js
 */
const { ipcMain } = require('electron')
// eslint-disable-next-line no-unused-vars
const log = require('./logger')
const EC = require('../core/error-codes').ERROR

class UrlCollector {
  constructor () {
    this._axios = null
    this._stealthBrowser = null
  }

  /**
   * 懒加载 axios
   */
  _getAxios () {
    if (!this._axios) {
      this._axios = require('axios')
    }
    return this._axios
  }

  /**
   * 从 URL 采集内容
   * @param {string} url
   * @returns {Promise<object>} { title, content, coverImage, description, publishTime, source, success }
   */
  async collect (url) {
    if (!url || typeof url !== 'string') {
      return { success: false, error: '无效的 URL' }
    }

    // 校验 URL 格式 + 协议白名单 + 内网 IP 防护（防 SSRF）
    let parsedUrl
    try {
      parsedUrl = new URL(url)
    // eslint-disable-next-line no-unused-vars
    } catch (e) {
      return { success: false, error: 'URL 格式不正确' }
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { success: false, error: '仅支持 http/https 协议' }
    }
    // 拒绝内网地址（防止 SSRF 探测内部服务如 Python 后端 127.0.0.1:8299）
    const hostname = parsedUrl.hostname.toLowerCase()
    const isInternal = hostname === 'localhost' ||
      hostname === '::1' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.startsWith('169.254.') ||
      hostname.endsWith('.local')
    if (isInternal) {
      return { success: false, error: '不允许采集内网地址' }
    }

    try {
      const hostname = new URL(url).hostname.toLowerCase()
      if (this._needsBrowser(hostname)) {
        return await this._collectViaBrowser(url)
      }
      return await this._collectViaHttp(url)
    } catch (e) {
      return { success: false, error: `采集失败: ${e.message}` }
    }
  }

  /**
   * HTTP 方式采集（Cheerio 解析）
   */
  async _collectViaHttp (url) {
    const axios = this._getAxios()

    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      responseType: 'text',
      maxRedirects: 5,
    })

    const html = response.data
    return this._parseHtml(html, url)
  }

  /**
   * 解析 HTML（Cheerio）
   */
  _parseHtml (html, url) {
    const cheerio = require('cheerio')
    const $ = cheerio.load(html)

    const getMeta = (name) => {
      const el = $(`meta[property="${name}"], meta[name="${name}"]`).first()
      return el.attr('content') || ''
    }

    // 提取标题
    const title = getMeta('og:title') || $('title').first().text() || ''

    // 提取描述
    const description = getMeta('og:description') || getMeta('description') || ''

    // 提取封面图
    const coverImage = getMeta('og:image') || getMeta('twitter:image') || ''

    // 提取发布时间
    const publishTime = getMeta('article:published_time') ||
                        getMeta('pubdate') ||
                        $('time[datetime]').first().attr('datetime') || ''

    // 提取站点名
    const source = getMeta('og:site_name') || new URL(url).hostname

    // 提取正文 — 按平台分派优先选择器，逐级回退
    const hostname = new URL(url).hostname.toLowerCase()
    let contentEl

    let textContent = ''

    // 知乎专栏文章：正文在 .Post-RichTextContainer > .RichText
    if (hostname === 'zhuanlan.zhihu.com') {
      contentEl = $('.Post-RichTextContainer').first()
      if (!contentEl.length) contentEl = $('.RichText.ztext.Post-RichText').first()
    }

    // 知乎问题/回答：正文在 .RichContent-inner
    if ((!contentEl || !contentEl.length) && (hostname === 'www.zhihu.com' || hostname === 'zhihu.com')) {
      contentEl = $('.RichContent-inner').first()
      if (!contentEl.length) contentEl = $('.RichText.ztext').first()
    }

    // 百家号：SPA 渲染，class 名每次构建混淆变化，正文稳定在 <p> 段落标签中。
    // 采用「段落聚合」策略：取包含最多 <p> 的元素作为正文容器，再聚合其内所有非空段落。
    if (hostname === 'baijiahao.baidu.com') {
      const containers = $('[class]').get()
      let bestContainer = null
      let bestParagraphCount = -1
      for (const el of containers) {
        const pCount = $(el).find('p').length
        if (pCount > bestParagraphCount) {
          bestParagraphCount = pCount
          bestContainer = el
        }
      }
      if (bestContainer && bestParagraphCount > 0) {
        const paragraphs = []
        $(bestContainer).find('p').each((_i, p) => {
          const t = $(p).text().trim()
          if (t) paragraphs.push(t)
        })
        textContent = paragraphs.join('\n').slice(0, 50000)
      }
      // 百家号标题回退到 h1 或 title
      if (!title) title = $('h1').first().text().trim() || title
    }

    // 通用回退：article → main → body（textContent 仍为空时才走）
    if (!textContent) {
      if (!contentEl || !contentEl.length) {
        contentEl = $('article').first()
      }
      if (!contentEl || !contentEl.length) {
        contentEl = $('main').first()
      }
      if (!contentEl || !contentEl.length) {
        contentEl = $('body')
      }
      textContent = contentEl.text().trim().replace(/\s+/g, ' ').slice(0, 50000)
    }

    return {
      success: true,
      title,
      description,
      content: textContent,
      coverImage,
      publishTime,
      source,
      url,
    }
  }

  /**
   * 判断是否需要浏览器渲染（反爬站点）
   */
  _needsBrowser (hostname) {
    return hostname === 'zhuanlan.zhihu.com' ||
      hostname === 'www.zhihu.com' ||
      hostname === 'zhihu.com' ||
      hostname === 'baijiahao.baidu.com'
  }

  /**
   * Playwright stealth 浏览器采集（绕过反爬）
   */
  async _collectViaBrowser (url) {
    const { chromium } = require('playwright-extra')
    const StealthPlugin = require('puppeteer-extra-plugin-stealth')
    chromium.use(StealthPlugin())

    if (!this._stealthBrowser) {
      this._stealthBrowser = await chromium.launch({ headless: true })
    }
    const context = await this._stealthBrowser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
    })
    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(2000)
      const html = await page.content()
      return this._parseHtml(html, url)
    } finally {
      await context.close()
    }
  }

  /**
   * 注册 IPC 处理器
   */
  registerIpcHandlers (injectedIpcMain) {
    const ipcMain = injectedIpcMain || require("electron").ipcMain;
    ipcMain.handle('url-collect:fetch', async (event, arg) => {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { url } = arg
      try {
        const result = await this.collect(url)
        return { code: result.success ? 0 : -1, data: result }
      } catch (e) {
        return { code: EC.REQUEST_ERROR, message: e.message }
      }
    })
  }
}

module.exports = UrlCollector
