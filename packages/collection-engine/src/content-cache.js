/**
 * ContentCache — L6 内容去重缓存
 *
 * 职责：
 * 1. 基于 URL + 内容前 N 字节的联合哈希去重
 * 2. LRU 淘汰
 * 3. 命中率统计
 *
 * 纯 Node，可单测。
 */

const crypto = require('crypto')

function hashKey (url, contentPreview = '') {
  const digest = crypto
    .createHash('sha256')
    .update(String(url) + '::' + String(contentPreview).slice(0, 256))
    .digest('hex')
  return digest
}

class ContentCache {
  constructor (opts = {}) {
    this.maxSize = opts.maxSize || 10000
    this._map = new Map() // hash -> { url, contentPreview, insertedAt }
    this._urlSet = new Map() // url -> true（URL 级去重，采集前检查用）
    this._hits = 0
    this._misses = 0
  }

  /** URL 级去重：该 URL 是否已采集过（不关心内容） */
  hasUrl (url) {
    const s = String(url)
    if (!this._urlSet.has(s)) return false
    // 清理已被 LRU 淘汰但 _urlSet 残留的条目
    if (![...this._map.values()].some(e => e.url === s)) {
      this._urlSet.delete(s)
      return false
    }
    return true
  }

  /** 检查是否已缓存（相同 URL + 内容） */
  has (url, contentPreview = '') {
    const key = hashKey(url, contentPreview)
    if (!this._map.has(key)) {
      this._misses += 1
      return false
    }
    // LRU touch
    const entry = this._map.get(key)
    this._map.delete(key)
    this._map.set(key, entry)
    this._hits += 1
    return true
  }

  /** 标记内容已采集 */
  mark (url, contentPreview = '', metadata = {}) {
    const key = hashKey(url, contentPreview)
    this._urlSet.set(String(url), true)
    if (this._map.has(key)) {
      return false // 已存在
    }
    this._map.set(key, {
      url,
      contentPreview: String(contentPreview).slice(0, 256),
      metadata,
      insertedAt: Date.now(),
    })
    // LRU 淘汰最旧，同步清理 URL 索引
    if (this._map.size > this.maxSize) {
      const oldestKey = this._map.keys().next().value
      const oldest = this._map.get(oldestKey)
      if (oldest) this._urlSet.delete(String(oldest.url))
      this._map.delete(oldestKey)
    }
    return true
  }

  /** 缓存统计 */
  stats () {
    const total = this._hits + this._misses
    return {
      hits: this._hits,
      misses: this._misses,
      size: this._map.size,
      maxSize: this.maxSize,
      hitRate: total === 0 ? 0 : this._hits / total,
    }
  }

  /** 清空缓存 */
  clear () {
    this._map.clear()
    this._urlSet.clear()
    this._hits = 0
    this._misses = 0
  }
}

module.exports = {
  ContentCache,
  hashKey,
}
