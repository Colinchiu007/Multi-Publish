// @ts-check
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

  // 视频创作流水线「保存配置」：设备级命名组合配置（userData/story2video-config-profiles/config-profiles.json）。
// 数据模型：{ version, profiles: [{ id, name, pipelineId, snapshot, createdAt, updatedAt }] }
const PROFILES_INDEX_VERSION = 1
const INDEX_FILE_NAME = 'config-profiles.json'
const MAX_NAME_LENGTH = 60
const MAX_PIPELINE_ID_LENGTH = 64
const MAX_PROFILES_PER_PIPELINE = 50
const MAX_SNAPSHOT_BYTES = 64 * 1024
const SNAPSHOT_SCHEMA_VERSION = 1
const RETRYABLE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])
const MAX_WRITE_ATTEMPTS = 3
const RETRY_DELAY_MS = 150

function getUserDataDir () {
  try {
    const electron = require('electron')
    const app = electron && electron.app
    if (app && typeof app.getPath === 'function') {
      const userData = app.getPath('userData')
      if (userData) return userData
    }
  } catch (_) { /* 纯 Node 测试或非 Electron 调用 */ }
  return null
}

function defaultProfilesDir () {
  const userData = getUserDataDir()
  return userData ? path.join(userData, 'story2video-config-profiles') : null
}

function isSafeProfileId (value) {
  // randomUUID（36 位含连字符）或测试注入的 8..64 位 [A-Za-z0-9-]
  return typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value)
}

function normalizeProfileName (value) {
  const trimmed = String(value == null ? '' : value).trim()
  if (trimmed.length === 0 || Array.from(trimmed).length > MAX_NAME_LENGTH) return ''
  return trimmed
}

function isSafePipelineId (value) {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= MAX_PIPELINE_ID_LENGTH &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
}

  function isPlainObject (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** 业务/参数校验类错误（IPC 层映射 EC.VALIDATION_ERROR）；IO 占用等运行时错误保持普通 Error（REQUEST_ERROR）。 */
class ProfileValidationError extends Error {
  constructor (message) { super(message); this.name = 'ProfileValidationError' }
}

function serializeSnapshot (snapshot) {
  // 丢弃函数/undefined 等非 JSON 值，判定大小（UTF-8 字节）
  const serialized = JSON.stringify(snapshot)
  return { serialized, bytes: Buffer.byteLength(String(serialized), 'utf8') }
}

/** Windows 占用类错误有界重试（沿用 bgm-library 语义）。 */
function renameWithRetry (source, destination) {
  let lastError = null
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    try {
      fs.renameSync(source, destination)
      return
    } catch (error) {
      lastError = error
      if (!error || !RETRYABLE_CODES.has(error.code) || attempt === MAX_WRITE_ATTEMPTS - 1) break
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY_MS * (attempt + 1))
    }
  }
  if (lastError && RETRYABLE_CODES.has(lastError.code)) {
    throw new Error('配置保存失败，文件被占用，请稍后重试')
  }
  throw lastError instanceof Error ? lastError : new Error('配置保存失败')
}

/**
 * 视频创作流水线命名配置库（设备级持久化）。
 * 目录：userData/story2video-config-profiles/，索引 config-profiles.json（原子写）。
 * 快照为纯 JSON（renderer 白名单捕获），本服务只做形状/大小/容量校验，不做字段白名单。
 */
class Story2VideoConfigProfiles {
  constructor (options = {}) {
    const dir = options.profilesDir || defaultProfilesDir()
    if (!dir) throw new Error('配置库目录不可用')
    this.profilesDir = path.resolve(dir)
    this.indexPath = path.join(this.profilesDir, INDEX_FILE_NAME)
    this.now = typeof options.now === 'function' ? options.now : () => Date.now()
    this.idFactory = typeof options.idFactory === 'function' ? options.idFactory : () => crypto.randomUUID()
  }

