// @ts-check
/**
 * SplitterBridge — smart-sentence-splitter Python 子进程管理
 * 端口 8002，提供文本分句服务
 *
 * 参考 python-bridge.js 的进程守护模式：
 * - 30s 健康检查 + 崩溃自动重启（最多 3 次）
 * - Windows taskkill /F /T 强制停止
 * - 递增延迟重启（2s, 4s, 6s... 上限 10s）
 * - 定时器 unref 避免阻止进程退出
 */
const { spawn, spawnSync } = require('child_process')
const http = require('http')

const SPLITTER_PORT = parseInt(process.env.SPLITTER_PORT || '8002', 10)
const SPLITTER_HOST = process.env.SPLITTER_HOST || '127.0.0.1'
const SPLITTER_DIR = process.env.SPLITTER_DIR || 'D:/Data/projects/smart-sentence-splitter'
const HEALTH_CHECK_INTERVAL = 500
const HEALTH_CHECK_TIMEOUT = 10000
const WATCHDOG_INTERVAL = 30000
const MAX_RESTARTS = 3

class SplitterBridge {
  /**
   * @param {{ log?: any }} opts
   */
  constructor({ log } = {}) {
    // 若未注入 logger，回退到本地 logger 模块（与 python-bridge.js 一致）
    this.log = log || require('./logger')
    this.port = SPLITTER_PORT
    this.host = SPLITTER_HOST
    this.workDir = SPLITTER_DIR
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
   * 启动 smart-sentence-splitter 子进程
   * spawn python -m splitter.api.rest_api，工作目录为 smart-sentence-splitter 项目根
   */
  async start () {
    if (this.isRunning) return
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    this.log.info('SplitterBridge', `Starting splitter: ${pythonCmd} -m splitter.api.rest_api on port ${this.port}`)
    this.process = await this._launchProcess(pythonCmd)
    await this._waitForHealthy()
    this.isRunning = true
    this.restartCount = 0
    this._startWatchdog()
    this.log.info('SplitterBridge', `Splitter ready on port ${this.port}`)
  }

  /**
   * spawn 子进程并监听生命周期事件
   * @param {string} pythonCmd
   * @returns {Promise<import('child_process').ChildProcess>}
   */
  _launchProcess (pythonCmd) {
    return new Promise((resolve, reject) => {
      const proc = spawn(pythonCmd, ['-m', 'splitter.api.rest_api'], {
        cwd: this.workDir,
        env: { ...process.env, PORT: String(this.port), PYTHONUNBUFFERED: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
      proc.stdout.on('data', (data) => { this.log.info('SplitterBackend', data.toString().trim()) })
      proc.stderr.on('data', (data) => { this.log.warn('SplitterBackend', data.toString().trim()) })
      proc.on('error', (err) => { this.log.error('SplitterBridge', `Failed to start: ${err.message}`); reject(err) })
      proc.on('exit', (code, signal) => {
        this.log.info('SplitterBridge', `Process exited (code=${code}, signal=${signal})`)
        this.isRunning = false
        this.process = null
        if (code !== 0 && code !== null && this.restartCount < MAX_RESTARTS) { this._scheduleRestart() }
      })
      const spawnTimeout = setTimeout(() => {
        try { proc.kill('SIGKILL') } catch (_) { /* already exited */ }
        reject(new Error('Splitter process spawn timeout'))
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
        else if (Date.now() - startTime > HEALTH_CHECK_TIMEOUT) { clearInterval(interval); reject(new Error('Splitter health check timed out')) }
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
        this.log.warn('SplitterBridge', 'Backend unhealthy, restarting...')
        if (this.restartCount < MAX_RESTARTS) {
          try { await this.stop() } catch (e) { this.log.warn('SplitterBridge', 'stop failed: ' + (e instanceof Error ? e.message : String(e))) }
          try { await this.start() } catch (e) { this.log.error('SplitterBridge', `Restart failed: ${e instanceof Error ? e.message : String(e)}`) }
        } else {
          this.log.error('SplitterBridge', `Max restarts (${MAX_RESTARTS}) reached, giving up`)
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
    if (this.restartCount >= MAX_RESTARTS) { this.log.error('SplitterBridge', `Max restarts (${MAX_RESTARTS}) reached`); return }
    this.restartCount++
    const delay = Math.min(this.restartCount * 2000, 10000)
    this.log.info('SplitterBridge', `Scheduling restart #${this.restartCount} in ${delay}ms`)
    this.restartTimer = setTimeout(async () => {
      try { await this.start() } catch (e) { this.log.error('SplitterBridge', `Restart #${this.restartCount} failed: ${e instanceof Error ? e.message : String(e)}`) }
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
   * 分句 — POST /v1/split
   * @param {string} text - 待分句文本
   * @param {object} [options] - 额外选项（language, mode 等）
   * @returns {Promise<object>} 分句结果
   */
  split (text, options = {}) {
    const body = JSON.stringify({ text, language: 'auto', mode: 'balanced', ...options })
    return new Promise((resolve, reject) => {
      if (!this.isRunning) { reject(new Error('Splitter is not running')); return }
      const req = http.request({
        hostname: this.host, port: this.port, path: '/v1/split', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 30000
      }, (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({ code: -1, message: data }) } })
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Split request timeout')) })
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
    this.log.info('SplitterBridge', 'Stopping splitter...')
    if (process.platform === 'win32') {
      try { spawnSync('taskkill', ['/PID', String(this.process.pid), '/F', '/T'], { timeout: 5000 }) } catch (e) { this.log.warn('SplitterBridge', 'taskkill failed: ' + e.message) }
    } else {
      try { this.process.kill('SIGTERM') } catch (e) { this.log.warn('SplitterBridge', 'SIGTERM failed: ' + e.message) }
      await new Promise(r => setTimeout(r, 3000))
      try { if (this.process) this.process.kill('SIGKILL') } catch (_) { /* already exited */ }
    }
    this.process = null
    this.isRunning = false
    this.log.info('SplitterBridge', 'Splitter stopped')
  }
}

module.exports = SplitterBridge
