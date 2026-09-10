/**
 * CoolDownPool — L5 冷却池
 *
 * 职责：
 * 1. 管理账号/IP 黑名单
 * 2. 指数退避解冻时间（6 级：30min → 1h → 2h → 4h → 8h → 24h）
 * 3. 内存态 + JSONL 持久化（重启不丢失）
 */

const fs = require('fs')
const path = require('path')

const NL = String.fromCharCode(10)
const BAN_LEVELS = [30 * 60 * 1000, 60 * 60 * 1000, 2 * 60 * 60 * 1000, 4 * 60 * 60 * 1000, 8 * 60 * 60 * 1000, 24 * 60 * 60 * 1000]

function cooldownDurationMs (level) {
  const idx = Math.max(0, Math.min(level, BAN_LEVELS.length - 1))
  return BAN_LEVELS[idx]
}

class CoolDownPool {
  constructor (opts = {}) {
    this._now = opts.now || (() => Date.now())
    this._file = opts.file || null
    this._entries = new Map()
    if (this._file && fs.existsSync(this._file)) {
      this._load()
    }
  }

  _key (type, id) {
    return type + ':' + id
  }

  _load () {
    try {
      const lines = fs.readFileSync(this._file, 'utf8').split(NL).filter(Boolean)
      for (const line of lines) {
        const e = JSON.parse(line)
        this._entries.set(this._key(e.type, e.id), e)
      }
    } catch (_) { }
  }

  _persist () {
    if (!this._file) return
    try {
      const dir = path.dirname(this._file)
      fs.mkdirSync(dir, { recursive: true })
      const lines = [...this._entries.values()].map(e => JSON.stringify(e)).join(NL)
      const tmp = this._file + '.tmp'
      fs.writeFileSync(tmp, lines + (lines ? NL : ''), 'utf8')
      fs.renameSync(tmp, this._file)
    } catch (_) { }
  }

  ban (type, id, reason = '', level = 0) {
    const key = this._key(type, id)
    const existing = this._entries.get(key)
    const nextLevel = existing
      ? Math.min(existing.level + 1, BAN_LEVELS.length - 1)
      : Math.max(0, Math.min(level, BAN_LEVELS.length - 1))
    const bannedAt = this._now()
    const entry = {
      type,
      id,
      reason,
      level: nextLevel,
      bannedAt,
      expiresAt: bannedAt + cooldownDurationMs(nextLevel),
    }
    this._entries.set(key, entry)
    this._persist()
    return { banned: true, level: nextLevel, expiresAt: entry.expiresAt }
  }

  isBanned (type, id) {
    const entry = this._entries.get(this._key(type, id))
    if (!entry) return false
    return this._now() < entry.expiresAt
  }

  unban (type, id) {
    const key = this._key(type, id)
    const existed = this._entries.has(key)
    this._entries.delete(key)
    this._persist()
    return existed
  }

  unfreezeExpired () {
    let count = 0
    for (const [key, entry] of this._entries) {
      if (this._now() >= entry.expiresAt) {
        this._entries.delete(key)
        count += 1
      }
    }
    if (count > 0) this._persist()
    return count
  }

  list () {
    return [...this._entries.values()].map(e => ({ ...e }))
  }
}

module.exports = {
  CoolDownPool,
  cooldownDurationMs,
  BAN_LEVELS,
}
