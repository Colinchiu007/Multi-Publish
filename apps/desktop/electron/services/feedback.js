// @ts-check
/** Main-process feedback submission with opt-in, bounded log export. */
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const MAX_MESSAGE_LENGTH = 10000
const MAX_LOG_FILE_BYTES = 5 * 1024 * 1024
const MAX_LOG_FILES = 30
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024
const MAX_RESPONSE_BYTES = 1024 * 1024
const REQUEST_TIMEOUT_MS = 10000

function normalizeOpsUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  let parsed
  try { parsed = new URL(text) } catch { return '' }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
  if (parsed.username || parsed.password) return ''
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const loopback = host === 'localhost' || host === '::1' || /^127\./.test(host)
  if (!loopback && parsed.protocol !== 'https:') return ''
  return parsed.toString().replace(/\/+$/, '')
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear())
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function makeZip(entries) {
  const chunks = []
  const central = []
  let offset = 0
  const { time, day } = dosDateTime()
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.data)
    const header = Buffer.alloc(30 + name.length)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x800, 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt16LE(time, 10)
    header.writeUInt16LE(day, 12)
    header.writeUInt32LE(crc32(data), 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(name.length, 26)
    header.writeUInt16LE(0, 28)
    name.copy(header, 30)
    chunks.push(header, data)

    const record = Buffer.alloc(46 + name.length)
    record.writeUInt32LE(0x02014b50, 0)
    record.writeUInt16LE(20, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(0x800, 8)
    record.writeUInt16LE(0, 10)
    record.writeUInt16LE(time, 12)
    record.writeUInt16LE(day, 14)
    record.writeUInt32LE(crc32(data), 16)
    record.writeUInt32LE(data.length, 20)
    record.writeUInt32LE(data.length, 24)
    record.writeUInt16LE(name.length, 28)
    record.writeUInt16LE(0, 30)
    record.writeUInt16LE(0, 32)
    record.writeUInt16LE(0, 34)
    record.writeUInt16LE(0, 36)
    record.writeUInt32LE(0, 38)
    record.writeUInt32LE(offset, 42)
    name.copy(record, 46)
    central.push(record)
    offset += header.length + data.length
  }
  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, centralBuffer, end])
}

function collectLogArchive({ log, loggerModule = log, tempDir = os.tmpdir() } = {}) {
  const info = loggerModule && typeof loggerModule.getLogsInfo === 'function' ? loggerModule.getLogsInfo() : null
  const dir = info && typeof info.dir === 'string' ? info.dir : ''
  if (!dir) throw new Error('日志目录不可用')
  const names = []
  for (const file of Array.isArray(info.files) ? info.files : []) {
    if (!/^app-[0-9]{4}-[0-9]{2}-[0-9]{2}\.log$/.test(file.name)) continue
    if (names.length >= MAX_LOG_FILES) break
    const fullPath = path.join(dir, file.name)
    let linkStat
    try { linkStat = fs.lstatSync(fullPath) } catch { continue }
    if (!linkStat.isFile() || linkStat.isSymbolicLink()) continue
    let fd
    let data
    try {
      const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0)
      fd = fs.openSync(fullPath, flags)
      const fileStat = fs.fstatSync(fd)
      if (!fileStat.isFile()) continue
      if (fileStat.size > MAX_LOG_FILE_BYTES) throw new Error('日志文件超过上传大小限制')
      data = Buffer.alloc(fileStat.size)
      fs.readSync(fd, data, 0, fileStat.size, 0)
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd) } catch { /* best effort */ }
      }
    }
    const redacted = typeof loggerModule.redactText === 'function' ? loggerModule.redactText(data.toString('utf8')) : data.toString('utf8')
    names.push({ name: file.name, data: Buffer.from(redacted, 'utf8') })
  }
  if (!names.length) return null
  const archive = makeZip(names)
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error('日志归档超过上传大小限制')
  const filePath = path.join(tempDir, 'multi-publish-feedback-' + process.pid + '-' + crypto.randomUUID() + '.zip')
  fs.writeFileSync(filePath, archive, { flag: 'wx' })
  return { filePath, bytes: archive.length, fileCount: names.length }
}

async function submitFeedback({ opsCenterSync, log, message, includeLogs, appVersion, platform, loggerModule = log, tempDir } = {}) {
  const cleanMessage = String(message || '').trim()
  if (!cleanMessage) return { code: -1, message: '反馈内容不能为空' }
  if (cleanMessage.length > MAX_MESSAGE_LENGTH) return { code: -1, message: '反馈内容过长' }
  if (!opsCenterSync || typeof opsCenterSync.getConfig !== 'function' || typeof opsCenterSync.getCatalogApiKey !== 'function') {
    return { code: -1, message: '运营后台同步服务未就绪' }
  }
  let archive = null
  try {
    const config = opsCenterSync.getConfig() || {}
    const baseUrl = normalizeOpsUrl(config.url)
    const apiKey = config.apiKeyConfigured ? opsCenterSync.getCatalogApiKey() : ''
    if (!baseUrl || !apiKey) return { code: -1, message: '未配置运营后台同步（地址/Key）' }
    if (includeLogs === true) archive = collectLogArchive({ log, loggerModule, tempDir })
    const form = new FormData()
    form.set('message', cleanMessage)
    form.set('app_version', String(appVersion || '').slice(0, 64))
    form.set('platform', String(platform || '').slice(0, 32))
    if (archive) {
      const bytes = fs.readFileSync(archive.filePath)
      form.set('log_archive', new Blob([bytes], { type: 'application/zip' }), 'logs.zip')
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null
    let response
    try {
      response = await fetch(baseUrl + '/api/v1/feedback', {
        method: 'POST',
        headers: { 'X-Catalog-Key': apiKey, Accept: 'application/json' },
        body: form,
        redirect: 'error',
        signal: controller && controller.signal,
      })
    } finally {
      if (timer) clearTimeout(timer)
    }
    const body = Buffer.from(await response.arrayBuffer())
    if (body.length > MAX_RESPONSE_BYTES) return { code: -1, message: '反馈服务响应过大' }
    let result = {}
    try { result = JSON.parse(body.toString('utf8')) } catch { result = {} }
    if (!response.ok) return { code: -1, message: typeof result.detail === 'string' ? result.detail : ('反馈提交失败（HTTP ' + response.status + '）') }
    return { code: 0, data: result }
  } catch (error) {
    log && log.warn && log.warn('Feedback', '提交反馈失败', { error: error && error.name ? error.name : 'Error' })
    return { code: -1, message: '反馈提交失败，请稍后重试' }
  } finally {
    if (archive && archive.filePath) {
      try { fs.rmSync(archive.filePath, { force: true }) } catch { /* best effort cleanup */ }
    }
  }
}

module.exports = { MAX_ARCHIVE_BYTES, MAX_LOG_FILE_BYTES, collectLogArchive, makeZip, normalizeOpsUrl, submitFeedback }
