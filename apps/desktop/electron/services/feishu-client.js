// @ts-check
/**
 * FeishuClient — 飞书开放平台 API 客户端
 *
 * 使用 Node.js 内置 https 模块（无额外依赖）。
 * 飞书返回格式 { code: 0, data } 与 IPC 层格式分开：本类只做飞书 API 调用，
 * 不做 setting 读写（由 IPC/service 层桥接）。
 */

const https = require('https')

const FEISHU_BASE = 'https://open.feishu.cn'
const TOKEN_PATH = '/open-apis/auth/v3/tenant_access_token/internal'

class FeishuClient {
  constructor (opts) {
    this._appId = (opts && opts.appId) || ''
    this._appSecret = (opts && opts.appSecret) || ''
    this._token = null
    this._tokenExpiresAt = 0
  }

  /**
   * 获取 tenant_access_token，缓存并在过期前 5 分钟刷新
   * @returns {Promise<string>}
   */
  async _getToken () {
    if (this._token && Date.now() < this._tokenExpiresAt - 300000) return this._token
    const data = JSON.stringify({ app_id: this._appId, app_secret: this._appSecret })
    const body = await this._request('POST', TOKEN_PATH, data, false)
    if (!body || body.code !== 0) {
      throw new Error('Feishu auth failed: ' + ((body && body.msg) || 'unknown error'))
    }
    if (!body.tenant_access_token) {
      throw new Error('Feishu auth failed: missing tenant_access_token')
    }
    this._token = body.tenant_access_token
    this._tokenExpiresAt = Date.now() + (body.expire || 7200) * 1000
    return this._token
  }

  /**
   * 发起 HTTPS 请求
   * @param {string} method
   * @param {string} path
   * @param {string|null} bodyString
   * @param {boolean} withAuth
   * @returns {Promise<object>}
   */
  _request (method, path, bodyString, withAuth) {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' }
      if (withAuth) {
        this._getToken().then((token) => {
          headers.Authorization = 'Bearer ' + token
          this._rawRequest(method, path, bodyString, headers, resolve, reject)
        }).catch(reject)
        return
      }
      this._rawRequest(method, path, bodyString, headers, resolve, reject)
    })
  }

  _rawRequest (method, path, bodyString, headers, resolve, reject) {
    const req = https.request(FEISHU_BASE + path, { method, headers }, (res) => {
      let body = ''
      res.on('data', (d) => { body += d })
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('error', reject)
    if (bodyString) req.write(bodyString)
    req.end()
  }

  /**
   * 测试连接：仅验证 token 获取成功
   * @returns {Promise<boolean>}
   */
  async testConnection () {
    await this._getToken()
    return true
  }

  /**
   * 创建文档
   * @param {string} title
   * @returns {Promise<string>} document_id
   */
  async createDocument (title) {
    const r = await this._fetch('POST', '/open-apis/docx/v1/documents', { title })
    if (r.code !== 0) throw new Error(r.msg || 'Create doc failed')
    if (!r.data || !r.data.document || !r.data.document.document_id) {
      throw new Error('Create doc failed: missing document_id')
    }
    return r.data.document.document_id
  }

  /**
   * 追加文本块内容到文档指定块
   * @param {string} docId
   * @param {string} blockId
   * @param {string} content
   * @returns {Promise<object>}
   */
  async appendContent (docId, blockId, content) {
    const body = {
      children: [{
        block_type: 2,
        text: { elements: [{ text_run: { content } }], style: {} },
      }],
    }
    const r = await this._fetch('POST', '/open-apis/docx/v1/documents/' + docId + '/blocks/' + blockId + '/children', body)
    if (r.code !== 0) throw new Error(r.msg || 'Append content failed')
    return r
  }

  /**
   * 带鉴权的飞书 API 调用（JSON body）
   * @param {string} method
   * @param {string} path
   * @param {object|null} body
   * @returns {Promise<object>}
   */
  async _fetch (method, path, body) {
    return this._request(method, path, body ? JSON.stringify(body) : null, true)
  }
}

module.exports = { FeishuClient }
