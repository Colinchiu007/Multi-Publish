// @ts-check
/**
 * BasePythonBridge — Python 子进程管理基类
 *
 * 提供 Python FastAPI 服务的通用生命周期管理：
 *   - spawn 子进程 + 30s 超时保护
 *   - 轮询健康检查（/health 端点）
 *   - 30s watchdog 守护定时器
 *   - 崩溃自动重启（最多 3 次，递增延迟 2s/4s/6s... 上限 10s）
 *   - Windows taskkill /F /T 强制停止
 *   - attach 模式（附加到外部已运行服务）
 *   - 通用 POST 请求封装
 *
 * 子类需提供：
 *   - constructor 调用 super({ name, pythonModule, port, host, workDir, log, requestTimeout })
 *   - 业务方法（如 split / optimize）
 *
 * @example
 * class MyBridge extends BasePythonBridge {
 *   constructor({ log } = {}) {
 *     super({ name: 'MyBridge', pythonModule: 'my_app.api', port: 8000, host: '127.0.0.1', workDir: '/app', log })
 *   }
 *   fetchData(query) { return this._post('/v1/fetch', JSON.stringify({ query })) }
 * }
 */
'use strict'

const { spawn, spawnSync } = require('child_process')
const http = require('http')

const HEALTH_CHECK_INTERVAL = 500
const HEALTH_CHECK_TIMEOUT = 10000
const WATCHDOG_INTERVAL = 30000
const MAX_RESTARTS = 3

/**
 * 创建带 HTTP 语义的 bridge 错误，供上层区分“服务已响应但业务失败”和传输故障。
 * @param {number} statusCode
 * @param {unknown} detail
 * @param {object} [context]
 * @returns {Error & { statusCode: number, detail: unknown, isHttpError: true }}
 */
function createBridgeHttpError (statusCode, detail, context = {}) {
  const normalizedStatus = Number(statusCode)
  let detailText
  if (typeof detail === 'string') {
    detailText = detail
  } else {
    try { detailText = JSON.stringify(detail) || String(detail) } catch (_) { detailText = String(detail) }
  }
  const error = new Error('HTTP ' + normalizedStatus + ': ' + detailText)
  error.name = 'PythonBridgeHttpError'
  error.statusCode = normalizedStatus
  error.detail = detail
  error.isHttpError = true
  Object.assign(error, context)
  return error
}

/**
 * @param {string} bridgeName
 * @returns {Error & { code: string, isTimeout: true, isTransportError: true }}
 */
