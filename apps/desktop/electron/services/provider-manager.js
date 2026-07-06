// @ts-check
/**
 * Provider Manager — LLM Provider 配置管理 (Electron 主进程模块)
 *
 * 桥接渲染进程 ↔ orchestrator Provider Admin/User API
 * 复用 viral-engine.js 的 HTTP 调用模式
 *
 * Admin API (prefix: /api/admin):
 *   GET    /providers           — 列出所有 Provider
 *   POST   /providers           — 创建新 Provider
 *   PUT    /providers/{name}    — 更新 Provider
 *   DELETE /providers/{name}    — 删除 Provider
 *   POST   /providers/{name}/test — 测试连接
 *
 * User API (prefix: /api/user):
 *   GET    /providers           — 按层级列出可用 Provider
 *   GET    /providers/{name}    — 获取单个（密钥脱敏）
 *   PUT    /providers/{name}/key   — 设置用户 API Key
 *   DELETE /providers/{name}/key   — 移除用户 Key 覆盖
 */
const { ipcMain } = require('electron')
const log = require('./logger')

const ORCHESTRATOR_BASE = process.env.ORCHESTRATOR_URL || 'http://localhost:8000'

class ProviderManager {
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
      const response = await axios({ method, url, data: body, timeout: 15000 })
      return { code: 0, data: response.data, message: 'ok' }
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail
      log.error('ProviderManager', `${method} ${path} failed: ${status} ${detail || err.message}`)
      return {
        code: status || -1,
        data: null,
        message: detail || err.message || '请求失败'
      }
    }
  }

  // ─── Admin CRUD ────────────────────────────────

  /** 列出所有 Provider */
  async listProviders () {
    return this._callApi('get', '/api/admin/providers')
  }

  /** 创建 Provider */
  async createProvider (data) {
    return this._callApi('post', '/api/admin/providers', data)
  }

  /** 更新 Provider */
  async updateProvider (name, data) {
    return this._callApi('put', `/api/admin/providers/${encodeURIComponent(name)}`, data)
  }

  /** 删除 Provider */
  async deleteProvider (name) {
    return this._callApi('delete', `/api/admin/providers/${encodeURIComponent(name)}`)
  }

  /** 测试连接 */
  async testProvider (name) {
    return this._callApi('post', `/api/admin/providers/${encodeURIComponent(name)}/test`)
  }

  // ─── User API ──────────────────────────────────

  /** 列出可用 Provider（按用户层级过滤） */
  async listUserProviders () {
    return this._callApi('get', '/api/user/providers')
  }

  /** 获取单个 Provider（密钥脱敏） */
  async getUserProvider (name) {
    return this._callApi('get', `/api/user/providers/${encodeURIComponent(name)}`)
  }

  /** 设置用户自己的 API Key */
  async setUserKey (name, apiKey, baseUrl) {
    return this._callApi('put', `/api/user/providers/${encodeURIComponent(name)}/key`, {
      api_key: apiKey,
      base_url: baseUrl || ''
    })
  }

  /** 移除用户 API Key 覆盖 */
  async deleteUserKey (name) {
    return this._callApi('delete', `/api/user/providers/${encodeURIComponent(name)}/key`)
  }

  // ─── IPC Handler 注册 ──────────────────────────

  registerIpcHandlers () {
    ipcMain.handle('provider:list', async () => {
      const result = await this.listProviders()
      return result
    })

    ipcMain.handle('provider:create', async (event, data) => {
      const result = await this.createProvider(data)
      return result
    })

    ipcMain.handle('provider:update', async (event, name, data) => {
      const result = await this.updateProvider(name, data)
      return result
    })

    ipcMain.handle('provider:delete', async (event, name) => {
      const result = await this.deleteProvider(name)
      return result
    })

    ipcMain.handle('provider:test', async (event, name) => {
      const result = await this.testProvider(name)
      return result
    })

        ipcMain.handle('provider:get-user', async (event, name) => {
      const result = await this.getUserProvider(name)
      return result
    })

    ipcMain.handle('provider:list-user', async () => {
      const result = await this.listUserProviders()
      return result
    })

    ipcMain.handle('provider:set-user-key', async (event, name, apiKey, baseUrl) => {
      const result = await this.setUserKey(name, apiKey, baseUrl)
      return result
    })

    ipcMain.handle('provider:delete-user-key', async (event, name) => {
      const result = await this.deleteUserKey(name)
      return result
    })
  }
}

module.exports = ProviderManager
