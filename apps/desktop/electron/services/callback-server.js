// @ts-check
/**
 * CallbackServer — 实时回调服务器
 *
 * 蚁小二逆向工程 P1 功能：
 * - 轻量 HTTP 服务器，接收外部服务回调
 * - 心跳 59s 保活
 * - 回调数据通过 IPC 转发到渲染进程
 *
 * 端口：16521（避免常见端口冲突）
 *
 * 端点:
 *   GET  /health     — 健康检查
 *   POST /callback   — 接收回调 JSON（发布状态/评论通知/数据采集等）
 */
const http = require('http')
const log = require('./logger')

const DEFAULT_PORT = 16521
const HEARTBEAT_MS = 59000  // 59s

class CallbackServer {
  constructor () {
    this.server = null
    this.port = DEFAULT_PORT
    this._heartbeatTimer = null
    this._onCallback = null
    this._requestCount = 0
    this._startTime = 0
  }

  /**
   * 启动服务器
   * @param {function} onCallback - (data: object) => void 收到回调时触发
   * @param {number} [port] - 监听端口，默认 16521
   * @returns {Promise<number>} 实际端口
   */
  start (onCallback, port) {
    this.port = port || DEFAULT_PORT
    this._onCallback = onCallback
    this._startTime = Date.now()

    this.server = http.createServer((req, res) => this._handleRequest(req, res))

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, '127.0.0.1', () => {
        log.info('CallbackServer', `Listening on http://127.0.0.1:${this.port}`)
        this._startHeartbeat()
        resolve(this.port)
      })
      this.server.on('error', (err) => {
        log.error('CallbackServer', `Failed to start: ${err.message}`)
        reject(err)
      })
    })
  }

  _handleRequest (req, res) {
    this._requestCount++

    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // ── GET /health — 健康检查 ──────────────
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        uptime: Math.round((Date.now() - this._startTime) / 1000),
        requests: this._requestCount,
        timestamp: Date.now(),
      }))
      return
    }

    // ── POST /callback — 接收外部回调 ────────
    if (req.method === 'POST' && req.url === '/callback') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        let data
        try {
          data = JSON.parse(body)
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ code: -1, message: `Invalid JSON: ${e.message}` }))
          return
        }

        log.debug('CallbackServer', `Callback received: ${JSON.stringify(data).slice(0, 300)}`)

        if (this._onCallback) {
          this._onCallback(data)
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ code: 0, message: 'ok', timestamp: Date.now() }))
      })
      return
    }

    // ── 404 ─────────────────────────────────
    res.writeHead(404)
    res.end('Not Found')
  }

  _startHeartbeat () {
    this._stopHeartbeat()
    this._heartbeatTimer = setInterval(() => {
      log.debug('CallbackServer', `♥ ${this._requestCount} requests since start`)
    }, HEARTBEAT_MS)
    this._heartbeatTimer.unref()  // 不阻止进程退出
  }

  _stopHeartbeat () {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
  }

  /** 停止服务器 */
  stop () {
    this._stopHeartbeat()
    if (this.server) {
      this.server.close()
      this.server = null
      log.info('CallbackServer', 'Stopped')
    }
  }
}

module.exports = CallbackServer