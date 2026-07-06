// @ts-check
/**
 * Viral Engine — 爆款分析引擎 (Electron 主进程模块)
 *
 * 桥接渲染进程 ↔ orchestrator API (port 8000)
 *
 * 功能：
 *   1. viral:analyze   — 爆款因子分析
 *   2. viral:generate  — 爆款文案生成（标题/Hook/改写/结构）
 *   3. viral:trending  — 平台趋势洞察
 */
const { ipcMain } = require('electron')
const log = require('./logger')

const ORCHESTRATOR_BASE = process.env.ORCHESTRATOR_URL || 'http://localhost:8000'

class ViralEngine {
  constructor () {
    this._axios = null
  }

  _getAxios () {
    if (!this._axios) {
      this._axios = require('axios')
    }
    return this._axios
  }

  async _callApi (method, path, body) {
    const axios = this._getAxios()
    const url = `${ORCHESTRATOR_BASE}${path}`
    try {
      const response = await axios({ method, url, data: body, timeout: 120000 })
      return { code: 0, data: response.data, message: 'ok' }
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail
      log.error('ViralEngine', `${method} ${path} failed: ${status} ${detail || err.message}`)
      return {
        code: status || -1,
        data: null,
        message: detail || err.message || '请求失败'
      }
    }
  }

  /**
   * 爆款因子分析
   */
  async analyze (articles, topic) {
    return this._callApi('post', '/api/viral/analyze', {
      articles,
      topic: topic || '',
    })
  }

  /**
   * 爆款文案生成
   */
  async generate (opts) {
    return this._callApi('post', '/api/viral/generate', {
      topic: opts.topic || '',
      content: opts.content || '',
      platform: opts.platform || '通用',
      task: opts.task || 'titles',
      style: opts.style || '自动适配',
      count: opts.count || 5,
    })
  }

  /**
   * 趋势洞察
   */
  async trending (articles) {
    return this._callApi('post', '/api/viral/trending', {
      articles: articles || [],
    })
  }

  registerIpcHandlers () {
    ipcMain.handle('viral:analyze', async (event, { articles, topic }) => {
      const result = await this.analyze(articles, topic)
      // Pass through orchestrator response directly
      if (result.code === 0 && result.data) {
        return result.data
      }
      return { success: false, error: result.message }
    })

    ipcMain.handle('viral:generate', async (event, opts) => {
      const result = await this.generate(opts)
      if (result.code === 0 && result.data) {
        return result.data
      }
      return { success: false, error: result.message }
    })

    ipcMain.handle('viral:trending', async (event, { articles }) => {
      const result = await this.trending(articles)
      if (result.code === 0 && result.data) {
        return result.data
      }
      return { success: false, error: result.message }
    })
  }
}

module.exports = ViralEngine