  _readIndex () {
    let raw
    try {
      raw = fs.readFileSync(this.indexPath, 'utf8')
    } catch (_) {
      return { version: PROFILES_INDEX_VERSION, profiles: [] } // 缺失/不可读 → 空库
    }
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.profiles)) {
        return { version: PROFILES_INDEX_VERSION, profiles: [], invalidEntryCount: 1 }
      }
      let invalidEntryCount = 0
      const items = parsed.profiles
        .filter(item => {
          const valid = item && typeof item === 'object' &&
            isSafeProfileId(item.id) && typeof item.name === 'string' &&
            normalizeProfileName(item.name) === item.name &&
            isSafePipelineId(item.pipelineId) && isPlainObject(item.snapshot)
          if (!valid) invalidEntryCount += 1
          return valid
        })
        .map(item => ({
          id: item.id,
          name: item.name,
          pipelineId: item.pipelineId,
          snapshot: item.snapshot,
          createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : 0,
          updatedAt: Number.isFinite(Number(item.updatedAt)) ? Number(item.updatedAt) : 0,
        }))
      return { version: PROFILES_INDEX_VERSION, profiles: items, invalidEntryCount }
    } catch (_) {
       return { version: PROFILES_INDEX_VERSION, profiles: [] } // 不可解析索引 → 空库降级，可由下一次合法 create 重建
    }
  }

  _writeIndex (index) {
    fs.mkdirSync(this.profilesDir, { recursive: true })
    // invalidEntryCount/droppedInvalid 是本次读取的内部诊断元数据，不能写入持久化 schema。
    const serialized = JSON.stringify({
      version: PROFILES_INDEX_VERSION,
      profiles: Array.isArray(index?.profiles) ? index.profiles : [],
    }, null, 2)
    const tempPath = path.join(this.profilesDir, '.' + INDEX_FILE_NAME + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp')
    try {
      fs.writeFileSync(tempPath, serialized, { encoding: 'utf8', flag: 'wx' })
    } catch (error) {
      try { fs.unlinkSync(tempPath) } catch (_) { /* 写失败清理临时文件 */ }
      throw error
    }
    try {
      renameWithRetry(tempPath, this.indexPath)
    } catch (error) {
      try { fs.unlinkSync(tempPath) } catch (_) { /* 临时文件清理失败忽略 */ }
      throw error
    }
  }

  _assertWritableIndex (index) {
    if (Number(index?.invalidEntryCount) > 0) {
      throw new ProfileValidationError('索引包含无法识别的配置条目，已停止写入以避免数据丢失')
    }
  }

  _findIndex (pipelineId) {
    const index = this._readIndex()
    if (!pipelineId) return index
    return { ...index, profiles: index.profiles.filter(item => item.pipelineId === pipelineId) }
  }

  /** 列出全部（或按 pipelineId 过滤）配置记录。 */
  list (pipelineId) {
    const index = this._findIndex(pipelineId)
    return index.profiles.map(item => ({ ...item }))
  }

  /**
   * 创建配置。重名（同 pipelineId）默认拒绝；overwrite=true 时覆盖同名旧记录。
   * @param {{ pipelineId: string, name: string, snapshot: object, overwrite?: boolean }} request
   */
  create (request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new ProfileValidationError('配置参数无效')
    if (!isSafePipelineId(request.pipelineId)) throw new ProfileValidationError('流水线标识无效（1-64 字符字母数字）')
    const name = normalizeProfileName(request.name)
    if (!name) throw new ProfileValidationError('配置名称需为 1-60 个字符')
    if (!isPlainObject(request.snapshot)) throw new ProfileValidationError('配置快照无效')
    const { serialized, bytes } = serializeSnapshot(request.snapshot)
    if (bytes > MAX_SNAPSHOT_BYTES) throw new ProfileValidationError('配置快照过大，无法保存（上限 64KB）')
    const index = this._readIndex()
    this._assertWritableIndex(index)
    const samePipeline = index.profiles.filter(item => item.pipelineId === request.pipelineId)
    const existing = samePipeline.find(item => item.name === name)
    if (existing) {
      if (!request.overwrite) throw new ProfileValidationError('已存在同名配置')
      existing.snapshot = JSON.parse(serialized)
      existing.updatedAt = this.now()
      this._writeIndex(index)
      return { ...existing }
    }
    if (samePipeline.length >= MAX_PROFILES_PER_PIPELINE) {
      throw new ProfileValidationError('单流水线最多保存 50 个配置')
    }
    const entry = {
      id: this.idFactory(),
      name,
      pipelineId: request.pipelineId,
      snapshot: JSON.parse(serialized),
      createdAt: this.now(),
      updatedAt: this.now(),
    }
    index.profiles.push(entry)
    this._writeIndex(index)
    return { ...entry }
  }

  /** 重命名配置（trim、同流水线唯一）。 */
  rename (id, name) {
    if (!isSafeProfileId(id)) throw new ProfileValidationError('配置条目无效')
    const normalized = normalizeProfileName(name)
    if (!normalized) throw new ProfileValidationError('配置名称需为 1-60 个字符')
    const index = this._readIndex()
    this._assertWritableIndex(index)
    const entry = index.profiles.find(item => item.id === id)
    if (!entry) throw new ProfileValidationError('配置不存在或已被删除')
    const duplicate = index.profiles.find(item => item.id !== id && item.pipelineId === entry.pipelineId && item.name === normalized)
    if (duplicate) throw new ProfileValidationError('已存在同名配置')
    entry.name = normalized
    entry.updatedAt = this.now()
    this._writeIndex(index)
    return { ...entry }
  }

  /** 删除配置（仅索引原子更新）。 */
  delete (id) {
    if (!isSafeProfileId(id)) throw new ProfileValidationError('配置条目无效')
    const index = this._readIndex()
    this._assertWritableIndex(index)
    const entry = index.profiles.find(item => item.id === id)
    if (!entry) throw new ProfileValidationError('配置不存在或已被删除')
    index.profiles = index.profiles.filter(item => item.id !== id)
    this._writeIndex(index)
    return { deleted: true, id }
  }
}

function getStory2VideoConfigProfiles (options = {}) {
  return new Story2VideoConfigProfiles(options)
}

module.exports = {
  ProfileValidationError,
  PROFILES_INDEX_VERSION,
  MAX_NAME_LENGTH,
  MAX_PIPELINE_ID_LENGTH,
  MAX_PROFILES_PER_PIPELINE,
  MAX_SNAPSHOT_BYTES,
  SNAPSHOT_SCHEMA_VERSION,
  Story2VideoConfigProfiles,
  getStory2VideoConfigProfiles,
  normalizeProfileName,
  isSafeProfileId,
  isSafePipelineId,
}
