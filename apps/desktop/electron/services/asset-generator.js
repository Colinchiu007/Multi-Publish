// @ts-check
/**
 * AssetGenerator - 资源生成服务
 *
 * 职责：
 *   - generateImage: 用 ffmpeg 生成带文字的占位图片（无需外部 API）
 *   - generateTTS: 用 edge-tts 生成语音（免费，无需 API key），fallback 到静音音频
 *
 * 设计意图：
 *   替代 serviceBus.callPythonSkill('generate_image'/'generate_tts')，
 *   让 generate_assets 阶段无需依赖 Python 后端即可产出资源。
 */
'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const dns = require('dns')
const net = require('net')
const https = require('https')
const { promisify } = require('util')
const { spawn } = require('child_process')
const { findFfmpeg } = require('./media-tool-paths')

const execFileAsync = promisify(execFile)
const MAX_PROVIDER_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_PROVIDER_AUDIO_BYTES = 100 * 1024 * 1024
const PROVIDER_IMAGE_TIMEOUT_MS = 30 * 1000
const AUDIO_FORMAT_EXTENSIONS = Object.freeze({
  aac: 'aac',
  flac: 'flac',
  mp3: 'mp3',
  mpeg: 'mp3',
  ogg: 'ogg',
  opus: 'opus',
  wav: 'wav',
  wave: 'wav',
  pcm: 'pcm',
})
const IMAGE_PROVIDER_ALIASES = Object.freeze({
  'openai-image': 'dall-e',
})
const UNSUPPORTED_STORY2VIDEO_IMAGE_PROVIDERS = Object.freeze({
  comfyui: 'requires a workflow template and asynchronous result polling',
})

const FFMPEG = findFfmpeg()

function resolveImageSize (ratio) {
  const sizes = {
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '1:1': { width: 1024, height: 1024 },
    '4:3': { width: 1024, height: 768 },
  }
  return sizes[ratio] || sizes['16:9']
}

function buildEdgeTtsScript () {
  // 用 asyncio.run 直接执行协程，避免 Python 禁止在分号后声明 async def。
  return 'import sys, asyncio, edge_tts; asyncio.run(edge_tts.Communicate(sys.argv[1], sys.argv[2]).save(sys.argv[3]))'
}

