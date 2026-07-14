// @ts-check
/**
 * PromptBridge — prompt-engine Python 子进程管理
 * 端口 8013，提供提示词优化服务
 *
 * 与 SplitterBridge 模式一致：
 * - 30s 健康检查 + 崩溃自动重启（最多 3 次）
 * - Windows taskkill /F /T 强制停止
 * - 递增延迟重启（2s, 4s, 6s... 上限 10s）
 */
const { spawn, spawnSync } = require('child_process')
const http = require('http')

const PROMPT_PORT = parseInt(process.env.PROMPT_PORT || '8013', 10)
const PROMPT_HOST = process.env.PROMPT_HOST || '127.0.0.1'
const PROMPT_DIR = process.env.PROMPT_DIR || 'D:/Data/projects/prompt-engine'
const HEALTH_CHECK_INTERVAL = 500
const HEALTH_CHECK_TIMEOUT = 10000
const WATCHDOG_INTERVAL = 30000
const MAX_RESTARTS = 3

class PromptBridge {
  /**
   * @param {{ log?: any }} opts
   */
  constructor({ log } = {}) {
    this.log = log || require('./logger')
    this.port = PROMPT_PORT
    this.host = PROMPT_HOST
    this.workDir = PROMPT_DIR
    /** @type {import('child_process').ChildProcess | null} */
    this.process = null
    this.isRunning = false
    this.restartCount = 0
    /** @type {NodeJS.Timeout | null} */
    this.watchdogTimer = null
    /** @type {NodeJS.Timeout | null} */
    this.restartTimer = null
  }

  /**
   * 启动 prompt-engine 子进程
   * spawn python -m prompt_engine.api.rest，工作目录为 prompt-engine 项目根
   */
  async start () {
    if (this.isRunning) return
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    this.log.info('PromptBridge', `Starting prompt-engine: ${pythonCmd} -m prompt_engine.api.rest on port ${this.port}`)
    this.process = await this._launchProcess(pythonCmd)
    await this._waitForHealthy()
    this.isRunning = true
    this.restartCount = 0
    this._startWatchdog()
    this.log.info('PromptBridge', `Prompt-engine ready on port ${this.port}`)
  }

  /**
   * 附加到外部已运行的服务（不 spawn 子进程）
   * 适用场景：Python 服务由 systemd/docker/手动启动，Electron 端只需连接
   * @returns {Promise<boolean>} 是否成功附加
   */
  async attach () {
    if (this.isRunning) return true
    this.log.info('PromptBridge', `Attaching to external prompt-engine on port ${this.port}...`)
    const healthy = await this.healthCheck()
    if (healthy) {
      this.isRunning = true
      this.log.info('PromptBridge', `Attached to external prompt-engine on port ${this.port}`)
    } else {
      this.log.warn('PromptBridge', `Cannot attach: no prompt-engine responding on port ${this.port}`)
    }
    return healthy
  }

