// @ts-check
'use strict'
/**
 * pipeline-card-backgrounds.js — 视频创作首页流水线卡片背景服务
 *
 * 职责：
 *  - 通过已配置图片生成 provider（默认 MiniMax image-01）为每个流水线生成统一风格
 *    的差异化背景图（磁盘缓存 + manifest，命中不重复调用 API）。
 *  - 安全下载：仅 HTTPS、拒绝私有/环回/链路本地地址、校验 image/* Content-Type 与大小上限。
 *  - 最小 loopback 静态服务：127.0.0.1 随机端口 + 随机 token，仅服务缓存目录内 realpath
 *    校验通过的文件，供渲染端（dev http://localhost 或打包 file://）加载本地图片。
 *
 * 安全边界（QM-2/SSRF）：
 *  - 下载 URL 必须 https:，禁止带凭据，禁止重定向跟随（redirect:'error'）。
 *  - 本地服务仅 GET/HEAD、nosniff、图片 Content-Type、token 白名单 + 目录边界校验。
 */
const fs = require('fs')
const path = require('path')
const http = require('http')
const crypto = require('crypto')
const dns = require('dns')

const VALID_NAME_RE = /^[A-Za-z0-9_-]{1,80}$/
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/
const CACHE_SUBDIR = 'pipeline-card-bg'
const SERVER_PATH_PREFIX = '/pipeline-card-bg/'
const MANIFEST_VERSION = 1
const DEFAULT_MAX_BATCH = 50
const DEFAULT_MAX_CONCURRENT = 2
const DEFAULT_MAX_BYTES = 12 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_MAX_ENTRIES = 200
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const IMAGE_CONTENT_TYPES = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
})

class ValidationError extends Error {
  constructor (message) {
    super(message)
    this.name = 'ValidationError'
    this.code = 'VALIDATION_ERROR'
  }
}

/** 每流水线背景提示词：统一风格块 + 主题意象（克制、低饱和、留白、无文字无人物） */
const STYLE_BLOCK = 'Minimalist premium abstract background, soft muted gradient light, deep low-saturation dark tones, subtle geometric shapes, generous negative space, no text, no logos, no people, high-end tech aesthetic, gentle glow, 16:9'
const THEME_WORDS = Object.freeze({
  'story2video-compose': 'aurora light trails',
  'animated-explainer': 'floating soft rounded shapes',
  'talking-head': 'smooth audio waveform lines',
  cinematic: 'soft film lens light flare',
  'clip-factory': 'mosaic of light rectangles',
  'documentary-montage': 'layered translucent photo frames',
  'localization-dub': 'soft concentric language ripple',
  hybrid: 'blending gradient silhouettes',
  animation: 'gentle motion curves',
  'avatar-spokesperson': 'soft studio spotlight',
  'character-animation': 'abstract character silhouette',
  'framework-smoke': 'subtle blueprint grid',
  'screen-demo': 'window glass reflection',
  'video-clone': 'mirrored light split',
  'podcast-repurpose': 'flowing sound wave ribbons',
})

function promptFor (name) {
  const theme = THEME_WORDS[name] || 'abstract soft light geometry'
  return `${theme}, ${STYLE_BLOCK}`
}

function isPrivateAddress (address) {
  if (!address) return true
  const v4 = address.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 0 || a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a >= 224) return true
    return false
  }
  const lower = String(address).toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80:')) return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7)
    const m = mapped.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (m) {
      const [a, b] = [Number(m[1]), Number(m[2])]
      if (a === 127 || a === 10) return true
      if (a === 169 && b === 254) return true
      if (a === 172 && b >= 16 && b <= 31) return true
      if (a === 192 && b === 168) return true
      return a >= 224
    }
    return false
  }
  return false
}

async function defaultResolveAddress (hostname) {
  const results = await dns.promises.lookup(String(hostname), { all: true, verbatim: true })
  return Array.isArray(results) && results.length > 0 ? results[0] : null
}

function safeJsonParse (value, fallback = null) {
  if (typeof value !== 'string') return fallback
  try { return JSON.parse(value) } catch (_) { return fallback }
}

function atomicWriteFileSync (filePath, buffer) {
  const tmp = filePath + '.tmp'
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(tmp, buffer)
  let lastError
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      fs.renameSync(tmp, filePath)
      return
    } catch (error) {
      lastError = error
      if (error && (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EBUSY')) {
        // Windows 短暂占用：有界退避后重试，超预算原样抛出（QM 原子替换语义）
        const waitMs = 50 * (attempt + 1)
        const end = Date.now() + waitMs
        while (Date.now() < end) { /* busy wait 有界 */ }
        continue
      }
      throw error
    }
  }
  throw lastError || new Error('atomic rename failed')
}