function escapeDrawtextText (text) {
  return String(text || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
}

function safeSessionId (value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

function getConfiguredProvider (opts, names) {
  for (const name of names) {
    const value = opts?.[name]
    if (typeof value !== 'string') continue
    const provider = value.trim()
    if (/^[a-zA-Z0-9_-]{1,80}$/.test(provider)) return provider
  }
  return null
}

function canonicalImageProvider (provider) {
  return IMAGE_PROVIDER_ALIASES[provider] || provider
}

function limitBinarySize (buffer, label, maxBytes) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null
  if (buffer.length > maxBytes) throw new Error(label + ' exceeds the allowed size')
  return buffer
}

function decodeBase64 (value, label, maxBytes) {
  if (typeof value !== 'string') return null
  const dataUrl = value.match(/^data:[^;,]+;base64,(.+)$/is)
  const encoded = (dataUrl ? dataUrl[1] : value).replace(/\s/g, '')
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null
  return limitBinarySize(Buffer.from(encoded, 'base64'), label, maxBytes)
}

function toBinaryBuffer (value, label, maxBytes) {
  if (Buffer.isBuffer(value)) return limitBinarySize(value, label, maxBytes)
  if (value instanceof ArrayBuffer) return limitBinarySize(Buffer.from(value), label, maxBytes)
  if (ArrayBuffer.isView(value)) {
    return limitBinarySize(Buffer.from(value.buffer, value.byteOffset, value.byteLength), label, maxBytes)
  }
  return decodeBase64(value, label, maxBytes)
}

async function readFetchResponseBuffer (response, label, maxBytes, abort) {
  const reader = response?.body?.getReader?.()
  if (!reader) throw new Error(label + ' download did not return a readable body')

  const chunks = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
      totalBytes += chunk.length
      if (totalBytes > maxBytes) {
        try { await reader.cancel() } catch {}
        abort?.()
        throw new Error(label + ' exceeds the allowed size')
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock?.()
  }

  return limitBinarySize(Buffer.concat(chunks), label, maxBytes)
}

function firstNonEmptyString (...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function detectImageExtension (buffer) {
  if (!Buffer.isBuffer(buffer)) return null
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  return null
}

function extractProviderImageBuffer (result) {
  const candidates = [
    result?.images?.[0],
    result?.data?.images?.[0],
    result?.data?.[0],
    result?.image,
    result?.data?.image,
  ]
  for (const candidate of candidates) {
    const binary = toBinaryBuffer(
      typeof candidate === 'object' && candidate !== null
        ? (candidate.b64_json || candidate.base64 || candidate.data)
        : candidate,
      'provider image',
      MAX_PROVIDER_IMAGE_BYTES,
    )
    if (binary) return binary
  }
  return null
}

function extractProviderImageUrl (result) {
  const candidates = [
    result?.images?.[0]?.url,
    result?.data?.images?.[0]?.url,
    result?.data?.[0]?.url,
    result?.image?.url,
    result?.data?.image?.url,
    result?.urls?.[0],
    result?.url,
  ]
  return firstNonEmptyString(...candidates)
}

function normalizeHostname (hostname) {
  return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
}

function isLoopbackHostname (hostname) {
  const normalized = normalizeHostname(hostname)
  if (normalized === 'localhost' || normalized === '::1') return true
  return net.isIP(normalized) === 4 && normalized.split('.')[0] === '127'
}

const BLOCKED_IPV4_CIDRS = Object.freeze([
  [0x00000000, 8], // Current network
  [0x0a000000, 8], // RFC1918
  [0x64400000, 10], // RFC6598 shared address space
  [0x7f000000, 8], // Loopback
  [0xa9fe0000, 16], // Link-local
  [0xac100000, 12], // RFC1918
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0000200, 24], // TEST-NET-1
  [0xc01fc400, 24], // AS112-v4
  [0xc034c100, 24], // AMT
  [0xc0586300, 24], // Deprecated 6to4 relay anycast
  [0xc0a80000, 16], // RFC1918
  [0xc0af3000, 24], // Direct delegation AS112
  [0xc6120000, 15], // Benchmarking
  [0xc6336400, 24], // TEST-NET-2
  [0xcb007100, 24], // TEST-NET-3
  [0xe0000000, 3], // Multicast and reserved
])

function ipv4ToInteger (address) {
  return String(address).split('.').reduce((value, octet) => (value * 256) + Number(octet), 0)
}

function isInIpv4Cidr (address, network, prefixLength) {
  const shift = 32 - prefixLength
  return (address >>> shift) === (network >>> shift)
}

function expandIpv6Address (address) {
  const [left = '', right = '', extra] = String(address).split('::')
  if (extra !== undefined) return null
  const leftParts = left ? left.split(':') : []
  const rightParts = right ? right.split(':') : []
  const missingParts = 8 - leftParts.length - rightParts.length
  if (missingParts < 0 || (leftParts.length + rightParts.length !== 8 && !String(address).includes('::'))) return null
  const parts = [...leftParts, ...Array(missingParts).fill('0'), ...rightParts]
  if (parts.length !== 8 || parts.some(part => !/^[0-9a-f]{1,4}$/i.test(part))) return null
  return parts.map(part => Number.parseInt(part, 16))
}

function isPrivateAddress (address) {
  const normalized = String(address || '').toLowerCase()
  const version = net.isIP(normalized)
  if (version === 4) {
    const numericAddress = ipv4ToInteger(normalized)
    return BLOCKED_IPV4_CIDRS.some(([network, prefixLength]) => isInIpv4Cidr(numericAddress, network, prefixLength))
  }
  if (version === 6) {
    const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mappedV4) return isPrivateAddress(mappedV4[1])
    const parts = expandIpv6Address(normalized)
    if (!parts) return true
    const [first, second, third, fourth] = parts
    return first === 0 ||
      (first & 0xfe00) === 0xfc00 || // Unique local
      (first & 0xffc0) === 0xfe80 || // Link-local
      (first & 0xff00) === 0xff00 || // Multicast
      (first === 0x0064 && second === 0xff9b && ((third === 0 && fourth === 0) || third === 1)) || // IPv4-IPv6 translation
      (first === 0x0100 && second === 0 && third === 0 && fourth === 0) || // Discard-only /64
      (first === 0x2001 && (second & 0xfe00) === 0) || // IETF special-purpose /23
      (first === 0x2001 && second === 0x0db8) || // Documentation
      first === 0x2002 || // 6to4
      (first === 0x3fff && (second & 0xf000) === 0) || // Documentation
      first === 0x5f00 // Segment Routing
  }
  return true
}