  /**
   * spawn 子进程并监听生命周期事件
   * @param {string} pythonCmd
   * @returns {Promise<import('child_process').ChildProcess>}
   */
  _launchProcess (pythonCmd) {
    return new Promise((resolve, reject) => {
      const proc = spawn(pythonCmd, ['-m', 'prompt_engine.api.rest'], {
        cwd: this.workDir,
        env: { ...process.env, PORT: String(this.port), PYTHONUNBUFFERED: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
      proc.stdout.on('data', (data) => { this.log.info('PromptBackend', data.toString().trim()) })
      proc.stderr.on('data', (data) => { this.log.warn('PromptBackend', data.toString().trim()) })
      proc.on('error', (err) => { this.log.error('PromptBridge', `Failed to start: ${err.message}`); reject(err) })
      proc.on('exit', (code, signal) => {
        this.log.info('PromptBridge', `Process exited (code=${code}, signal=${signal})`)
        this.isRunning = false
        this.process = null
        if (code !== 0 && code !== null && this.restartCount < MAX_RESTARTS) { this._scheduleRestart() }
      })
      const spawnTimeout = setTimeout(() => {
        try { proc.kill('SIGKILL') } catch (_) { /* already exited */ }
        reject(new Error('Prompt process spawn timeout'))
      }, 30000)
      if (spawnTimeout && spawnTimeout.unref) spawnTimeout.unref()
      proc.once('spawn', () => { clearTimeout(spawnTimeout); resolve(proc) })
    })
  }

  /**
   * 轮询健康检查直到就绪
   * @returns {Promise<void>}
   */
  _waitForHealthy () {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      const interval = setInterval(async () => {
        const healthy = await this.healthCheck()
        if (healthy) { clearInterval(interval); resolve() }
        else if (Date.now() - startTime > HEALTH_CHECK_TIMEOUT) { clearInterval(interval); reject(new Error('Prompt-engine health check timed out')) }
      }, HEALTH_CHECK_INTERVAL)
      if (interval && interval.unref) interval.unref()
    })
  }

  /**
   * 守护定时器 — 每 30s 检查健康状态，不健康时自动重启
   */
  _startWatchdog () {
    this._stopWatchdog()
    this.watchdogTimer = setInterval(async () => {
      if (!this.isRunning) return
      const healthy = await this.healthCheck()
      if (!healthy) {
        this.log.warn('PromptBridge', 'Backend unhealthy, restarting...')
        if (this.restartCount < MAX_RESTARTS) {
          try { await this.stop() } catch (e) { this.log.warn('PromptBridge', 'stop failed: ' + (e instanceof Error ? e.message : String(e))) }
          try { await this.start() } catch (e) { this.log.error('PromptBridge', `Restart failed: ${e instanceof Error ? e.message : String(e)}`) }
        } else {
          this.log.error('PromptBridge', `Max restarts (${MAX_RESTARTS}) reached, giving up`)
          this.isRunning = false
          this._stopWatchdog()
        }
      }
    }, WATCHDOG_INTERVAL)
    if (this.watchdogTimer && this.watchdogTimer.unref) this.watchdogTimer.unref()
  }

  _stopWatchdog () {
    if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = null }
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null }
  }

  _scheduleRestart () {
    if (this.restartCount >= MAX_RESTARTS) { this.log.error('PromptBridge', `Max restarts (${MAX_RESTARTS}) reached`); return }
    this.restartCount++
    const delay = Math.min(this.restartCount * 2000, 10000)
    this.log.info('PromptBridge', `Scheduling restart #${this.restartCount} in ${delay}ms`)
    this.restartTimer = setTimeout(async () => {
      try { await this.start() } catch (e) { this.log.error('PromptBridge', `Restart #${this.restartCount} failed: ${e instanceof Error ? e.message : String(e)}`) }
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
   * 优化提示词 — POST /v1/optimize
   * @param {object} request - { prompt, ...options }
   * @returns {Promise<object>}
   */
  optimize (request) {
    const body = JSON.stringify(request)
    return this._post('/v1/optimize', body)
  }

  /**
   * 批量优化 — POST /v1/optimize/batch
   * @param {object[]} requests - 优化请求数组
   * @returns {Promise<object>}
   */
  optimizeBatch (requests) {
    const normalized = requests.map(r => {
      if (typeof r === 'string') return { prompt: r }
      if (r.prompt !== undefined) return r
      return { prompt: String(r) }
    })
    const body = JSON.stringify({ requests: normalized })
    return this._post('/v1/optimize/batch', body)
  }

  /**
   * 内部 POST 请求封装
   * @param {string} path
   * @param {string} body
   * @returns {Promise<object>}
   */
  _post (path, body) {
    return new Promise((resolve, reject) => {
      if (!this.isRunning) { reject(new Error('Prompt-engine is not running')); return }
      const req = http.request({
        hostname: this.host, port: this.port, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 60000
      }, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({ code: -1, message: data }) } })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Prompt request timeout')) })
      req.write(body)
      req.end()
    })
  }

  /**
   * 停止子进程
   */
  async stop () {
    this._stopWatchdog()
    if (!this.process) return
    this.log.info('PromptBridge', 'Stopping prompt-engine...')
    if (process.platform === 'win32') {
      try { spawnSync('taskkill', ['/PID', String(this.process.pid), '/F', '/T'], { timeout: 5000 }) } catch (e) { this.log.warn('PromptBridge', 'taskkill failed: ' + e.message) }
    } else {
      try { this.process.kill('SIGTERM') } catch (e) { this.log.warn('PromptBridge', 'SIGTERM failed: ' + e.message) }
      await new Promise(r => setTimeout(r, 3000))
      try { if (this.process) this.process.kill('SIGKILL') } catch (_) { /* already exited */ }
    }
    this.process = null
    this.isRunning = false
    this.log.info('PromptBridge', 'Prompt-engine stopped')
  }
}

module.exports = PromptBridge
