/**
 * ProxyPool — 代理池轮换 + 健康检查
 *
 * 管理 HTTP/HTTPS/SOCKS5 代理列表，支持：
 * - 添加/移除代理
 * - Round-robin 轮换
 * - 健康检查（测试可达性 + 延迟）
 * - 自动移除失效代理
 * - 事件通知
 */
const EventEmitter = require('events')
const crypto = require('crypto')
const http = require('http')
const https = require('https')
const { URL } = require('url')

class ProxyPool extends EventEmitter {
  constructor (options = {}) {
    super()
    this._proxies = []
    this._currentIndex = 0

    if (options.proxies && Array.isArray(options.proxies)) {
      for (const p of options.proxies) {
        this._proxies.push(this._createProxy(p.host, p.port, p.type || 'http'))
      }
    }
  }

  /**
   * 添加单个代理
   * @param {string} host
   * @param {number} port
   * @param {string} [type='http']  - http | https | socks5
   * @returns {string} proxy id
   */
  addProxy (host, port, type = 'http') {
    if (!host || host.trim() === '') {
      throw new Error('Proxy host is required')
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Proxy port must be between 1 and 65535')
    }

    const proxy = this._createProxy(host, port, type)
    this._proxies.push(proxy)
    this.emit('proxy:added', proxy)
    return proxy.id
  }

  /**
   * 批量添加代理
   * @param {Array<{host, port, type?}>} proxies
   */
  addProxies (proxies) {
    if (!proxies || proxies.length === 0) return
    for (const p of proxies) {
      this.addProxy(p.host, p.port, p.type)
    }
  }

  /**
   * 轮换获取下一个可用代理
   * @returns {object} proxy object
   */
  getNextProxy () {
    const alive = this._proxies.filter(p => p.alive !== false)
    if (alive.length === 0) {
      throw new Error('Proxy pool is empty or all proxies are dead')
    }

    // 从当前索引开始找下一个 alive 的代理
    for (let i = 0; i < this._proxies.length; i++) {
      const idx = (this._currentIndex + i) % this._proxies.length
      if (this._proxies[idx].alive !== false) {
        this._currentIndex = (idx + 1) % this._proxies.length
        return this._proxies[idx]
      }
    }

    throw new Error('No alive proxy available')
  }

  /**
   * 测试单个代理连通性
   * @param {string} id - proxy id
   * @param {object} [opts] - { testUrl, timeout }
   * @returns {Promise<{id, alive, latency}>}
   */
  async testProxy (id, opts = {}) {
    const proxy = this.getProxy(id)
    if (!proxy) return { id, alive: false, latency: 0 }

    const testUrl = opts.testUrl || 'http://httpbin.org/ip'
    const timeout = opts.timeout || 5000
    const start = Date.now()

    try {
      await this._testConnection(proxy, testUrl, timeout)
      const latency = Date.now() - start
      proxy.alive = true
      proxy.latency = latency
      proxy.lastTested = Date.now()
      proxy.failCount = 0
      this.emit('proxy:tested', { id: proxy.id, alive: true, latency })
      return { id: proxy.id, alive: true, latency }
    } catch (err) {
      proxy.alive = false
      proxy.latency = 0
      proxy.lastTested = Date.now()
      proxy.failCount = (proxy.failCount || 0) + 1
      this.emit('proxy:tested', { id: proxy.id, alive: false, latency: 0, error: err.message })
      return { id: proxy.id, alive: false, latency: 0 }
    }
  }

  /**
   * 测试所有代理
   * @param {object} [opts] - { timeout }
   * @returns {Promise<Array<{id, alive, latency}>>}
   */
  async testAll (opts = {}) {
    const promises = this._proxies.map(p => this.testProxy(p.id, opts))
    return Promise.all(promises)
  }

  /**
   * 按 ID 移除代理
   * @param {string} id
   * @returns {boolean}
   */
  remove (id) {
    const idx = this._proxies.findIndex(p => p.id === id)
    if (idx === -1) return false
    const proxy = this._proxies.splice(idx, 1)[0]
    this.emit('proxy:removed', proxy)
    if (this._currentIndex >= this._proxies.length) {
      this._currentIndex = 0
    }
    return true
  }

  /**
   * 移除所有失效代理
   * @returns {number} 移除数量
   */
  removeDead () {
    const before = this._proxies.length
    this._proxies = this._proxies.filter(p => p.alive !== false)
    const removed = before - this._proxies.length
    if (this._currentIndex >= this._proxies.length) {
      this._currentIndex = 0
    }
    return removed
  }

  /**
   * 清空代理池
   */
  reset () {
    this._proxies = []
    this._currentIndex = 0
  }

  /**
   * 获取代理数量
   * @returns {number}
   */
  size () {
    return this._proxies.length
  }

  /**
   * 按 ID 获取代理
   * @param {string} id
   * @returns {object|null}
   */
  getProxy (id) {
    return this._proxies.find(p => p.id === id) || null
  }

  /**
   * 获取所有代理（副本）
   * @returns {Array}
   */
  getProxies () {
    return [...this._proxies]
  }

  /**
   * 检查代理是否存活
   * @param {string} id
   * @returns {boolean|null}
   */
  isAlive (id) {
    const proxy = this.getProxy(id)
    if (!proxy) return null
    return proxy.alive !== false
  }

  /**
   * 获取池状态
   * @returns {{ total, alive, dead }}
   */
  getStatus () {
    const total = this._proxies.length
    const alive = this._proxies.filter(p => p.alive !== false).length
    return { total, alive, dead: total - alive }
  }

  // ── 内部方法 ─────────────────────────────────────────────────

  _createProxy (host, port, type) {
    return {
      id: `proxy_${crypto.randomBytes(4).toString('hex')}`,
      host,
      port,
      type: type || 'http',
      alive: true,
      latency: 0,
      lastTested: null,
      failCount: 0,
    }
  }

  _testConnection (proxy, testUrl, timeout) {
    return new Promise((resolve, reject) => {
      const url = new URL(testUrl)
      const isHttps = url.protocol === 'https:'
      const transport = isHttps ? https : http

      const options = {
        hostname: proxy.host,
        port: proxy.port,
        path: url.pathname + (url.search || ''),
        method: 'GET',
        timeout,
        headers: { Host: url.hostname },
      }

      const req = transport.request(options, (res) => {
        resolve(res.statusCode)
      })

      req.on('error', (err) => reject(err))
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Connection timed out'))
      })

      req.end()
    })
  }
}

module.exports = ProxyPool