function runWithTimeout (operation, timeoutMs, message) {
  let timeout
  const work = Promise.resolve().then(operation)
  const expiration = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([work, expiration]).finally(() => clearTimeout(timeout))
}

async function resolvePublicAddress (hostname, resolveHost, timeoutMs) {
  const addresses = await runWithTimeout(
    () => resolveHost(hostname, { all: true, verbatim: true }),
    timeoutMs,
    'provider image DNS lookup timed out',
  )
  const resolved = Array.isArray(addresses) ? addresses : [addresses]
  if (resolved.length === 0 || resolved.some(entry => isPrivateAddress(entry?.address || entry))) {
    throw new Error('provider image URL resolves to a blocked network address')
  }
  const selected = resolved[0]
  const address = selected?.address || selected
  const family = Number(selected?.family) || net.isIP(address)
  if (!family) throw new Error('provider image URL resolved to an invalid address')
  return { address, family }
}

function createVerifiedLookup (expectedHostname, verifiedAddress) {
  const expected = String(expectedHostname || '').toLowerCase()
  return (hostname, options, callback) => {
    if (String(hostname || '').toLowerCase() !== expected) {
      callback(new Error('provider image URL requested an unexpected host'))
      return
    }
    callback(null, verifiedAddress.address, verifiedAddress.family)
  }
}

function normalizeAudioExtension (format) {
  const normalized = String(format || 'mp3').trim().toLowerCase()
  if (AUDIO_FORMAT_EXTENSIONS[normalized]) return AUDIO_FORMAT_EXTENSIONS[normalized]
  const prefix = normalized.split(/[_/]/)[0]
  return AUDIO_FORMAT_EXTENSIONS[prefix] || null
}

function extractProviderAudio (result) {
  const payload = result?.audio ?? result?.data?.audio ?? result?.data
  const binary = toBinaryBuffer(payload, 'provider audio', MAX_PROVIDER_AUDIO_BYTES)
  if (!binary) return null
  const sourceFormat = firstNonEmptyString(
    result?.format,
    result?.outputFormat,
    result?.output_format,
    result?.data?.format,
    result?.data?.outputFormat,
    result?.data?.output_format,
  )
  const format = normalizeAudioExtension(sourceFormat)
  if (!format) return null
  const parsedPcmRate = sourceFormat && sourceFormat.match(/^pcm_(\d{4,6})$/i)
  return {
    buffer: binary,
    duration: Number.isFinite(Number(result?.duration)) ? Number(result.duration) : null,
    format,
    sourceFormat,
    sampleRate: Number(result?.sampleRate || result?.sample_rate || result?.data?.sampleRate || result?.data?.sample_rate || parsedPcmRate?.[1]) || null,
    channels: Number(result?.channels || result?.channel_count || result?.data?.channels || result?.data?.channel_count) || null,
    model: result?.model || result?.data?.model || null,
  }
}

