// @ts-check
/**
 * Python 后端子进程管理
 * Electron 主进程启动/停止 Python FastAPI 服务
 * 
 * P0: 进程守护 — 崩溃自动重启 + 端口冲突处理
 */
const { spawn, spawnSync } = require('child_process')
const path = require('path')
const log = require('./logger')
const http = require('http')

const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '8299', 10)
const BACKEND_HOST = process.env.BACKEND_HOST || '127.0.0.1'
const HEALTH_CHECK_INTERVAL = 500   // 启动时健康检查间隔 (ms)
const HEALTH_CHECK_TIMEOUT = 10000  // 启动时最长等待 (ms)
const WATCHDOG_INTERVAL = 30000     // 守护检查间隔 30s
const MAX_RESTARTS = 3              // 最大重启次数
const PORT_FALLBACK_COUNT = 5       // 端口冲突时尝试后续端口的次数

/** @type {import('child_process').ChildProcess | null} */
let pythonProcess = null
let isRunning = false
let currentPort = BACKEND_PORT
let restartCount = 0
/** @type {NodeJS.Timeout | null} */
let watchdogTimer = null
/** @type {NodeJS.Timeout | null} */
let _restartTimer = null

/**
 * 获取 Python 后端工作目录
 */
function getBackendDir () {
  // 开发模式：packages/python-backend/src/
  // 打包后：resources/python-backend/
  if (process.resourcesPath && require('electron').app.isPackaged) {
    return path.join(process.resourcesPath, 'python-backend')
  }
  return path.join(__dirname, '..', '..', '..', '..', 'packages', 'python-backend', 'src')
}

/**
 * 启动 Python 后端子进程（含自动重试 + 端口回退）
 * @param {number} port
 * @returns {Promise<import('child_process').ChildProcess>}
 */