function createBridgeTimeoutError (bridgeName) {
  const error = new Error(bridgeName + ' request timeout')
  error.name = 'PythonBridgeTimeoutError'
  error.code = 'ETIMEDOUT'
  error.isTimeout = true
  error.isTransportError = true
  return error
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isBridgeHttpError (error) {
  if (!error || typeof error !== 'object') return false
  if (error.isHttpError === true || error.name === 'PythonBridgeHttpError') return true
  return false
}

class BasePythonBridge {
  /**
   * @param {object} config
   * @param {string} config.name - 日志标签（如 'SplitterBridge'）
   * @param {string} config.pythonModule - Python 模块路径（如 'splitter.api.rest_api'）
   * @param {number} config.port - 端口
   * @param {string} config.host - 主机
   * @param {string} config.workDir - 工作目录
   * @param {any} [config.log] - 日志模块
   * @param {number} [config.requestTimeout] - 默认请求超时 ms（默认 30000）
   */
  constructor ({ name, pythonModule, port, host, workDir, log, requestTimeout }) {
    this.name = name
    this.pythonModule = pythonModule
    this.port = port
    this.host = host
    this.workDir = workDir
    this.log = log || require('./logger')
    this.requestTimeout = requestTimeout || 30000
    /** @type {import('child_process').ChildProcess | null} */
    this.process = null
    this.isRunning = false
    this.restartCount = 0
    /** @type {NodeJS.Timeout | null} */
    this.watchdogTimer = null
    /** @type {NodeJS.Timeout | null} */
    this.restartTimer = null
    /** @type {Promise<void> | null} */
    this._starting = null
  }

  /**
   * 启动 Python 子进程
   * @returns {Promise<void>}
   */
  async start () {
    if (this.isRunning) return

    if (await this.attach()) {
      this._startWatchdog()
      return
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    this.log.info(this.name, `Starting ${this.pythonModule}: ${pythonCmd} -m ${this.pythonModule} on port ${this.port}`)
    this.process = await this._launchProcess(pythonCmd)
    await this._waitForHealthy()
    this.isRunning = true
    this.restartCount = 0
    this._startWatchdog()
    this.log.info(this.name, `${this.name} ready on port ${this.port}`)
  }

  /**
   * 附加到外部已运行的服务（不 spawn 子进程）
   * @returns {Promise<boolean>} 是否成功附加
   */
  async attach () {
    if (this.isRunning) return true
    this.log.info(this.name, `Attaching to external ${this.name} on port ${this.port}...`)
    const healthy = await this.healthCheck()
    if (healthy) {
      this.isRunning = true
      this.log.info(this.name, `Attached to external ${this.name} on port ${this.port}`)
    } else {
      this.log.warn(this.name, `Cannot attach: no ${this.name} responding on port ${this.port}`)
    }
    return healthy
  }

  /**
   * spawn 子进程并监听生命周期事件
   * @param {string} pythonCmd
   * @returns {Promise<import('child_process').ChildProcess>}
   * @protected
   */
  _launchProcess (pythonCmd) {
    return new Promise((resolve, reject) => {
      const proc = spawn(pythonCmd, ['-m', this.pythonModule], {
        cwd: this.workDir,
        env: { ...process.env, PORT: String(this.port), PYTHONUNBUFFERED: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
      proc.stdout.on('data', (data) => { this.log.info(this.name + 'Backend', data.toString().trim()) })
      proc.stderr.on('data', (data) => { this.log.warn(this.name + 'Backend', data.toString().trim()) })
      proc.on('error', (err) => { this.log.error(this.name, `Failed to start: ${err.message}`); reject(err) })
      proc.on('exit', (code, signal) => {
        this.log.info(this.name, `Process exited (code=${code}, signal=${signal})`)
        this.isRunning = false
        this.process = null
        if (code !== 0 && code !== null && this.restartCount < MAX_RESTARTS) { this._scheduleRestart() }
      })
      const spawnTimeout = setTimeout(() => {
        try { proc.kill('SIGKILL') } catch (_) { /* already exited */ }
        reject(new Error(`${this.name} process spawn timeout`))
      }, 30000)
      if (spawnTimeout && spawnTimeout.unref) spawnTimeout.unref()
      proc.once('spawn', () => { clearTimeout(spawnTimeout); resolve(proc) })
    })
  }

  /**
   * 轮询健康检查直到就绪
   * @returns {Promise<void>}
   * @protected
   */
  _waitForHealthy () {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      const interval = setInterval(async () => {
        const healthy = await this.healthCheck()
        if (healthy) { clearInterval(interval); resolve() }
        else if (Date.now() - startTime > HEALTH_CHECK_TIMEOUT) { clearInterval(interval); reject(new Error(`${this.name} health check timed out`)) }
      }, HEALTH_CHECK_INTERVAL)
      if (interval && interval.unref) interval.unref()
    })
  }

  /**
   * 守护定时器 — 每 30s 检查健康状态，不健康时自动重启
   * @protected
   */
  _startWatchdog () {
    this._stopWatchdog()
    this.watchdogTimer = setInterval(async () => {
      if (!this.isRunning) return
      const healthy = await this.healthCheck()
      if (!healthy) {
        this.log.warn(this.name, 'Backend unhealthy, restarting...')
        if (this.restartCount < MAX_RESTARTS) {
          try { await this.stop() } catch (e) { this.log.warn(this.name, 'stop failed: ' + (e instanceof Error ? e.message : String(e))) }
          try { await this.start() } catch (e) { this.log.error(this.name, `Restart failed: ${e instanceof Error ? e.message : String(e)}`) }
        } else {
          this.log.error(this.name, `Max restarts (${MAX_RESTARTS}) reached, giving up`)
          this.isRunning = false
          this._stopWatchdog()
        }
      }
    }, WATCHDOG_INTERVAL)
    if (this.watchdogTimer && this.watchdogTimer.unref) this.watchdogTimer.unref()
  }

  /**
   * @protected
   */
  _stopWatchdog () {
    if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = null }
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null }
  }

  /**
   * @protected
   */
  _scheduleRestart () {
    if (this.restartCount >= MAX_RESTARTS) { this.log.error(this.name, `Max restarts (${MAX_RESTARTS}) reached`); return }
    this.restartCount++
    const delay = Math.min(this.restartCount * 2000, 10000)
    this.log.info(this.name, `Scheduling restart #${this.restartCount} in ${delay}ms`)
    this.restartTimer = setTimeout(async () => {
      try { await this.start() } catch (e) { this.log.error(this.name, `Restart #${this.restartCount} failed: ${e instanceof Error ? e.message : String(e)}`) }
    }, delay)
    if (this.restartTimer && this.restartTimer.unref) this.restartTimer.unref()
  }

  /**
   * 健康检查 — GET /health
   * @returns {Promise<boolean>}
   */
  healthCheck () {
    return new Promise((resolve) => {
      const req = http.get(`http://${this.host}:${this.port}/health`, { timeout: 2000 }, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          try { const p = JSON.parse(data); resolve(p.status === 'ok' || p.status === 'healthy' || res.statusCode === 200) }
          catch { resolve(res.statusCode === 200) }
        })
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
    })
  }

  /**
   * 通用 POST 请求
   * @param {string} path - URL 路径
   * @param {string} body - 请求体（JSON 字符串）
   * @param {number} [timeout] - 超时 ms（默认使用 this.requestTimeout）
   * @param {string} [traceId] - 跨进程 traceId（如 pipeline runId）：存在时写 X-Request-Id 头并记 Bridge 日志，便于桌面↔Python 日志关联
   * @returns {Promise<object>}
   * @protected
   */
  async _post (path, body, timeout, traceId) {
    const reqTimeout = timeout || this.requestTimeout
    if (!this.isRunning) {
      try {
        await this.ensureRunning()
      } catch (e) {
        const error = new Error(`${this.name} is not running and lazy-start failed: ${e instanceof Error ? e.message : String(e)}`)
        error.code = 'BRIDGE_UNAVAILABLE'
        const causeCode = e && typeof e === 'object' ? String(e.code || '').toUpperCase() : ''
        error.isTransportError = e && typeof e === 'object' && (
          e.isTransportError === true ||
          e.isTimeout === true ||
          ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'].includes(causeCode)
        )
        error.cause = e
        throw error
      }
    }
    // 仅记录 path + traceId，绝不记录 body（body 为业务数据，无需入日志）。
    // traceId 必须为 header 安全 ASCII（允许字母/数字/._:-，≤64），否则跳过头发送——
    // Node http.request 对非法头字符（如 CJK）会同步抛错，宁可降级不发送也不破坏请求。
    const safeTraceId = typeof traceId === 'string' && /^[A-Za-z0-9._:\-_]{1,64}$/.test(traceId) ? traceId : null
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    if (safeTraceId) {
      headers['X-Request-Id'] = safeTraceId
      this.log.info(this.name, `POST ${path} traceId=${safeTraceId}`)
    } else if (traceId) {
      this.log.warn(this.name, `POST ${path} 跳过非法 traceId（非 header 安全字符）`)
    }
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: this.host, port: this.port, path, method: 'POST',
        headers,
        timeout: reqTimeout
      }, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          let parsed
          try { parsed = JSON.parse(data) } catch { parsed = { code: -1, message: data } }
          if (res.statusCode && res.statusCode >= 400) {
            const detail = parsed && parsed.detail !== undefined
              ? parsed.detail
              : (parsed && parsed.message !== undefined
                  ? parsed.message
                  : (parsed && parsed.error !== undefined ? parsed.error : data))
            this.log.error(this.name, 'POST ' + path + ' HTTP ' + res.statusCode + ': ' + (typeof detail === 'string' ? detail.slice(0, 300) : JSON.stringify(detail).slice(0, 300)))
            reject(createBridgeHttpError(res.statusCode, detail, { bridge: this.name, path, responseBody: parsed }))
          } else {
            resolve(parsed)
          }
        })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(createBridgeTimeoutError(this.name)) })
      req.write(body)
      req.end()
    })
  }

  /**
   * 停止子进程
   */
  async stop () {
    this._stopWatchdog()
    if (!this.process) {
      this.isRunning = false
      return
    }
    this.log.info(this.name, `Stopping ${this.name}...`)
    if (process.platform === 'win32') {
      try { spawnSync('taskkill', ['/PID', String(this.process.pid), '/F', '/T'], { timeout: 5000 }) } catch (e) { this.log.warn(this.name, 'taskkill failed: ' + e.message) }
    } else {
      try { this.process.kill('SIGTERM') } catch (e) { this.log.warn(this.name, 'SIGTERM failed: ' + e.message) }
      await new Promise(r => setTimeout(r, 3000))
      try { if (this.process) this.process.kill('SIGKILL') } catch (_) { /* already exited */ }
    }
    this.process = null
    this.isRunning = false
    this.log.info(this.name, `${this.name} stopped`)
  }

  /**
   * 确保 Bridge 运行中 — 懒启动 / 自愈
   *
   * 当 isRunning=false（启动失败、看门狗放弃、进程崩溃后未恢复）时，
   * 自动尝试重新 start()，避免业务调用方直接收到 "is not running" 错误。
   * 并发调用共享同一个 _starting Promise，避免重复 spawn。
   *
   * @returns {Promise<void>}
   */
  async ensureRunning () {
    if (this.isRunning) return
    if (this._starting) return this._starting

    this.log.info(this.name, `${this.name} is not running, attempting lazy-start...`)
    this.restartCount = 0
    this._starting = this.start().catch((e) => {
      this.log.error(this.name, `Lazy-start failed: ${e instanceof Error ? e.message : String(e)}`)
      throw e
    }).finally(() => { this._starting = null })

    return this._starting
  }
}

module.exports = {
  BasePythonBridge,
  MAX_RESTARTS,
  WATCHDOG_INTERVAL,
  HEALTH_CHECK_TIMEOUT,
  createBridgeHttpError,
  createBridgeTimeoutError,
  isBridgeHttpError,
}