function getPythonCommands () {
  const configured = firstNonEmptyString(process.env.PYTHON_PATH, process.env.PYTHON)
  const candidates = configured
    ? [{ command: configured, args: [] }]
    : [{ command: 'python', args: [] }, { command: 'py', args: ['-3'] }, { command: 'python3', args: [] }]
  const seen = new Set()
  return candidates.filter(candidate => {
    const key = candidate.command + '\u0000' + candidate.args.join('\u0000')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

class AssetGenerator {
  /**
   * @param {object} [opts]
   * @param {string} [opts.outputDir] - 输出目录
   * @param {object} [opts.log] - 日志模块
   */
  constructor (opts) {
    opts = opts || {}
    this.outputDir = opts.outputDir || path.join(os.tmpdir(), 'story2video', 'assets')
    this.log = opts.log || require('./logger')
    this.aiGenerator = opts.aiGenerator || null
    this.ffmpeg = opts.ffmpeg === undefined ? FFMPEG : opts.ffmpeg
    this.fetchImpl = opts.fetchImpl || globalThis.fetch
    this.resolveHost = opts.resolveHost || dns.promises.lookup
    this.httpsRequest = opts.httpsRequest || https.request
    this.providerImageTimeoutMs = Number.isFinite(Number(opts.providerImageTimeoutMs))
      ? Math.max(1, Math.min(PROVIDER_IMAGE_TIMEOUT_MS, Math.floor(Number(opts.providerImageTimeoutMs))))
      : PROVIDER_IMAGE_TIMEOUT_MS
    this.pythonCommands = Array.isArray(opts.pythonCommands) ? opts.pythonCommands : null
  }

  /**
   * 为一次流水线运行建立隔离目录。
   * runId/sessionId 只允许安全文件名字符，避免用户输入改变输出根目录。
   */
  _getOutputDir (opts) {
    const sessionId = safeSessionId(opts?.runId || opts?.sessionId || 'default') || 'default'
    return path.join(this.outputDir, sessionId)
  }

  _getSafeIndex (value) {
    const numeric = Number(value)
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 999999) return '0000'
    return String(numeric).padStart(4, '0')
  }

  /**
   * 生成图片。显式选择 provider 时只接受真实二进制结果；未选择时生成离线占位图。
   * @param {string} prompt - 提示词（用于绘制文字）
   * @param {object} [opts] - { style, index, aspect_ratio }
   * @returns {Promise<{code: number, data?: object, message?: string}>}
   */
  async generateImage (prompt, opts) {
    const outputDir = this._getOutputDir(opts)
    fs.mkdirSync(outputDir, { recursive: true })
    const idx = opts?.index ?? 0
    const safeIndex = this._getSafeIndex(idx)
    // 根据 aspect_ratio 设置尺寸
    const ratio = opts?.aspect_ratio || '16:9'
    const { width, height } = resolveImageSize(ratio)

    const providerResult = await this._tryProviderImage(prompt, outputDir, safeIndex, {
      ...opts,
      width,
      height,
    })
    if (providerResult) return providerResult
    if (!this.ffmpeg) return { code: -1, message: 'ffmpeg not found' }

    const imgPath = path.join(outputDir, 'img_' + safeIndex + '.png')

    // 根据 style 选择背景色
    const styleColors = {
      cinematic: '0x1a1a2e',
      realistic: '0x2d4a2d',
      cartoon: '0x4a90d9',
      anime: '0xe91e63',
      cyberpunk: '0x6a1b9a',
      watercolor: '0x7aa7b8',
      minimalist: '0xf0eee8',
    }
    const bgColor = styleColors[opts?.style] || '0x1a1a2e'

    // 截取前 30 个字符作为图片文字
    const displayText = escapeDrawtextText((prompt || '').slice(0, 30))

    const args = [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=' + bgColor + ':s=' + width + 'x' + height + ':d=1',
       '-vf', "drawtext=text='" + displayText + "':fontcolor=white:fontsize=36:" +
        'x=(w-text_w)/2:y=(h-text_h)/2:borderw=2:bordercolor=black',
      '-frames:v', '1',
      imgPath,
    ]

    try {
      await execFileAsync(this.ffmpeg, args, { timeout: 15000, maxBuffer: 512 * 1024 })
      if (!fs.existsSync(imgPath)) {
        return { code: -1, message: 'ffmpeg did not produce image' }
      }
      const stat = fs.statSync(imgPath)
      this.log.info('AssetGenerator', 'Image ' + idx + ' generated: ' + path.basename(imgPath) + ' (' + stat.size + 'B)')
      return {
        code: 0,
        data: {
          path: imgPath,
          url: imgPath,
          image_path: imgPath,
          size: stat.size,
          source: 'ffmpeg-placeholder',
          degraded: true,
        },
      }
    } catch (e) {
      this.log.warn('AssetGenerator', 'Image ' + idx + ' failed: ' + e.message)
      return { code: -1, message: e.message }
    }
  }

  async _tryProviderImage (prompt, outputDir, safeIndex, opts) {
    const selectedProvider = getConfiguredProvider(opts, ['image_provider', 'imageProvider'])
    if (!selectedProvider) return null
    const provider = canonicalImageProvider(selectedProvider)
    if (UNSUPPORTED_STORY2VIDEO_IMAGE_PROVIDERS[provider]) {
      return {
        code: -1,
        message: 'Image provider "' + provider + '" ' + UNSUPPORTED_STORY2VIDEO_IMAGE_PROVIDERS[provider],
      }
    }
    if (!this.aiGenerator || typeof this.aiGenerator.generate !== 'function') {
      return { code: -1, message: 'Image provider "' + provider + '" is not available' }
    }

    try {
      const result = await this.aiGenerator.generate('image', provider, {
        prompt: String(prompt || '').slice(0, 4000),
        n: 1,
        batch_size: 1,
        sampleCount: 1,
        response_format: 'b64_json',
        width: opts.width,
        height: opts.height,
        aspect_ratio: opts.aspect_ratio,
        aspectRatio: opts.aspect_ratio,
        style: opts.style,
        model: opts.image_model || opts.imageModel,
      })
      let buffer = extractProviderImageBuffer(result)
      if (!buffer) {
        const imageUrl = extractProviderImageUrl(result)
        if (imageUrl) buffer = await this._downloadProviderImage(imageUrl, provider)
      }
      const extension = detectImageExtension(buffer)
      if (!extension) throw new Error('provider did not return a supported image binary')

      const imagePath = path.join(outputDir, 'img_' + safeIndex + '.' + extension)
      fs.writeFileSync(imagePath, buffer)
      this.log.info('AssetGenerator', 'Image ' + opts.index + ' via provider ' + provider)
      return {
        code: 0,
        data: {
          path: imagePath,
          url: imagePath,
          image_path: imagePath,
          size: buffer.length,
          provider,
          model: result?.model || result?.data?.model || null,
          source: 'model-provider',
          degraded: false,
        },
      }
    } catch (error) {
      const message = error?.message || String(error)
      this.log.warn('AssetGenerator', 'Image provider ' + provider + ' failed: ' + message)
      return { code: -1, message: 'Image provider "' + provider + '" failed: ' + message }
    }
  }

  async _downloadProviderImage (sourceUrl, provider) {
    let imageUrl
    try {
      imageUrl = new URL(sourceUrl)
    } catch {
      throw new Error('provider returned an invalid image URL')
    }
    if (imageUrl.username || imageUrl.password) throw new Error('provider image URL must not include credentials')

    const isLoopback = isLoopbackHostname(imageUrl.hostname)
    if (isLoopback) {
      const config = typeof this.aiGenerator?.getProviderConfig === 'function'
        ? this.aiGenerator.getProviderConfig(provider)
        : null
      let baseUrl
      try { baseUrl = new URL(config?.baseUrl || config?.base_url || '') } catch { baseUrl = null }
      if (!baseUrl || !isLoopbackHostname(baseUrl.hostname) ||
          normalizeHostname(baseUrl.hostname) !== normalizeHostname(imageUrl.hostname) ||
          baseUrl.protocol !== imageUrl.protocol || baseUrl.port !== imageUrl.port) {
        throw new Error('provider image URL is not an approved local provider endpoint')
      }
      return this._fetchProviderImage(imageUrl)
    }

    if (imageUrl.protocol !== 'https:') throw new Error('provider image URL must use HTTPS')
    const literalAddress = imageUrl.hostname.replace(/^\[|\]$/g, '')
    if (net.isIP(literalAddress) && isPrivateAddress(literalAddress)) {
      throw new Error('provider image URL resolves to a blocked network address')
    }

    // 请求前解析一次并把经验证地址固定到本次连接，避免重试或复用 lookup 时发生 DNS 重绑定。
    return this._downloadProviderImageOverHttps(imageUrl)
  }

  async _fetchProviderImage (imageUrl) {
    if (typeof this.fetchImpl !== 'function') throw new Error('fetch is not available for provider image download')
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timeout = controller ? setTimeout(() => controller.abort(), this.providerImageTimeoutMs) : null
    try {
      const response = await this.fetchImpl(imageUrl.toString(), {
        redirect: 'error',
        signal: controller?.signal,
      })
      if (!response?.ok) throw new Error('provider image download failed with HTTP ' + (response?.status || 'error'))
      const contentType = response.headers?.get?.('content-type') || ''
      if (contentType && !/^image\//i.test(contentType) && !/^application\/octet-stream/i.test(contentType)) {
        throw new Error('provider image download returned an invalid content type')
      }
      const contentLength = Number(response.headers?.get?.('content-length'))
      if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_IMAGE_BYTES) {
        throw new Error('provider image exceeds the allowed size')
      }
      const buffer = await readFetchResponseBuffer(
        response,
        'provider image',
        MAX_PROVIDER_IMAGE_BYTES,
        () => controller?.abort(),
      )
      if (!buffer) throw new Error('provider image download was empty')
      return buffer
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  async _downloadProviderImageOverHttps (imageUrl) {
    const hostname = imageUrl.hostname.replace(/^\[|\]$/g, '')
    const deadline = Date.now() + this.providerImageTimeoutMs
    const getRemainingTimeout = () => Math.max(1, deadline - Date.now())
    const verifiedAddress = net.isIP(hostname)
      ? null
      : await resolvePublicAddress(hostname, this.resolveHost, getRemainingTimeout())
    const lookup = verifiedAddress ? createVerifiedLookup(hostname, verifiedAddress) : undefined
    const timeoutMs = getRemainingTimeout()
    return new Promise((resolve, reject) => {
      let settled = false
      let totalTimeout = null
      const finish = (error, value) => {
        if (settled) return
        settled = true
        if (totalTimeout) clearTimeout(totalTimeout)
        if (error) reject(error)
        else resolve(value)
      }
      let request
      try {
        request = this.httpsRequest(imageUrl, {
          method: 'GET',
          headers: { accept: 'image/*, application/octet-stream;q=0.8' },
          // 禁用全局连接复用，确保连接始终走本请求固定的 lookup 结果。
          agent: false,
          lookup,
        }, (response) => {
          const statusCode = Number(response?.statusCode)
          if (!Number.isInteger(statusCode) || statusCode < 200 || statusCode >= 300) {
            response?.resume?.()
            finish(new Error('provider image download failed with HTTP ' + (statusCode || 'error')))
            return
          }
          const contentType = response.headers?.['content-type'] || ''
          if (contentType && !/^image\//i.test(contentType) && !/^application\/octet-stream/i.test(contentType)) {
            response.resume?.()
            finish(new Error('provider image download returned an invalid content type'))
            return
          }
          const contentLength = Number(response.headers?.['content-length'])
          if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_IMAGE_BYTES) {
            response.resume?.()
            finish(new Error('provider image exceeds the allowed size'))
            return
          }
          const chunks = []
          let totalBytes = 0
          response.on('data', (chunk) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            totalBytes += buffer.length
            if (totalBytes > MAX_PROVIDER_IMAGE_BYTES) {
              const error = new Error('provider image exceeds the allowed size')
              response.destroy?.(error)
              finish(error)
              return
            }
            chunks.push(buffer)
          })
          response.once('error', finish)
          response.once('end', () => {
            try {
              const buffer = limitBinarySize(Buffer.concat(chunks), 'provider image', MAX_PROVIDER_IMAGE_BYTES)
              if (!buffer) throw new Error('provider image download was empty')
              finish(null, buffer)
            } catch (error) {
              finish(error)
            }
          })
        })
        request.once('error', finish)
        if (settled) return
        totalTimeout = setTimeout(() => request.destroy(new Error('provider image download timed out')), timeoutMs)
        request.setTimeout(timeoutMs, () => request.destroy(new Error('provider image download timed out')))
        request.end()
      } catch (error) {
        finish(error)
      }
    })
  }

  /**
   * 生成 TTS 音频。显式选择 provider 时不静默回退，默认仍优先 edge-tts。
   * @param {string} text - 待合成文本
   * @param {object} [opts] - { voice_id, index }
   * @returns {Promise<{code: number, data?: object, message?: string}>}
   */
  async generateTTS (text, opts) {
    const outputDir = this._getOutputDir(opts)
    fs.mkdirSync(outputDir, { recursive: true })
    const idx = opts?.index ?? 0
    const outputBasePath = path.join(outputDir, 'tts_' + this._getSafeIndex(idx))
    const providerResult = await this._tryProviderTTS(text, outputBasePath, opts)
    if (providerResult) return providerResult
    const audioPath = outputBasePath + '.mp3'

    // 尝试 edge-tts（通过 Python edge-tts 包，如果可用）
    const ttsResult = await this._tryEdgeTTS(text, audioPath, opts)
    if (ttsResult) return ttsResult

    // Fallback: 用 ffmpeg 生成静音音频（3秒）
    return this._generateSilence(audioPath, idx, 3.0)
  }

  async _tryProviderTTS (text, outputBasePath, opts) {
    const provider = getConfiguredProvider(opts, ['voice_provider', 'voiceProvider'])
    if (!provider) return null
    if (!this.aiGenerator || typeof this.aiGenerator.generate !== 'function') {
      return { code: -1, message: 'TTS provider "' + provider + '" is not available' }
    }

    const cleanText = String(text || '').slice(0, 4000)
    if (!cleanText) return { code: -1, message: 'TTS provider "' + provider + '" requires text' }
    try {
      const selectedVoice = firstNonEmptyString(opts?.voice_id, opts?.voiceId)
      const voiceId = selectedVoice && !['default', 'male', 'female-soft'].includes(selectedVoice)
        ? selectedVoice
        : undefined
      const requestedFormat = firstNonEmptyString(opts?.audio_format, opts?.audioFormat, opts?.output_format, opts?.outputFormat) || 'mp3'
      // ElevenLabs 的默认格式由适配器选择；显式指定时才传 outputFormat，避免把通用 mp3 误传为无效的 ElevenLabs 格式。
      const providerOutputFormat = provider.toLowerCase() === 'elevenlabs' && requestedFormat === 'mp3'
        ? undefined
        : requestedFormat
      const result = await this.aiGenerator.generate('tts', provider, {
        text: cleanText,
        input: cleanText,
        voice: voiceId,
        voice_id: voiceId,
        voiceId,
        model: opts?.voice_model || opts?.voiceModel,
        format: requestedFormat,
        response_format: requestedFormat,
        outputFormat: providerOutputFormat,
        output_format: providerOutputFormat,
        rate: opts?.rate,
        speakingRate: opts?.rate,
        speed: opts?.rate,
        speedRatio: opts?.rate,
        pitch: opts?.pitch,
        emotion: opts?.emotion,
      })
      const audio = extractProviderAudio(result)
      if (!audio) throw new Error('provider did not return supported binary audio')

      const persisted = await this._persistProviderAudio(outputBasePath, audio)
      this.log.info('AssetGenerator', 'TTS ' + opts?.index + ' via provider ' + provider)
      return {
        code: 0,
        data: {
          path: persisted.path,
          audio_path: persisted.path,
          duration: audio.duration,
          format: persisted.format,
          provider,
          model: audio.model,
          source: 'model-provider',
          degraded: false,
        },
      }
    } catch (error) {
      const message = error?.message || String(error)
      this.log.warn('AssetGenerator', 'TTS provider ' + provider + ' failed: ' + message)
      return { code: -1, message: 'TTS provider "' + provider + '" failed: ' + message }
    }
  }

  async _persistProviderAudio (outputBasePath, audio) {
    if (audio.format !== 'pcm') {
      const audioPath = outputBasePath + '.' + audio.format
      fs.writeFileSync(audioPath, audio.buffer)
      return { path: audioPath, format: audio.format }
    }
    if (!this.ffmpeg) {
      throw new Error('provider returned raw PCM audio but ffmpeg is unavailable for WAV conversion')
    }

    const sampleRate = Number.isFinite(audio.sampleRate) && audio.sampleRate >= 8000 && audio.sampleRate <= 192000
      ? Math.round(audio.sampleRate)
      : 24000
    const channels = Number.isFinite(audio.channels) && audio.channels >= 1 && audio.channels <= 2
      ? Math.round(audio.channels)
      : 1
    const pcmPath = outputBasePath + '.pcm'
    const audioPath = outputBasePath + '.wav'
    fs.writeFileSync(pcmPath, audio.buffer)
    try {
      await execFileAsync(this.ffmpeg, [
        '-y', '-f', 's16le', '-ar', String(sampleRate), '-ac', String(channels),
        '-i', pcmPath, audioPath,
      ], { timeout: 30000, maxBuffer: 512 * 1024 })
      if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size <= 0) {
        throw new Error('ffmpeg did not convert provider PCM audio')
      }
      return { path: audioPath, format: 'wav' }
    } finally {
      try { fs.rmSync(pcmPath, { force: true }) } catch { /* 清理失败不掩盖转换结果 */ }
    }
  }

  /**
   * 尝试用 edge-tts 生成语音
   * @private
   */
  async _tryEdgeTTS (text, audioPath, opts) {
    const voice = opts?.voice_id || 'zh-CN-XiaoxiaoNeural'
    // 截取前 200 个字符
    const cleanText = (text || '').slice(0, 200)
    if (!cleanText) return null

    const commands = this.pythonCommands || getPythonCommands()
    for (const spec of commands) {
      const result = await this._runEdgeTTSCommand(spec, cleanText, voice, audioPath, opts)
      if (result?.asset) return result.asset
      if (!result?.commandMissing) return null
    }
    return null
  }

  _runEdgeTTSCommand (spec, cleanText, voice, audioPath, opts) {
    return new Promise((resolve) => {
      const command = spec && typeof spec.command === 'string' ? spec.command : 'python'
      const commandArgs = Array.isArray(spec?.args) ? spec.args : []
      let settled = false
      const finish = (result) => {
        if (settled) return
        settled = true
        resolve(result)
      }
      let proc
      try {
        // 参数通过数组传递，shell 元字符不会被解释。
        proc = spawn(command, [...commandArgs, '-c', buildEdgeTtsScript(), cleanText, voice, audioPath], {
          stdio: 'ignore', shell: false, timeout: 15000,
        })
      } catch (error) {
        finish({ commandMissing: error?.code === 'ENOENT' })
        return
      }
      proc.on('error', (error) => finish({ commandMissing: error?.code === 'ENOENT' }))
      proc.on('exit', (code) => {
        if (code !== 0 || !fs.existsSync(audioPath)) return finish({ commandMissing: false })
        const stat = fs.statSync(audioPath)
        if (!stat || stat.size <= 0) return finish({ commandMissing: false })
        const duration = Math.max(1.0, stat.size / 16000)
        this.log.info('AssetGenerator', 'TTS ' + opts?.index + ' via edge-tts: ' + Math.round(duration * 10) / 10 + 's')
        finish({
          asset: {
            code: 0,
            data: {
              path: audioPath,
              audio_path: audioPath,
              duration,
              format: 'mp3',
              provider: 'edge-tts',
              source: 'edge-tts',
              degraded: false,
            },
          },
        })
      })
    })
  }

  /**
   * 生成静音音频（fallback）
   * @private
   */
  async _generateSilence (audioPath, idx, duration) {
    if (!this.ffmpeg) return { code: -1, message: 'ffmpeg not found' }

    const args = [
      '-y',
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t', String(duration),
      '-c:a', 'libmp3lame', '-b:a', '128k',
      audioPath,
    ]

    try {
      await execFileAsync(this.ffmpeg, args, { timeout: 10000, maxBuffer: 256 * 1024 })
      if (!fs.existsSync(audioPath)) {
        return { code: -1, message: 'ffmpeg did not produce audio' }
      }
      const stat = fs.statSync(audioPath)
      this.log.info('AssetGenerator', 'TTS ' + idx + ' fallback silence: ' + duration + 's')
      return {
        code: 0,
        data: {
          path: audioPath,
          audio_path: audioPath,
          duration,
          format: 'mp3',
          source: 'ffmpeg-silence',
          degraded: true,
        },
      }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  }
}

module.exports = {
  AssetGenerator,
  findFfmpeg,
  buildEdgeTtsScript,
  resolveImageSize,
  escapeDrawtextText,
  safeSessionId,
  extractProviderImageUrl,
  isPrivateAddress,
  getPythonCommands,
}