function launchProcess (port) {
  return new Promise((resolve, reject) => {
    const backendDir = getBackendDir()
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

    log.info('PythonBridge', `Starting Python backend: ${pythonCmd} server.py on port ${port}`)

    const proc = spawn(pythonCmd, ['server.py'], {
      cwd: backendDir,
      env: {
        ...process.env,
        BACKEND_PORT: String(port),
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    proc.stdout.on('data', (data) => {
      log.info('PythonBackend', data.toString().trim())
    })

    proc.stderr.on('data', (data) => {
      log.warn('PythonBackend', data.toString().trim())
    })

    proc.on('error', (err) => {
      log.error('PythonBridge', `Failed to start: ${err.message}`)
      if (err.message.includes('EADDRINUSE') || err.message.includes('port')) {
        // 端口冲突，不要 resolve/reject，上层会尝试下一个端口
        reject(new Error('PORT_IN_USE'))
      } else {
        reject(err)
      }
    })

    proc.on('exit', (code, signal) => {
      log.info('PythonBridge', `Process exited (code=${code}, signal=${signal})`)
      isRunning = false
      pythonProcess = null
      // 非正常退出时自动重启
      if (code !== 0 && code !== null && restartCount < MAX_RESTARTS) {
        scheduleRestart()
      }
    })

    // 监听 'spawn' 事件再 resolve（修复竞态：原同步 resolve 后 'error' 事件的 reject 变空操作）
    // 加 30s 超时保护（大于健康检查超时），防止 spawn 事件永不触发导致 Promise 永久泄漏
    const spawnTimeout = setTimeout(() => {
      reject(new Error('Python process spawn timeout'))
    }, 30000)
    // R28 修复：unref 让定时器不阻止进程退出
    if (spawnTimeout && spawnTimeout.unref) spawnTimeout.unref()
    proc.once('spawn', () => {
      clearTimeout(spawnTimeout)
      resolve(proc)
    })
  })
}

/**
 * 启动 Python 后端子进程（带端口重试）
 */
async function startPythonBackend () {
  if (isRunning) return

  let lastErr = null
  for (let i = 0; i < PORT_FALLBACK_COUNT; i++) {
    const port = BACKEND_PORT + i
    try {
      pythonProcess = await launchProcess(port)
      currentPort = port
      // 轮询健康检查
      await waitForHealthy()
      isRunning = true
      restartCount = 0
      startWatchdog()
      log.info('PythonBridge', `Backend ready on port ${port}`)
      return
    } catch (e) {
      if (e instanceof Error && e.message === 'PORT_IN_USE') {
        log.warn('PythonBridge', `Port ${port} in use, trying ${port + 1}`)
        lastErr = e
        continue
      }
      lastErr = e
      break
    }
  }
  throw lastErr || new Error('Failed to start Python backend')
}

/**
 * 等待后端就绪
 * @returns {Promise<void>}
 */
function waitForHealthy () {
  /** @type {Promise<void>} */
  const p = new Promise((resolve, reject) => {
    const startTime = Date.now()
    const interval = setInterval(async () => {
      const healthy = await _healthCheck()
      if (healthy) {
        clearInterval(interval)
        resolve()
      } else if (Date.now() - startTime > HEALTH_CHECK_TIMEOUT) {
        clearInterval(interval)
        reject(new Error('Python backend health check timed out'))
      }
    }, HEALTH_CHECK_INTERVAL)
    // R28 修复：unref 让定时器不阻止进程退出
    if (interval && interval.unref) interval.unref()
  })
  return p
}

/**
 * 守护定时器 — 每 30s 检查一次后端健康状态
 */
function startWatchdog () {
  stopWatchdog()
  watchdogTimer = setInterval(async () => {
    if (!isRunning) return
    const healthy = await _healthCheck()
    if (!healthy) {
      log.warn('PythonBridge', 'Backend unhealthy, restarting...')
      if (restartCount < MAX_RESTARTS) {
        // M-3 修复：stopPythonBackend 在进程已退出时 kill() 抛 ESRCH，需 try/catch 否则 unhandledRejection
        try { await stopPythonBackend() } catch (e) { log.warn('PythonBridge', 'stop failed: ' + (e instanceof Error ? e.message : String(e))) }
        try {
          await startPythonBackend()
        } catch (e) {
          log.error('PythonBridge', `Restart failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      } else {
        log.error('PythonBridge', `Max restarts (${MAX_RESTARTS}) reached, giving up`)
        isRunning = false
        stopWatchdog()
      }
    }
  }, WATCHDOG_INTERVAL)
  // R28 修复：unref 让守护定时器不阻止进程退出（后端健康检查不应持有事件循环）
  if (watchdogTimer && watchdogTimer.unref) watchdogTimer.unref()
}

function stopWatchdog () {
  if (watchdogTimer) {
    clearInterval(watchdogTimer)
    watchdogTimer = null
  }
  if (_restartTimer) {
    clearTimeout(_restartTimer)
    _restartTimer = null
  }
}

function scheduleRestart () {
  if (restartCount >= MAX_RESTARTS) {
    log.error('PythonBridge', `Max restarts (${MAX_RESTARTS}) reached`)
    return
  }
  restartCount++
  const delay = Math.min(restartCount * 2000, 10000)  // 递增延迟
  log.info('PythonBridge', `Scheduling restart #${restartCount} in ${delay}ms`)
  _restartTimer = setTimeout(async () => {
    try {
      await startPythonBackend()
    } catch (e) {
      log.error('PythonBridge', `Restart #${restartCount} failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, delay)
  // R28 修复：unref 让定时器不阻止进程退出
  if (_restartTimer && _restartTimer.unref) _restartTimer.unref()
}

/**
 * 健康检查 — 调用 GET /api/health
 * @returns {Promise<boolean>}
 */
function _healthCheck () {
  /** @type {Promise<boolean>} */
  const p = new Promise((resolve) => {
    const req = http.get(`http://${BACKEND_HOST}:${currentPort}/api/health`, { timeout: 2000 }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          resolve(parsed.status === 'ok')
        } catch {
          resolve(false)
        }
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
  return p
}

/**
 * 停止 Python 后端子进程
 */
async function stopPythonBackend () {
  stopWatchdog()
  if (!pythonProcess) return

  log.info('PythonBridge', 'Stopping Python backend...')

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pythonProcess.pid), '/F', '/T'])
  } else {
    pythonProcess.kill('SIGTERM')
    await new Promise(r => setTimeout(r, 3000))
    if (pythonProcess) pythonProcess.kill('SIGKILL')
  }

  pythonProcess = null
  isRunning = false
  log.info('PythonBridge', 'Backend stopped')
}

/**
 * 发送 HTTP 请求到 Python 后端
 * @param {string} method - HTTP method
 * @param {string} path - URL path
 * @param {object|null} body - Request body
 * @param {number} [timeout] - Request timeout in ms (default 30000, login 180000)
 */
function requestBackend (method, path, body = null, timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (!isRunning) {
      reject(new Error('Python backend is not running'))
      return
    }

    const options = {
      hostname: BACKEND_HOST,
      port: currentPort,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve({ code: -1, message: data })
        }
      })
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })

    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

module.exports = {
  startPythonBackend,
  stopPythonBackend,
  requestBackend,
  isRunning: () => isRunning,
  currentPort: () => currentPort
}
