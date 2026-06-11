/**
 * Python 后端子进程管理
 * Electron 主进程启动/停止 Python FastAPI 服务
 */
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '8299', 10)
const BACKEND_HOST = '127.0.0.1'
const HEALTH_CHECK_INTERVAL = 500   // 健康检查间隔 (ms)
const HEALTH_CHECK_TIMEOUT = 10000  // 最长等待 (ms)

let pythonProcess = null
let isRunning = false

/**
 * 获取 Python 后端工作目录
 */
function getBackendDir () {
  return path.join(__dirname, '..', 'python')
}

/**
 * 启动 Python 后端子进程
 * @returns {Promise<void>}
 */
function startPythonBackend () {
  return new Promise((resolve, reject) => {
    if (isRunning) {
      resolve()
      return
    }

    const backendDir = getBackendDir()
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

    console.log(`[PythonBridge] Starting Python backend: ${pythonCmd} server.py on port ${BACKEND_PORT}`)

    pythonProcess = spawn(pythonCmd, ['server.py'], {
      cwd: backendDir,
      env: {
        ...process.env,
        BACKEND_PORT: String(BACKEND_PORT),
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    pythonProcess.stdout.on('data', (data) => {
      console.log(`[PythonBackend] ${data.toString().trim()}`)
    })

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[PythonBackend:err] ${data.toString().trim()}`)
    })

    pythonProcess.on('error', (err) => {
      console.error(`[PythonBridge] Failed to start Python: ${err.message}`)
      isRunning = false
      reject(err)
    })

    pythonProcess.on('exit', (code, signal) => {
      console.log(`[PythonBridge] Python process exited (code=${code}, signal=${signal})`)
      isRunning = false
      pythonProcess = null
    })

    // 轮询健康检查，等待后端就绪
    const startTime = Date.now()
    const interval = setInterval(async () => {
      const healthy = await healthCheck()
      if (healthy) {
        clearInterval(interval)
        isRunning = true
        console.log('[PythonBridge] Backend is ready')
        resolve()
      } else if (Date.now() - startTime > HEALTH_CHECK_TIMEOUT) {
        clearInterval(interval)
        const err = new Error('Python backend health check timed out')
        console.error(`[PythonBridge] ${err.message}`)
        reject(err)
      }
    }, HEALTH_CHECK_INTERVAL)
  })
}

/**
 * 健康检查 — 调用 GET /api/health
 * @returns {Promise<boolean>}
 */
function healthCheck () {
  return new Promise((resolve) => {
    const req = http.get(`http://${BACKEND_HOST}:${BACKEND_PORT}/api/health`, { timeout: 2000 }, (res) => {
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
}

/**
 * 停止 Python 后端子进程
 */
async function stopPythonBackend () {
  if (!pythonProcess) return

  console.log('[PythonBridge] Stopping Python backend...')

  if (process.platform === 'win32') {
    // Windows: 先发 SIGTERM (通过 taskkill)
    spawn('taskkill', ['/PID', String(pythonProcess.pid), '/F', '/T'])
  } else {
    pythonProcess.kill('SIGTERM')
    // 等待 3s 后强制杀
    setTimeout(() => {
      if (pythonProcess) {
        pythonProcess.kill('SIGKILL')
      }
    }, 3000)
  }

  pythonProcess = null
  isRunning = false
  console.log('[PythonBridge] Backend stopped')
}

/**
 * 发送 HTTP 请求到 Python 后端
 */
function requestBackend (method, path, body = null) {
  return new Promise((resolve, reject) => {
    if (!isRunning) {
      reject(new Error('Python backend is not running'))
      return
    }

    const options = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
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

    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

module.exports = {
  startPythonBackend,
  stopPythonBackend,
  healthCheck,
  requestBackend,
  isRunning: () => isRunning
}
