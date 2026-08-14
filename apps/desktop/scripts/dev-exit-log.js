// @ts-check
/**
 * dev-exit-log.js — dev launcher 退出原因日志（纯函数，便于 node --test）
 * 目的：dev.js 的 vite/electron 被终止时留下固定日志，并发互杀/外部杀可立即定位。
 */
'use strict'

const os = require('node:os')
const fs = require('node:fs')
const path = require('node:path')

/** 默认退出日志路径（与 start-desktop.ps1 的 out/err 日志同目录） */
function defaultExitLogFile() {
  return path.join(os.tmpdir(), 'mp-start-dev.exit.log')
}

/**
 * 格式化一行退出日志。返回含换行符的文本。
 * @param {{ event: string, pid?: number|null, exitCode?: number|null, signal?: string|null, extra?: string|null }} entry
 * @returns {string}
 */
function formatExitEntry({ event, pid = null, exitCode = null, signal = null, extra = null }) {
  const parts = [
    new Date().toISOString(),
    event,
    pid != null ? `pid=${pid}` : null,
    exitCode != null ? `code=${exitCode}` : null,
    signal != null ? `signal=${signal}` : null,
    extra != null ? `extra=${extra}` : null,
  ].filter((p) => p !== null)
  return parts.join(' ') + os.EOL
}

/**
 * 追加一行退出日志。失败静默（日志不可写不能阻塞退出流程）。
 * @param {{ event: string, pid?: number|null, exitCode?: number|null, signal?: string|null, extra?: string|null }} entry
 * @param {string} [file]
 */
function appendDevExitLog(entry, file = defaultExitLogFile()) {
  try {
    fs.appendFileSync(file, formatExitEntry(entry), 'utf8')
    return true
  } catch {
    return false
  }
}

module.exports = { defaultExitLogFile, formatExitEntry, appendDevExitLog }
