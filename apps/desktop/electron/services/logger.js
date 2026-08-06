// @ts-check
/**
 * Logger service — 控制台 + 文件双写
 *
 * 设计目标（应用日志 log 功能）：
 * - 控制台保持原有行为；同时按「日期」滚动写入 userData/logs/app-YYYY-MM-DD.log，
 *   便于用户/官方/AI 排查问题（每行含 ISO 时间、级别、模块、消息、可选 JSON meta）。
 * - 敏感信息脱敏：Authorization/Bearer、apiKey、sk- 前缀密钥等不落盘原文。
 * - 大小规则：单个 log 文件达到 500MB 时自动删除（可注入覆盖用于测试），
 *   并在启动时核对历史文件。
 * - 提供 clearLogs() / getLogsInfo() 供「设置-通用设置」手动清理与展示。
 * - 文件写入为异步队列，不阻塞主进程；写入失败静默回退控制台。
 */
'use strict'

const fs = require('fs')
const path = require('path')

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }
/** @type {string} */
let currentLevel = process.env.LOG_LEVEL || 'INFO'

let logsDir = null
let maxLogFileBytes = 500 * 1024 * 1024 // 默认单文件 500MB
let currentLogPath = null
let bytesSinceCheck = 0
const CHECK_INTERVAL_BYTES = 64 * 1024 // 每追加约 64KB 做一次真实 size 核对（低成本）
let writeQueue = Promise.resolve()

function defaultLogsDir() {
  try {
    const { app } = require('electron')
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    return dir
  } catch {
    // 非 Electron 环境（单测/node 脚本）：落到系统临时目录，避免污染项目目录
    const dir = path.join(require('os').tmpdir(), 'multi-publish-logs')
    try { fs.mkdirSync(dir, { recursive: true }) } catch { /* 目录不可用时仅控制台 */ }
    return dir
  }
}

function todayFileName() {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `app-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.log`
}

function ensureLogPath() {
  if (!logsDir) logsDir = defaultLogsDir()
  try { fs.mkdirSync(logsDir, { recursive: true }) } catch { /* 目录不可写时回退控制台 */ }
  const next = path.join(logsDir, todayFileName())
  if (next !== currentLogPath) {
    currentLogPath = next
    bytesSinceCheck = 0
    try {
      if (fs.statSync(currentLogPath).size > maxLogFileBytes) {
        fs.rmSync(currentLogPath, { force: true })
      }
    } catch { /* 文件不存在或不可读 */ }
  }
  return currentLogPath
}

// 敏感信息脱敏（Bearer / apiKey / authorization / sk- 前缀密钥）
const SECRET_PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***'],
  [/(["']?api[_-]?key["']?\s*[:=]\s*["'])[^"'\s,}]+/gi, '$1***'],
  [/(["']?authorization["']?\s*[:=]\s*["'])[^"'\s,}]+/gi, '$1***'],
  [/\b(sk-[A-Za-z0-9_-]{4})[A-Za-z0-9_-]+/g, '$1***'],
]

function redact(value) {
  let output = String(value == null ? '' : value)
  for (const [pattern, replacement] of SECRET_PATTERNS) output = output.replace(pattern, replacement)
  return output
}

function safeMeta(meta) {
  if (meta === undefined || meta === null) return ''
  // Error 对象：记录堆栈/消息，便于排查
  if (meta instanceof Error) return ' ' + redact(meta.stack || meta.message || String(meta))
  if (typeof meta === 'object') {
    try {
      const json = JSON.stringify(meta)
      const capped = json.length > 8000 ? json.slice(0, 8000) + '…' : json
      return ' ' + redact(capped)
    } catch {
      return ' [meta]'
    }
  }
  // 兼容既有调用约定 log.level('模块', '消息') / ('模块', '消息', '补充')：
  // 第二、三参的字符串按普通文本拼接，不重复 JSON 化（不产生多余引号）。
  return ' ' + redact(String(meta))
}

function enqueueFileWrite(line) {
  writeQueue = writeQueue.then(() => new Promise((resolve) => {
    try {
      const filePath = ensureLogPath()
      fs.appendFile(filePath, line + '\n', 'utf8', (writeError) => {
        // 写失败静默回退（磁盘满等场景不阻塞主流程）
        resolve()
      })
      bytesSinceCheck += Buffer.byteLength(line)
      if (bytesSinceCheck >= CHECK_INTERVAL_BYTES) {
        bytesSinceCheck = 0
        try {
          if (fs.statSync(filePath).size > maxLogFileBytes) {
            // 单个文件达到 500MB → 自动删除
            fs.rmSync(filePath, { force: true })
            currentLogPath = null
          }
        } catch { /* 核对失败忽略 */ }
      }
    } catch {
      resolve()
    }
  }))
}

function log(level, module, message, meta) {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return
  const timestamp = new Date().toISOString()
  const prefix = `[${timestamp}] [${level}]`
  const safeModule = redact(String(module ?? ''))
  const safeMessage = redact(String(message ?? ''))
  const suffix = safeMeta(meta)
  const body = [safeModule, safeMessage].filter((part) => part !== '').join(' ') + suffix
  if (meta !== undefined && meta !== null) console.log(prefix, module, message, meta)
  else console.log(prefix, module, message)
  enqueueFileWrite(`${prefix} ${body}`)
}

const logger = {
  debug: (...args) => log('DEBUG', ...args),
  info: (...args) => log('INFO', ...args),
  warn: (...args) => log('WARN', ...args),
  error: (...args) => log('ERROR', ...args),
  setLevel: (level) => { currentLevel = level },

  /** 等待已入队的文件写完成（测试/退出前调用） */
  flush() {
    return writeQueue
  },

  /** 测试/启动注入：日志目录与单文件大小上限 */
  setLogOptions(options = {}) {
    if (typeof options.dir === 'string' && options.dir.trim()) logsDir = options.dir
    const numeric = Number(options.maxBytes)
    if (Number.isFinite(numeric) && numeric > 0) maxLogFileBytes = numeric
    currentLogPath = null
    bytesSinceCheck = 0
  },

  /** 手动清理全部应用日志文件（app-*.log） */
  clearLogs() {
    const dir = logsDir || defaultLogsDir()
    let removed = 0
    try {
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith('app-') && name.endsWith('.log')) {
          fs.rmSync(path.join(dir, name), { force: true })
          removed += 1
        }
      }
    } catch { /* 目录不存在等 */ }
    currentLogPath = null
    return removed
  },

  /** 日志目录信息（供设置页展示） */
  getLogsInfo() {
    const dir = logsDir || defaultLogsDir()
    const files = []
    let totalBytes = 0
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!name.startsWith('app-') || !name.endsWith('.log')) continue
        const fullPath = path.join(dir, name)
        let size = 0
        try { size = fs.statSync(fullPath).size } catch { /* 单文件统计失败忽略 */ }
        totalBytes += size
        files.push({ name, size })
      }
    } catch { /* 目录不存在等 */ }
    return {
      dir,
      totalBytes,
      fileCount: files.length,
      maxFileBytes: maxLogFileBytes,
      files: files.sort((a, b) => a.name.localeCompare(b.name)),
    }
  },
}

module.exports = logger
