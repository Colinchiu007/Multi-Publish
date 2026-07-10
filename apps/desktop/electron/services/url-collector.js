// @ts-nocheck
/**
 * URL Collector — URL 内容采集引擎
 *
 * 输入 URL → 提取文章标题/正文/封面/发布时间
 *
 * 采集方式：
 *   1. HTTP 请求 + Cheerio 解析（轻量，首选）
 *
 * P2-E: 移除了 Playwright 浏览器渲染采集方式。
 * 文件位置: apps/desktop/electron/url-collector.js
 */
const { ipcMain } = require('electron')
// eslint-disable-next-line no-unused-vars
const log = require('./logger')
const EC = require('../core/error-codes').ERROR

class UrlCollector {
  constructor () {
    this._axios = null
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

    // 提取正文
    const article = $('article').first()
    const main = $('main').first()
    const contentEl = article.length ? article : (main.length ? main : $('body'))
    const textContent = contentEl.text().trim().replace(/\s+/g, ' ').slice(0, 50000)

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
   * 注册 IPC 处理器
   */
  registerIpcHandlers () {
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
