/**
 * Logger - 文件日志系统（共享版，供 rpa-engine / desktop 引用方统一使用）
 * levels: debug, info, warn, error
 * 写入路径：Electron 环境 userData/logs/app.log，否则 process.cwd()/logs/app.log
 * 超限自动轮转（默认 5MB → app.log.1，保留最近一份）
 * 敏感信息脱敏：Bearer / apiKey / access_token / refresh_token / password / secret /
 * authorization / cookie / sk- 前缀 / 通用 JWT（eyJ 三段）——与 api-publish-engine log-redact 模式集对齐
 *
 * 注：桌面主进程高频日志优先使用 apps/desktop/electron/services/logger.js
 * （异步队列 + 按日文件 + 保留策略 + 控制台同源脱敏）；本模块是共享库内的同步轻量实现，
 * 供无法依赖桌面环境的引用方（如 format-adapter/rules、cover-processor/presets）使用。
 */
const fs = require('fs')
const path = require('path')

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
let CURRENT_LEVEL = process.env.LOG_LEVEL || 'debug'
let LOG_FILE = path.join(process.cwd(), 'logs', 'app.log')
let MAX_LOG_SIZE = 5 * 1024 * 1024

// 敏感信息脱敏（对齐 api-publish-engine log-redact）
const SECRET_PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***'],
  [/([\"']?(?:api[_-]?key|access_token|refresh_token|password|secret|authorization|cookie)[\"']?\s*[:=]\s*[\"'])[^\"'\s,}]+/gi, '$1***'],
  [/\b(api[_-]?key|access_token|refresh_token|password|secret|cookie)\s*=\s*[^&\s,;\"']+/gi, '$1=***'],
  [/\b(sk-[A-Za-z0-9_-]{4})[A-Za-z0-9_-]+/g, '$1***'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g, 'eyJ***'],
]

function redact (value) {
  let output = String(value == null ? '' : value)
  for (const [pattern, replacement] of SECRET_PATTERNS) output = output.replace(pattern, replacement)
  return output
}

// Electron 环境：使用 userData
function getLogPath () {
  try {
    const { app } = require('electron')
    if (app && app.getPath) {
      const dir = path.join(app.getPath('userData'), 'logs')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      return path.join(dir, 'app.log')
    }
  } catch (e) { /* non-electron env */ }
  return path.join(process.cwd(), 'logs', 'app.log')
}

LOG_FILE = getLogPath()

function getTimestamp () {
  return new Date().toISOString().replace('T', ' ').slice(0, 23)
}

function ensureLogDir () {
  const dir = path.dirname(LOG_FILE)
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  } catch (e) { /* ignore */ }
}

function rotateIfNeeded () {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_SIZE) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.1')
    }
  } catch (e) { /* ignore */ }
}

function writeLog (level, tag, msg) {
  if (LOG_LEVELS[level] < LOG_LEVELS[CURRENT_LEVEL]) return
  ensureLogDir()
  rotateIfNeeded()
  const safeTag = redact(String(tag == null ? '' : tag))
  const safeMsg = redact(String(msg == null ? '' : msg))
  const line = '[' + getTimestamp() + '] [' + level.toUpperCase() + '] [' + safeTag + '] ' + safeMsg + '\n'
  try { fs.appendFileSync(LOG_FILE, line) } catch (e) { /* silent fail */ }
  if (typeof console !== 'undefined') {
    if (level === 'error') console.error(line.trim())
    else console.log(line.trim())
  }
}

module.exports = {
  debug: function (tag, msg) { writeLog('debug', tag, msg) },
  info: function (tag, msg) { writeLog('info', tag, msg) },
  warn: function (tag, msg) { writeLog('warn', tag, msg) },
  error: function (tag, msg) { writeLog('error', tag, msg) },
  getLogPath: function () { return LOG_FILE },
  /** 测试/运行时覆盖：日志文件路径、单文件大小上限与级别 */
  setLogOptions: function (options = {}) {
    if (typeof options.file === 'string' && options.file.trim()) LOG_FILE = options.file
    if (typeof options.maxSize === 'number' && options.maxSize > 0) MAX_LOG_SIZE = options.maxSize
    if (typeof options.level === 'string' && LOG_LEVELS[options.level] !== undefined) CURRENT_LEVEL = options.level
  }
}