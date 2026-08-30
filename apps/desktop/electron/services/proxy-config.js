// @ts-check
const net = require('node:net')

const PROXY_TYPES = new Set(['http', 'https', 'socks5'])
const HOSTNAME_RE = /^(?=.{1,253}$)(?:localhost|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)$/
const USERNAME_RE = /^[a-zA-Z0-9._-]{1,128}$/

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeHost(host) {
  if (typeof host !== 'string') throw new TypeError('代理地址必须是字符串')
  const normalized = host.trim()
  if (!normalized || normalized !== host || !HOSTNAME_RE.test(normalized)) {
    throw new Error('代理地址无效')
  }
  if (net.isIP(normalized) || HOSTNAME_RE.test(normalized)) return normalized
  throw new Error('代理地址无效')
}

function normalizePort(port) {
  const normalized = typeof port === 'string' && /^\d+$/.test(port) ? Number(port) : port
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 65535) {
    throw new Error('代理端口必须在 1 到 65535 之间')
  }
  return normalized
}

function normalizeOptionalCredential(value, field) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > 512 || /[\p{Cc}]/u.test(value)) {
    throw new Error(`代理${field}无效`)
  }
  return value
}

function normalizeProxyConfig(input) {
  if (input === null) return null
  if (!isPlainObject(input)) throw new TypeError('代理配置必须是对象或 null')

  const type = typeof input.type === 'string' ? input.type.toLowerCase() : 'http'
  if (!PROXY_TYPES.has(type)) throw new Error('代理类型仅支持 HTTP、HTTPS 或 SOCKS5')

  const username = normalizeOptionalCredential(input.username, '用户名')
  if (username !== undefined && !USERNAME_RE.test(username)) throw new Error('代理用户名无效')
  const password = normalizeOptionalCredential(input.password, '密码')
  if ((username === undefined) !== (password === undefined)) {
    throw new Error('代理认证必须同时提供用户名和密码')
  }

  const config = {
    host: normalizeHost(input.host),
    port: normalizePort(input.port),
    type,
  }
  if (username !== undefined) {
    config.username = username
    config.password = password
  }
  return config
}

function toElectronProxyRules(input) {
  const config = normalizeProxyConfig(input)
  if (!config) return ''
  const scheme = config.type === 'http' ? 'http' : config.type
  return `${scheme}://${config.host}:${config.port}`
}

function maskHost(host) {
  const parts = host.split('.')
  if (parts.length === 4 && parts.every(part => /^\d+$/.test(part))) {
    return `${parts[0]}.${parts[1]}.*.*`
  }
  if (parts.length <= 1) return `${host.slice(0, 2)}***`
  return `${parts[0].slice(0, 2)}***.${parts.slice(1).join('.')}`
}

function toPublicProxyConfig(input) {
  const config = normalizeProxyConfig(input)
  if (!config) return { configured: false }
  return {
    configured: true,
    type: config.type,
    hostMasked: maskHost(config.host),
    port: config.port,
    hasAuthentication: Boolean(config.username),
  }
}

module.exports = {
  PROXY_TYPES,
  normalizeProxyConfig,
  toElectronProxyRules,
  toPublicProxyConfig,
}
