// @ts-check
/**
 * platform-rules — 平台标签规则集中管理
 *
 * 集中维护各平台的标签样式（前缀/上限/模式）与规范化逻辑，
 * 替代原 content-intelligence-analysis.js 内联的 platformTagStyle。
 */
const DEFAULT_STYLE = { prefix: '', max: 5, mode: 'plain' }

const PLATFORM_KEYS = [
  'zhihu', 'weibo', 'xiaohongshu', 'bilibili', 'toutiao',
  'douyin', 'wechat_mp',
]

const DEFAULT_PLATFORMS = ['zhihu', 'weibo', 'xiaohongshu', 'bilibili', 'toutiao']

// hash 模式平台：标签需带 # 前缀
const HASH_PLATFORMS = new Set(['weibo', 'xiaohongshu', 'douyin'])

const PLATFORM_STYLES = {
  zhihu: { prefix: '', max: 10, mode: 'plain' },
  weibo: { prefix: '#', max: 10, mode: 'hash' },
  xiaohongshu: { prefix: '#', max: 10, mode: 'hash' },
  bilibili: { prefix: '', max: 10, mode: 'plain' },
  toutiao: { prefix: '', max: 10, mode: 'plain' },
  douyin: { prefix: '#', max: 10, mode: 'hash' },
  wechat_mp: { prefix: '', max: 10, mode: 'plain' },
}

/**
 * 获取平台标签样式，未知平台回退默认。
 * @param {string} platform
 * @returns {{prefix: string, max: number, mode: string}}
 */
function getTagStyle (platform) {
  return PLATFORM_STYLES[platform] || DEFAULT_STYLE
}

/**
 * 去除标签首尾空白与 # 前缀。
 * @param {string} tag
 * @returns {string}
 */
function stripHash (tag) {
  return String(tag || '').replace(/^#+|#+$/g, '').trim()
}

/**
 * 规范化标签：hash 平台自动补 #（若缺），其他平台去除 #；去空白。
 * @param {string} tag
 * @param {string} [platform]
 * @returns {string}
 */
function normalizeTag (tag, platform) {
  const raw = String(tag || '').trim()
  if (!raw) return ''
  const stripped = stripHash(raw)
  if (!stripped) return ''
  if (platform && HASH_PLATFORMS.has(platform)) {
    return '#' + stripped
  }
  return stripped
}

/**
 * 按平台样式给标签加前缀。
 * @param {string} tag
 * @param {string} platform
 * @returns {string}
 */
function applyPrefix (tag, platform) {
  const style = getTagStyle(platform)
  const stripped = stripHash(tag)
  if (!stripped) return ''
  return style.prefix + stripped
}

module.exports = {
  DEFAULT_PLATFORMS,
  PLATFORM_KEYS,
  HASH_PLATFORMS,
  PLATFORM_STYLES,
  getTagStyle,
  stripHash,
  normalizeTag,
  applyPrefix,
}

