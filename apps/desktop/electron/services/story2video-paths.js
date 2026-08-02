// @ts-check
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { fileURLToPath } = require('url')

const MAX_INPUT_FILE_BYTES = 100 * 1024 * 1024
const MAX_INPUT_TOTAL_BYTES = 512 * 1024 * 1024
const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024
const MAX_AUDIO_FILE_BYTES = 50 * 1024 * 1024
const MAX_BGM_FILE_BYTES = 15 * 1024 * 1024
const STORY2VIDEO_TEMP_DIR = path.join(os.tmpdir(), 'story2video')
const IMPORTED_MEDIA_DIR = path.join(STORY2VIDEO_TEMP_DIR, 'selected-media')
const MEDIA_RULES = Object.freeze({
  image: { extensions: new Set(['.jpg', '.jpeg', '.png', '.webp']), maxBytes: MAX_IMAGE_FILE_BYTES },
  audio: { extensions: new Set(['.wav', '.m4a', '.mp3']), maxBytes: MAX_AUDIO_FILE_BYTES },
  bgm: { extensions: new Set(['.wav', '.m4a', '.mp3']), maxBytes: MAX_BGM_FILE_BYTES },
})

function safeRunId (value) {
  return String(value || 'run').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'run'
}

function getElectronMediaRoots () {
  const roots = []
  try {
    const electron = require('electron')
    const app = electron && electron.app
    if (app && typeof app.getPath === 'function') {
      const userData = app.getPath('userData')
      if (userData) roots.push(path.join(userData, 'story2video-projects'))
    }
  } catch (_) { /* 纯 Node 测试或非 Electron 调用 */ }
  return roots
}

function getAllowedMediaRoots (extraRoots = []) {
  const roots = [STORY2VIDEO_TEMP_DIR, ...getElectronMediaRoots(), ...extraRoots]
  const unique = []
  for (const root of roots) {
    if (typeof root !== 'string' || !root.trim()) continue
    const resolved = path.resolve(root)
    if (!unique.includes(resolved)) unique.push(resolved)
  }
  return unique
}

function canonicalPath (candidate) {
  const resolved = path.resolve(candidate)
  let cursor = resolved
  const suffix = []
  while (true) {
    try {
      return path.join(fs.realpathSync.native(cursor), ...suffix.reverse())
    } catch {
      const parent = path.dirname(cursor)
      if (parent === cursor) return resolved
      suffix.push(path.basename(cursor))
      cursor = parent
    }
  }
}

function isPathWithin (candidate, roots) {
  if (typeof candidate !== 'string' || !candidate) return false
  const resolvedCandidate = canonicalPath(candidate)
  return (Array.isArray(roots) ? roots : [roots]).some((root) => {
    if (typeof root !== 'string' || !root) return false
    const resolvedRoot = canonicalPath(root)
    return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(resolvedRoot + path.sep)
  })
}

function toLocalPath (candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return null
  const value = candidate.trim()
  if (/^file:\/\//i.test(value)) {
    try { return fileURLToPath(value) } catch { return null }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return null
  return value
}

/**
 * 只返回用户可访问根目录内的 canonical 普通文件。
 * 先检查 lstat，拒绝 renderer 伪造的符号链接，再检查 realpath 防止链接越界。
 */
function resolveReadableFile (candidate, options = {}) {
  const localPath = toLocalPath(candidate)
  if (!localPath) return null
  const absolute = path.resolve(localPath)
  const roots = options.allowedRoots || getAllowedMediaRoots()
  if (!isPathWithin(absolute, roots)) return null

  try {
    const linkStat = fs.lstatSync(absolute)
    if (!linkStat.isFile() || linkStat.isSymbolicLink()) return null
    const realPath = fs.realpathSync.native(absolute)
    if (!isPathWithin(realPath, roots)) return null
    const stat = fs.statSync(realPath)
    const maxBytes = Number.isFinite(Number(options.maxBytes))
      ? Number(options.maxBytes)
      : MAX_INPUT_FILE_BYTES
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) return null
    return realPath
  } catch {
    return null
  }
}

function getMediaRule (kind) {
  return MEDIA_RULES[kind] || null
}

function resolveReadableMediaFile (candidate, options = {}) {
  const rule = getMediaRule(options.kind)
  const localPath = toLocalPath(candidate)
  if (!rule || !localPath || !rule.extensions.has(path.extname(localPath).toLowerCase())) return null
  const requestedMax = Number(options.maxBytes)
  const maxBytes = Number.isFinite(requestedMax) && requestedMax > 0
    ? Math.min(requestedMax, rule.maxBytes)
    : rule.maxBytes
  return resolveReadableFile(localPath, { ...options, maxBytes })
}

/**
 * Electron 的 File 选择只证明用户选择过该路径，不应因此放开整块磁盘。
 * 这里把文件复制到应用控制的临时目录，后续阶段继续使用 canonical 白名单校验。
 */
