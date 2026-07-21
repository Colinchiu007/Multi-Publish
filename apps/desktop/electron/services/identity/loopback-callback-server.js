const http = require('http')
const crypto = require('crypto')
const { IdentityError } = require('./identity-errors')

function validState(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,512}$/.test(value)
}

function sameState(actual, expected) {
  if (!validState(actual) || !validState(expected)) return false
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

class LoopbackCallbackServer {
  constructor(options = {}) {
    this._host = options.host || '127.0.0.1'
    this._port = options.port === undefined ? 16526 : options.port
    this._callbackPath = options.callbackPath || '/auth/callback'
    this._timeoutMs = options.timeoutMs || 120000
    this._expectedState = options.expectedState
    if (!validState(this._expectedState)) {
      throw new IdentityError('IDENTITY_CALLBACK_STATE_INVALID', '登录回调 state 无效')
    }
    this._server = null
    this._timer = null
    this._settled = false
    this._callbackClaimed = false
    this._callbackPromise = new Promise((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }

  waitForCallback() {
    return this._callbackPromise
  }

  async start() {
    if (this._server) throw new IdentityError('IDENTITY_CALLBACK_ALREADY_STARTED', '回调服务已经启动')
    this._server = http.createServer((request, response) => this._handleRequest(request, response))
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this._server.removeListener('listening', onListening)
        reject(new IdentityError('IDENTITY_CALLBACK_PORT_UNAVAILABLE', '登录回调端口不可用', error))
      }
      const onListening = () => {
        this._server.removeListener('error', onError)
        resolve()
      }
      this._server.once('error', onError)
      this._server.once('listening', onListening)
      this._server.listen(this._port, this._host)
    })
    this._timer = setTimeout(() => {
      this._settleReject(new IdentityError('IDENTITY_CALLBACK_TIMEOUT', '登录回调超时'))
    }, this._timeoutMs)
    if (this._timer.unref) this._timer.unref()
    return this._server.address().port
  }

  _handleRequest(request, response) {
    if (request.method !== 'GET') {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET' })
      response.end('仅支持 GET')
      return
    }
    const address = this._server && this._server.address()
    const expectedHost = `${this._host}:${address && address.port}`
    if (request.headers.host !== expectedHost) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('登录回调 Host 无效')
      return
    }
    let requestUrl
    try {
      requestUrl = new URL(request.url || '/', `http://${expectedHost}`)
    } catch {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('登录回调地址无效')
      return
    }
    if (requestUrl.pathname !== this._callbackPath) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('未找到登录回调')
      return
    }
    if (this._settled || this._callbackClaimed) {
      response.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('登录回调已处理')
      return
    }
    const states = requestUrl.searchParams.getAll('state')
    const codes = requestUrl.searchParams.getAll('code')
    const errors = requestUrl.searchParams.getAll('error')
    const hasCode = codes.length === 1 && codes[0].length > 0 && codes[0].length <= 4096
    const hasError = errors.length === 1 && errors[0].length > 0 && errors[0].length <= 256
    if (states.length !== 1 || !sameState(states[0], this._expectedState) || hasCode === hasError) {
      response.writeHead(400, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      response.end('登录回调参数无效')
      return
    }
    this._callbackClaimed = true
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    response.end('<!doctype html><meta charset="utf-8"><title>登录完成</title><p>登录已完成，可以关闭此窗口。</p>', () => {
      this._settleResolve(`http://${expectedHost}${requestUrl.pathname}${requestUrl.search}`)
    })
  }

  _settleResolve(value) {
    if (this._settled) return
    this._settled = true
    clearTimeout(this._timer)
    this._resolve(value)
    void this.stop()
  }

  _settleReject(error) {
    if (this._settled) return
    this._settled = true
    clearTimeout(this._timer)
    this._reject(error)
    void this.stop()
  }

  async cancel() {
    this._settleReject(new IdentityError('IDENTITY_SIGN_IN_CANCELLED', '登录已取消'))
    await this.stop()
  }

  async stop() {
    clearTimeout(this._timer)
    const server = this._server
    this._server = null
    if (!server || !server.listening) return
    await new Promise((resolve) => server.close(() => resolve()))
  }
}

module.exports = { LoopbackCallbackServer, validState, sameState }