function extractImageUrl (result) {
  if (!result || typeof result !== 'object') return null
  const candidates = [
    result.urls, result.image_urls, result.images, result.data?.images,
    result.data?.image_urls, result.image_urls,
  ]
  for (const list of candidates) {
    if (Array.isArray(list) && list.length > 0) {
      const first = list[0]
      if (typeof first === 'string' && first) return first
      if (first && typeof first.url === 'string' && first.url) return first.url
    }
  }
  for (const key of ['url', 'image', 'data']) {
    const value = result[key]
    if (typeof value === 'string' && value) return value
  }
  const data = result.data
  if (data && typeof data.image === 'string' && data.image) return data.image
  return null
}

class PipelineCardBackgrounds {
  /**
   * @param {object} options
   * @param {string} options.userDataDir - app.getPath('userData')（测试传临时目录）
   * @param {object} options.manager - ModelProviderManager 兼容接口（getDefault/listProviders/callAdapter）
   * @param {Function} [options.fetchImpl] - 图片下载 fetch（默认 global fetch）
   * @param {Function} [options.resolveAddress] - hostname→{address,family}（默认 dns lookup）
   * @param {Function} [options.serverFactory] - http server 工厂（默认 http.createServer）
   * @param {object} [options.log] - logger（默认 console）
   * @param {Function} [options.now] - 时钟（测试注入）
   */
  constructor (options = {}) {
    this.userDataDir = options.userDataDir
    this.manager = options.manager
    this.fetchImpl = options.fetchImpl || globalThis.fetch
    this.resolveAddress = options.resolveAddress || defaultResolveAddress
    this.log = options.log || console
    this.now = options.now || (() => Date.now())
    this.serverFactory = options.serverFactory || http.createServer
    this.maxConcurrent = Number.isInteger(options.maxConcurrent) && options.maxConcurrent > 0 ? options.maxConcurrent : DEFAULT_MAX_CONCURRENT
    this.maxBatch = Number.isInteger(options.maxBatch) && options.maxBatch > 0 ? options.maxBatch : DEFAULT_MAX_BATCH
    this.maxBytes = Number.isInteger(options.maxBytes) && options.maxBytes > 0 ? options.maxBytes : DEFAULT_MAX_BYTES
    this.timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS
    this.maxEntries = Number.isInteger(options.maxEntries) && options.maxEntries > 0 ? options.maxEntries : DEFAULT_MAX_ENTRIES
    this.ttlMs = Number.isInteger(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS
    this.cacheDir = path.join(String(this.userDataDir), CACHE_SUBDIR)
    this._server = null
    this._origin = ''
    this._startPromise = null
    this._tokens = new Map()
  }

  get origin () { return this._origin }

  /** 启动 loopback 静态服务（127.0.0.1 随机端口） */
  async start () {
    if (this._origin) return this._origin
    if (this._startPromise) return this._startPromise
    const server = this.serverFactory((request, response) => { this._handleRequest(request, response) })
    this._server = server
    this._startPromise = new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.removeListener('error', onError)
        const address = server.address()
        if (!address || typeof address === 'string' || !Number.isInteger(address.port)) {
          reject(new Error('卡片背景服务端口不可用'))
          return
        }
        this._origin = 'http://127.0.0.1:' + address.port
        resolve(this._origin)
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(0, '127.0.0.1')
    }).catch((error) => {
      if (this._server === server) this._server = null
      this._startPromise = null
      throw error
    })
    return this._startPromise
  }

  async stop () {
    this._tokens.clear()
    const pendingStart = this._startPromise
    if (pendingStart && !this._origin) {
      try { await pendingStart } catch { return }
    }
    const server = this._server
    this._server = null
    this._origin = ''
    this._startPromise = null
    if (!server) return
    await new Promise((resolve) => { server.close(() => resolve()) })
  }

  /**
   * 确保一批流水线的背景图可用（生成/缓存复用）
   * @param {object} params
   * @param {string[]} params.names - 流水线名称（白名单校验）
   * @param {boolean} [params.force] - 强制重新生成
   * @returns {Promise<object>} { available, provider, backgrounds, generated, cached, failed, skipped }
   */
  async ensure ({ names, force = false } = {}) {
    if (!Array.isArray(names)) throw new ValidationError('流水线名称列表必须为数组')
    if (names.length > this.maxBatch) throw new ValidationError(`单次请求流水线数量超过上限（${this.maxBatch}）`)
    for (const name of names) {
      if (typeof name !== 'string' || !VALID_NAME_RE.test(name)) {
        throw new ValidationError('流水线名称非法：必须为 1-80 位字母/数字/_/-')
      }
    }
    const uniqueNames = [...new Set(names)]

    const providerId = await this._resolveProvider()
    if (!providerId) {
      return { available: false, provider: null, backgrounds: {}, generated: [], cached: [], failed: [], skipped: [] }
    }
    if (!this._origin) await this.start()

    const manifest = this._loadManifest()
    const backgrounds = {}
    const generated = []
    const cached = []
    const skipped = []
    const failed = []
    const toGenerate = []

    for (const name of uniqueNames) {
      const filePath = this._candidateCachePath(name)
      const entry = manifest.items && manifest.items[name]
      const cacheValid = this._isValidCacheEntry(entry, filePath)
      if (!force && cacheValid) {
        const url = this._registerToken(filePath)
        backgrounds[name] = { url, status: 'cached' }
        cached.push(name)
      } else {
        toGenerate.push(name)
      }
    }

    if (toGenerate.length > 0) {
      const results = await mapLimit(toGenerate, this.maxConcurrent, async (name) => {
        try {
          const outcome = await this._generateOne(name, providerId)
          this._saveManifestEntry(manifest, outcome)
          const url = this._registerToken(outcome.path)
          return { name, url, status: 'generated' }
        } catch (error) {
          this._warn(`卡片背景生成失败: ${name}`, error)
          return { name, error }
        }
      })
      for (const item of results) {
        if (item.error) {
          failed.push({ name: item.name, message: item.error && item.error.message ? item.error.message : String(item.error) })
        } else {
          backgrounds[item.name] = { url: item.url, status: item.status }
          generated.push(item.name)
        }
      }
    }

    return { available: true, provider: providerId, backgrounds, generated, cached, failed, skipped }
  }

  async _resolveProvider () {
    if (!this.manager) return null
    try {
      if (typeof this.manager.getDefault === 'function') {
        const def = await this.manager.getDefault('image')
        if (def && typeof def.id === 'string' && def.id && def.is_configured !== false) return def.id
      }
      if (typeof this.manager.listProviders === 'function') {
        const rows = await this.manager.listProviders('image')
        const hit = (Array.isArray(rows) ? rows : []).find((p) => p && typeof p.id === 'string' && p.id && p.enabled !== false && p.is_configured !== false)
        if (hit) return hit.id
      }
    } catch (error) {
      this._warn('解析图片生成 provider 失败', error)
    }
    return null
  }

  async _generateOne (name, providerId) {
    const prompt = promptFor(name)
    const result = await this.manager.callAdapter(providerId, 'generateImage', { prompt, size: '1280x720' })
    const url = extractImageUrl(result)
    if (!url) throw new Error('图片生成未返回可用 URL')
    const buffer = await this._downloadImage(url)
    const filePath = this._candidateCachePath(name)
    atomicWriteFileSync(filePath, buffer)
    return { name, path: filePath, providerId }
  }

  async _downloadImage (url) {
    let parsed
    try { parsed = new URL(url) } catch (error) { throw new Error('图片 URL 非法', { cause: error }) }
    if (parsed.protocol !== 'https:') throw new Error('图片 URL 必须使用 HTTPS')
    if (parsed.username || parsed.password) throw new Error('图片 URL 不得包含凭据')

    const addr = await this.resolveAddress(parsed.hostname)
    if (!addr || isPrivateAddress(addr.address)) {
      throw new Error('图片地址解析到私有/内网/环回地址，已拒绝下载')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let response
    try {
      response = await this.fetchImpl(parsed.toString(), { signal: controller.signal, redirect: 'error' })
    } catch (error) {
      const msg = error && error.message ? error.message : String(error)
      throw new Error('图片下载失败: ' + msg, { cause: error })
    } finally {
      clearTimeout(timer)
    }
    if (!response || response.ok !== true) {
      throw new Error('图片下载失败: HTTP ' + (response && response.status ? response.status : 'unknown'))
    }
    const contentType = typeof response.headers?.get === 'function' ? response.headers.get('content-type') : ''
    if (typeof contentType !== 'string' || !/^image\//i.test(contentType)) {
      throw new Error('图片 Content-Type 非法: ' + String(contentType || 'empty'))
    }
    let buffer
    try { buffer = Buffer.from(await response.arrayBuffer()) } catch (error) { throw new Error('图片下载内容不可读', { cause: error }) }
    if (!buffer || buffer.length === 0) throw new Error('图片下载内容为空')
    if (buffer.length > this.maxBytes) throw new Error('图片超过大小上限')
    return buffer
  }

  _candidateCachePath (name) {
    return path.join(this.cacheDir, name + '.png')
  }

  _isValidCacheEntry (entry, filePath) {
    if (!entry || typeof entry.path !== 'string' || !path.isAbsolute(entry.path)) return false
    try {
      const canonicalCache = fs.realpathSync.native(this.cacheDir)
      const canonicalFile = fs.realpathSync.native(entry.path)
      if (canonicalFile !== fs.realpathSync.native(filePath)) return false
      if (!canonicalFile.startsWith(canonicalCache + path.sep)) return false
      return fs.statSync(canonicalFile).isFile()
    } catch (_) {
      return false
    }
  }

  _loadManifest () {
    try {
      const raw = fs.readFileSync(path.join(this.cacheDir, 'manifest.json'), 'utf8')
      const parsed = safeJsonParse(raw, {})
      if (!parsed || parsed.version !== MANIFEST_VERSION || !parsed.items || typeof parsed.items !== 'object') {
        return { version: MANIFEST_VERSION, items: {} }
      }
      return { version: MANIFEST_VERSION, items: parsed.items }
    } catch (_) {
      return { version: MANIFEST_VERSION, items: {} }
    }
  }

  _saveManifestEntry (manifest, outcome) {
    manifest.items[outcome.name] = {
      path: outcome.path,
      provider: outcome.providerId,
      generatedAt: this.now(),
    }
    try {
      atomicWriteFileSync(path.join(this.cacheDir, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))
    } catch (error) {
      this._warn('写入卡片背景 manifest 失败', error)
    }
  }

  _registerToken (filePath) {
    this._pruneTokens()
    if (this._tokens.size >= this.maxEntries) {
      let oldest = null
      for (const [token, entry] of this._tokens) {
        if (!oldest || entry.expiresAt < oldest.expiresAt) oldest = { token, expiresAt: entry.expiresAt }
      }
      if (oldest) this._tokens.delete(oldest.token)
    }
    const token = crypto.randomBytes(16).toString('hex')
    this._tokens.set(token, { filePath, expiresAt: this.now() + this.ttlMs })
    return this._origin + SERVER_PATH_PREFIX + token
  }

  _pruneTokens () {
    const now = this.now()
    for (const [token, entry] of this._tokens) {
      if (entry.expiresAt <= now) this._tokens.delete(token)
    }
  }

  _handleRequest (request, response) {
    response.setHeader('Cache-Control', 'no-store, private')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    if (!request || !['GET', 'HEAD'].includes(String(request.method || ''))) {
      return this._notFound(response)
    }
    let requestUrl
    try { requestUrl = new URL(request.url || '', this._origin || 'http://127.0.0.1') } catch (_) { return this._notFound(response) }
    if (requestUrl.search || requestUrl.hash) return this._notFound(response)
    if (!requestUrl.pathname.startsWith(SERVER_PATH_PREFIX)) return this._notFound(response)
    const token = requestUrl.pathname.slice(SERVER_PATH_PREFIX.length)
    if (!TOKEN_RE.test(token)) return this._notFound(response)
    const entry = this._tokens.get(token)
    if (!entry) return this._notFound(response)
    let canonical
    try {
      const canonicalCache = fs.realpathSync.native(this.cacheDir)
      canonical = fs.realpathSync.native(entry.filePath)
      if (!canonical.startsWith(canonicalCache + path.sep)) return this._notFound(response)
      if (!fs.statSync(canonical).isFile()) return this._notFound(response)
    } catch (_) {
      return this._notFound(response)
    }
    const ext = path.extname(canonical).slice(1).toLowerCase()
    const contentType = IMAGE_CONTENT_TYPES[ext] || 'application/octet-stream'
    if (!contentType.startsWith('image/')) return this._notFound(response)
    response.setHeader('Content-Type', contentType)
    if (request.method === 'HEAD') {
      response.writeHead(200)
      response.end()
      return
    }
    const stream = fs.createReadStream(canonical)
    stream.on('error', () => { this._notFound(response) })
    response.writeHead(200)
    stream.pipe(response)
  }

  _notFound (response) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not Found')
  }

  _warn (message, error) {
    try {
      if (this.log && typeof this.log.warn === 'function') {
        this.log.warn('[pipeline-card-backgrounds]', message, error && error.message ? error.message : '')
      }
    } catch (_) { /* 日志失败不影响主流程 */ }
  }
}

/** 并发受限 map（每项独立捕获错误） */
async function mapLimit (items, limit, fn) {
  const results = new Array(items.length)
  let index = 0
  const workerCount = Math.max(1, Math.min(Number(limit) || 1, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (index < items.length) {
      const i = index
      index += 1
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

module.exports = {
  PipelineCardBackgrounds,
  ValidationError,
  VALID_NAME_RE,
  promptFor,
  isPrivateAddress,
  extractImageUrl,
  atomicWriteFileSync,
}