function importUserSelectedMedia (candidate, kind, options = {}) {
  const rule = getMediaRule(kind)
  const localPath = toLocalPath(candidate)
  if (!rule || !localPath || !path.isAbsolute(localPath)) throw new Error('媒体导入参数无效')
  const extension = path.extname(localPath).toLowerCase()
  if (!rule.extensions.has(extension)) throw new Error('不支持的媒体格式')

  let source
  try {
    const linkStat = fs.lstatSync(localPath)
    if (!linkStat.isFile() || linkStat.isSymbolicLink()) throw new Error('媒体文件类型无效')
    source = fs.realpathSync.native(localPath)
    const stat = fs.statSync(source)
    if (!stat.isFile() || stat.size <= 0 || stat.size > rule.maxBytes) throw new Error('媒体文件超过大小上限')
  } catch (error) {
    if (error && /媒体/.test(error.message)) throw error
    throw new Error('媒体文件不存在或不可读')
  }

  const baseDir = path.resolve(options.baseDir || IMPORTED_MEDIA_DIR)
  fs.mkdirSync(baseDir, { recursive: true })
  const token = Date.now().toString(36) + '-' + process.pid + '-' + Math.random().toString(36).slice(2, 10)
  const destination = path.join(baseDir, kind + '-' + token + extension)
  if (!isPathWithin(destination, [baseDir])) throw new Error('媒体导入路径无效')
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL)
  const stat = fs.statSync(destination)
  return { path: destination, kind, size: stat.size, originalName: path.basename(source) }
}

function cleanupImportedMediaPaths (params, options = {}) {
  const baseDir = path.resolve(options.baseDir || IMPORTED_MEDIA_DIR)
  const candidates = []
  if (Array.isArray(params?.audio)) candidates.push(...params.audio.map(item => item && (item.path || item.filePath)))
  if (typeof params?.bgmPath === 'string') candidates.push(params.bgmPath)
  let cleaned = 0
  for (const candidate of new Set(candidates.filter(Boolean))) {
    const absolute = path.resolve(candidate)
    if (!isPathWithin(absolute, [baseDir])) continue
    try {
      const stat = fs.lstatSync(absolute)
      if (!stat.isFile() || stat.isSymbolicLink()) continue
      fs.unlinkSync(absolute)
      cleaned++
    } catch { /* 文件已清理或运行期间被移除 */ }
  }
  return cleaned
}

function getRunInputDir (runId, options = {}) {
  const baseDir = path.resolve(options.baseDir || path.join(STORY2VIDEO_TEMP_DIR, 'inputs'))
  return path.join(baseDir, safeRunId(runId))
}

function writeDataImage (source, runId, index, options = {}) {
  const match = typeof source === 'string' && source.match(
    /^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=\r\n]+)$/i,
  )
  if (!match) throw new Error('图片必须是受支持的 data URL')
  const encoded = match[2].replace(/[\r\n]/g, '')
  if (encoded.length % 4 !== 0 ||
      !/^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/i.test(encoded)) {
    throw new Error('图片 data URL 的 Base64 内容无效')
  }
  const buffer = Buffer.from(encoded, 'base64')
  const maxBytes = Number.isFinite(Number(options.maxBytes))
    ? Math.min(Number(options.maxBytes), MAX_IMAGE_FILE_BYTES)
    : MAX_IMAGE_FILE_BYTES
  if (buffer.length === 0 || buffer.length > maxBytes) throw new Error('图片超过允许大小')

  const baseDir = path.resolve(options.baseDir || path.join(STORY2VIDEO_TEMP_DIR, 'inputs'))
  const inputDir = getRunInputDir(runId, { baseDir })
  if (!isPathWithin(inputDir, [baseDir])) throw new Error('非法运行目录')
  fs.mkdirSync(inputDir, { recursive: true })

  let total = 0
  for (const entry of fs.readdirSync(inputDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    try { total += fs.statSync(path.join(inputDir, entry.name)).size } catch { /* 并发清理时忽略 */ }
  }
  const maxTotal = Number.isFinite(Number(options.maxTotalBytes))
    ? Number(options.maxTotalBytes)
    : MAX_INPUT_TOTAL_BYTES
  if (total + buffer.length > maxTotal) throw new Error('运行输入媒体超过总大小上限')

  const extension = match[1].toLowerCase().replace('jpeg', 'jpg').split('/')[1]
  const numericIndex = Number.isInteger(Number(index)) && Number(index) >= 0 ? Number(index) : 0
  const output = path.join(inputDir, 'image_' + String(numericIndex).padStart(4, '0') + '.' + extension)
  if (fs.existsSync(output)) {
    const existing = fs.lstatSync(output)
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('运行输入文件类型无效')
    fs.unlinkSync(output)
  }
  fs.writeFileSync(output, buffer, { flag: 'wx' })
  return output
}

function cleanupRunInputDir (runId, options = {}) {
  const baseDir = path.resolve(options.baseDir || path.join(STORY2VIDEO_TEMP_DIR, 'inputs'))
  const inputDir = getRunInputDir(runId, { baseDir })
  if (!isPathWithin(inputDir, [baseDir]) || !fs.existsSync(inputDir)) return false
  try {
    fs.rmSync(inputDir, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

module.exports = {
  MAX_INPUT_FILE_BYTES,
  MAX_INPUT_TOTAL_BYTES,
  MAX_IMAGE_FILE_BYTES,
  MAX_AUDIO_FILE_BYTES,
  MAX_BGM_FILE_BYTES,
  STORY2VIDEO_TEMP_DIR,
  IMPORTED_MEDIA_DIR,
  safeRunId,
  getAllowedMediaRoots,
  isPathWithin,
  resolveReadableFile,
  resolveReadableMediaFile,
  importUserSelectedMedia,
  cleanupImportedMediaPaths,
  getRunInputDir,
  writeDataImage,
  cleanupRunInputDir,
}
