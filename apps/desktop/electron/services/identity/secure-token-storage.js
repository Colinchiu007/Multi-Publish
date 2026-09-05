const fs = require('fs')
const path = require('path')
const { IdentityError } = require('./identity-errors')

const STORAGE_VERSION = 2 // v2: 新增 encrypted 字段，支持 safeStorage 不可用时明文回退

function defaultFilePath() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'identity-session.json')
}

class SecureTokenStorage {
  constructor(options = {}) {
    this._safeStorage = options.safeStorage || require('electron').safeStorage
    this._filePath = options.filePath || (options.read || options.write ? null : defaultFilePath())
    this._read = options.read || (() => fs.promises.readFile(this._filePath, 'utf8').catch((error) => {
      if (error && error.code === 'ENOENT') return null
      throw error
    }))
    this._write = options.write || ((value) => this._writeAtomic(value))
    this._remove = options.remove || (() => fs.promises.unlink(this._filePath).catch((error) => {
      if (!error || error.code !== 'ENOENT') throw error
    }))
    this._mutation = Promise.resolve()
  }

  _isEncryptionAvailable() {
    return !!(this._safeStorage && typeof this._safeStorage.isEncryptionAvailable === 'function' &&
      this._safeStorage.isEncryptionAvailable())
  }

  _assertAvailable() {
    if (!this._isEncryptionAvailable()) {
      throw new IdentityError('IDENTITY_SECURE_STORAGE_UNAVAILABLE', '操作系统安全存储不可用')
    }
  }

  async _writeAtomic(value) {
    await fs.promises.mkdir(path.dirname(this._filePath), { recursive: true })
    const tempPath = `${this._filePath}.${process.pid}.tmp`
    await fs.promises.writeFile(tempPath, value, { encoding: 'utf8', mode: 0o600 })
    try {
      await fs.promises.rename(tempPath, this._filePath)
    } catch (error) {
      await fs.promises.unlink(tempPath).catch(() => {})
      throw error
    }
  }

  async save(session) {
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
      throw new IdentityError('IDENTITY_SESSION_INVALID', '会话必须是对象')
    }
    const plaintext = JSON.stringify(session)
    const encrypted = this._isEncryptionAvailable()
    const ciphertext = encrypted
      ? Buffer.from(this._safeStorage.encryptString(plaintext)).toString('base64')
      : Buffer.from(plaintext, 'utf8').toString('base64')
    const envelope = JSON.stringify({
      version: STORAGE_VERSION,
      ciphertext,
      encrypted,
    })
    await this._write(envelope)
  }

  async getItem(key) {
    await this._mutation
    const session = await this.load()
    return session && Object.prototype.hasOwnProperty.call(session, key) ? session[key] : null
  }

  async setItem(key, value) {
    return this._enqueue(async () => {
      const session = (await this.load()) || {}
      session[key] = String(value)
      await this.save(session)
    })
  }

  async removeItem(key) {
    return this._enqueue(async () => {
      const session = (await this.load()) || {}
      if (!Object.prototype.hasOwnProperty.call(session, key)) return
      delete session[key]
      if (Object.keys(session).length === 0) return this._clearNow()
      await this.save(session)
    })
  }

  _enqueue(work) {
    const run = this._mutation.catch(() => {}).then(work)
    this._mutation = run.catch(() => {})
    return run
  }

  async load() {
    const envelopeText = await this._read()
    if (!envelopeText) return null
    try {
      const envelope = JSON.parse(envelopeText)
      if (typeof envelope.ciphertext !== 'string') {
        throw new Error('会话存储格式不受支持')
      }
      const encrypted = envelope.encrypted !== false
      // v1 兼容：无 encrypted 字段视为加密存储
      if (envelope.version === undefined && encrypted) {
        // v1 格式（无 version 字段），需要安全存储解密
        this._assertAvailable()
      }
      if (encrypted) {
        this._assertAvailable()
      }
      const cipherBytes = Buffer.from(envelope.ciphertext, 'base64')
      const plaintext = encrypted
        ? this._safeStorage.decryptString(cipherBytes)
        : cipherBytes.toString('utf8')
      const session = JSON.parse(plaintext)
      if (!session || typeof session !== 'object' || Array.isArray(session)) {
        throw new Error('会话内容无效')
      }
      return session
    } catch (error) {
      // 安全存储暂时不可用（OS keyring 锁定等）→ 保留密文，下次重试；其余损坏才清理
      if (error && error.code === 'IDENTITY_SECURE_STORAGE_UNAVAILABLE') {
        throw error
      }
      await this._clearNow()
      return null
    }
  }

  async clear() {
    return this._enqueue(() => this._clearNow())
  }

  async _clearNow() {
    await this._remove()
  }
}

module.exports = SecureTokenStorage