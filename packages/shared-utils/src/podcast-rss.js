'use strict'
/**
 * podcast-rss.js — Podcast RSS（iTunes RSS 2.0）生成 / 校验 / 自检单一真源
 *
 * 归属 shared-utils 的原因：api-publish-engine 是零依赖可发布包（见
 * src/cloud-accounts/validate-account.js 的同款约束注释），不能 require 本包；
 * 而渲染端需要复用同一份校验与目录，故引擎落共享层（先例 publish-capabilities）。
 *
 * 语义前提（openspec/changes/podcast-rss-channel）：播客端的"发布"不是逐期上传，
 * 而是"向 feed 追加 <item>"。本模块只做纯函数，不落盘、不上传、不发网络请求；
 * 托管直传与写文件由消费方注入。
 */

const { safeHttpUrl } = require('./safe-http-url')

const TITLE_MAX = 255
const SUMMARY_MAX = 4000
const SUBTITLE_MAX = 120
const DURATION_MAX_SEC = 24 * 60 * 60
const ITEMS_MAX = 1000
const COVER_MIN_PX = 1400
const COVER_MAX_PX = 3000
const EXPLICIT_VALUES = ['yes', 'no', 'clean']
const EPISODE_TYPE_VALUES = ['full', 'trailer', 'bonus']
const EPISODE_FEED_TYPE_VALUES = ['episodic', 'serial']
const AUDIO_MIME_VALUES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav']
const LANGUAGE_RE = /^[a-z]{2}(-[A-Z]{2})?$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ITUNES_CATEGORIES = {
  'The Arts': ['Design', 'Fashion & Beauty', 'Food', 'Performing Arts', 'Visual Arts', 'Popular Culture', 'Relationships', 'Behind the Scenes', 'Crafts', 'Home & Garden'],
  'Business': ['Careers', 'Entrepreneurship', 'Management', 'Marketing', 'Non-Profit'],
  'Comedy': ['Comedy Interviews', 'Improv', 'Stand-Up', 'Sketch Comedy'],
  'Education': ['Alternative Education', 'Courses', 'Education for Kids', 'Higher Education', 'Primary & Secondary Schooling', 'Special Education', 'Tutorials', 'Self-Development', 'Language Learning'],
  'Fiction': ['Audio Drama', 'Science Fiction', 'Storytelling'],
  'Government': ['Countries', 'Local', 'National', 'State'],
  'Health & Fitness': ['Alternative Health', 'Audiology', 'Dental', 'Fitness', 'Health', 'Medication', 'Nutrition', 'Psychology', 'Public Health', 'Sexuality', 'Sleep', 'Sports Medicine', 'Surgery'],
  'History': ['Ancient', 'Africa', 'Americas', 'Asia', 'Europe', 'Middle East', 'Oceania', 'Present'],
  'Kids & Family': ['Education', 'Free Fun', 'Parenting', 'Pets & Animals'],
  'Leisure': ['Games & Hobbies', 'Automotive', 'Aviation', 'Hobbies', 'Video Games'],
  'Music': ['Music History & Commentary', 'Music Interviews', 'Music Listings'],
  'News Politics': ['Daily News', 'Politics', 'World News'],
  'Religion & Spirituality': ['Christianity', 'Hinduism', 'Islam', 'Judaism', 'Paganism', 'Spirituality'],
  'Science': ['Life Sciences', 'Natural Sciences', 'Physics', 'Social Sciences', 'Technology'],
  'Society Culture': ['Culture', 'Documentary', 'Ethnic & Identity', 'Flags & Countries', 'Genealogy', 'Interviews', 'Personal Journals', 'Philosophy', 'Places & Travel', 'Relationships'],
  'Sports': ['Amateur', 'Basketball', 'College', 'Cricket', 'Football', 'Golf', 'Motor Sports', 'Olympics', 'Outdoor', 'Professional', 'Rugby', 'Soccer', 'Fantasy'],
  'Technology': ['Gadgets', 'Podcasting', 'Software How-To'],
  'True Crime': ['Crime Fiction', 'Justice']
}

function issue (code, field, message) {
  return { code, field, message }
}

function isHttpsUrl (value) {
  const url = safeHttpUrl(value)
  if (!url) return null
  let parsed
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:') return null
  return url
}

function matchCoverSize (coverSize) {
  const m = /^(\d+)\s*[xX]\s*(\d+)$/.exec(String(coverSize || '').trim())
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null
}

function validateCategory (categoryId) {
  const text = String(categoryId || '').trim()
  if (!text) return issue('CHANNEL_CATEGORY_REQUIRED', 'categoryId', '播客分类不能为空')
  const parts = text.split('/').map((s) => s.trim())
  const top = parts[0]
  const subs = ITUNES_CATEGORIES[top]
  if (!subs) return issue('CHANNEL_CATEGORY_UNKNOWN', 'categoryId', `未知顶级分类「${top}」`)
  if (parts.length > 1 && parts[1] !== '') {
    if (!subs.includes(parts[1])) return issue('CHANNEL_SUBCATEGORY_UNKNOWN', 'categoryId', `「${top}」下不存在子分类「${parts[1]}」`)
    if (parts.length > 2) return issue('CHANNEL_CATEGORY_TOO_DEEP', 'categoryId', '分类最多两级')
  }
  return null
}

function validateChannel (raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, issues: [issue('CHANNEL_MISSING', 'channel', '频道配置缺失')] }
  }
  const issues = []
  const title = String(raw.title || '').trim()
  if (!title) issues.push(issue('CHANNEL_TITLE_REQUIRED', 'title', '频道标题不能为空'))
  else if (title.length > TITLE_MAX) issues.push(issue('CHANNEL_TITLE_TOO_LONG', 'title', `频道标题不得超过 ${TITLE_MAX} 字符`))

  const description = String(raw.description || '').trim()
  if (!description) issues.push(issue('CHANNEL_DESC_REQUIRED', 'description', '频道简介不能为空'))
  else if (description.length > SUMMARY_MAX) issues.push(issue('CHANNEL_DESC_TOO_LONG', 'description', `频道简介不得超过 ${SUMMARY_MAX} 字符`))

  const subtitle = String(raw.subtitle || '').trim()
  if (subtitle.length > SUBTITLE_MAX) issues.push(issue('CHANNEL_SUBTITLE_TOO_LONG', 'subtitle', `副标题不得超过 ${SUBTITLE_MAX} 字符`))

  const language = raw.language == null ? 'zh-CN' : String(raw.language)
  if (!LANGUAGE_RE.test(language)) issues.push(issue('CHANNEL_LANGUAGE_INVALID', 'language', '语言需形如 zh-CN / en-US'))

  if (!raw.coverUrl) issues.push(issue('CHANNEL_COVER_REQUIRED', 'coverUrl', '封面地址不能为空'))
  else if (!isHttpsUrl(raw.coverUrl)) issues.push(issue('CHANNEL_COVER_NOT_HTTPS', 'coverUrl', '封面必须是 https 绝对地址'))
  else {
    const box = matchCoverSize(raw.coverSize)
    if (!box) issues.push(issue('CHANNEL_COVER_SIZE_UNKNOWN', 'coverSize', '封面尺寸需形如 3000x3000 以便校验'))
    else if (box.w !== box.h) issues.push(issue('CHANNEL_COVER_NOT_SQUARE', 'coverSize', '封面必须为正方形'))
    else if (box.w < COVER_MIN_PX || box.w > COVER_MAX_PX) issues.push(issue('CHANNEL_COVER_SIZE_OUT_OF_RANGE', 'coverSize', `封面边长须在 ${COVER_MIN_PX}~${COVER_MAX_PX} 之间`))
  }

  const hasLink = raw.link != null && String(raw.link).trim() !== ''
  if (hasLink && !isHttpsUrl(raw.link)) issues.push(issue('CHANNEL_LINK_NOT_HTTPS', 'link', '站点地址必须是 https 绝对地址'))

  if (!String(raw.author || '').trim()) issues.push(issue('CHANNEL_AUTHOR_REQUIRED', 'author', '作者/主播名不能为空'))
  if (!EMAIL_RE.test(String(raw.ownerEmail || '').trim())) issues.push(issue('CHANNEL_OWNER_EMAIL_INVALID', 'ownerEmail', '所有者邮箱格式非法'))
  if (raw.explicit != null && !EXPLICIT_VALUES.includes(String(raw.explicit))) issues.push(issue('CHANNEL_EXPLICIT_INVALID', 'explicit', `分级取值须为 ${EXPLICIT_VALUES.join('/')}`))
  const feedType = raw.feedType == null ? 'episodic' : String(raw.feedType)
  if (!EPISODE_FEED_TYPE_VALUES.includes(feedType)) issues.push(issue('CHANNEL_FEED_TYPE_INVALID', 'feedType', `feed 类型取值须为 ${EPISODE_FEED_TYPE_VALUES.join('/')}`))
  const categoryIssue = validateCategory(raw.categoryId)
  if (categoryIssue) issues.push(categoryIssue)
  return { ok: issues.length === 0, issues }
}

function resolveEnclosure (raw) {
  if (raw.audioUrl) {
    const url = isHttpsUrl(raw.audioUrl)
    return { url, code: url ? null : 'EPISODE_AUDIO_NOT_HTTPS' }
  }
  if (raw.resolvedAudioUrl) {
    const url = isHttpsUrl(raw.resolvedAudioUrl)
    return { url, code: url ? null : 'EPISODE_AUDIO_NOT_HTTPS' }
  }
  return { url: null, code: raw.localFilePath ? 'EPISODE_HOSTING_NOT_CONFIGURED' : 'EPISODE_AUDIO_REQUIRED' }
}

function validateEpisode (raw, idx = 0) {
  const at = (name) => `episodes[${idx}].${name}`
  if (!raw || typeof raw !== 'object') {
    return { ok: false, issues: [issue('EPISODE_MISSING', at(''), '单集数据缺失')], enclosure: null }
  }
  const issues = []
  const title = String(raw.title || '').trim()
  if (!title) issues.push(issue('EPISODE_TITLE_REQUIRED', at('title'), '单集标题不能为空'))
  else if (title.length > TITLE_MAX) issues.push(issue('EPISODE_TITLE_TOO_LONG', at('title'), `单集标题不得超过 ${TITLE_MAX} 字符`))

  const description = String(raw.description || '').trim()
  if (description.length > SUMMARY_MAX) issues.push(issue('EPISODE_DESC_TOO_LONG', at('description'), `节目简介不得超过 ${SUMMARY_MAX} 字符`))
  const subtitle = String(raw.subtitle || '').trim()
  if (subtitle.length > SUBTITLE_MAX) issues.push(issue('EPISODE_SUBTITLE_TOO_LONG', at('subtitle'), `副标题不得超过 ${SUBTITLE_MAX} 字符`))

  const enc = resolveEnclosure(raw)
  if (!enc.url) issues.push(issue(enc.code, at('audioUrl'), '音频必须是 https 绝对地址；仅有本地文件时须先配置托管直传'))
  if (!Number.isInteger(raw.durationSec) || raw.durationSec < 1 || raw.durationSec > DURATION_MAX_SEC) {
    issues.push(issue('EPISODE_DURATION_INVALID', at('durationSec'), `时长须为 1~${DURATION_MAX_SEC} 的整数秒`))
  }
  if (raw.sizeBytes != null && (!Number.isInteger(raw.sizeBytes) || raw.sizeBytes < 1)) {
    issues.push(issue('EPISODE_SIZE_INVALID', at('sizeBytes'), '字节数须为正整数'))
  }
  if (raw.sizeBytes == null) issues.push(issue('EPISODE_SIZE_REQUIRED', at('sizeBytes'), 'enclosure 必须声明 length（字节数）'))
  if (raw.explicit != null && !EXPLICIT_VALUES.includes(String(raw.explicit))) issues.push(issue('EPISODE_EXPLICIT_INVALID', at('explicit'), `分级取值须为 ${EXPLICIT_VALUES.join('/')}`))
  if (raw.episodeType != null && !EPISODE_TYPE_VALUES.includes(String(raw.episodeType))) issues.push(issue('EPISODE_TYPE_INVALID', at('episodeType'), `类型取值须为 ${EPISODE_TYPE_VALUES.join('/')}`))
  if (raw.pubDate != null && Number.isNaN(new Date(raw.pubDate).getTime())) issues.push(issue('EPISODE_PUBDATE_INVALID', at('pubDate'), '发布时间无法解析'))
  if (raw.coverUrl != null && !isHttpsUrl(raw.coverUrl)) issues.push(issue('EPISODE_COVER_NOT_HTTPS', at('coverUrl'), '单集封面必须是 https 绝对地址'))
  if (raw.mime != null && !AUDIO_MIME_VALUES.includes(String(raw.mime))) issues.push(issue('EPISODE_MIME_INVALID', at('mime'), `音频 MIME 须为 ${AUDIO_MIME_VALUES.join('/')}`))
  if (String(raw.guid || '').trim().length > 500) issues.push(issue('EPISODE_GUID_TOO_LONG', at('guid'), 'guid 不得超过 500 字符'))
  if (raw.number != null && (!Number.isInteger(raw.number) || raw.number < 1)) issues.push(issue('EPISODE_NUMBER_INVALID', at('number'), '期号须为正整数'))
  if (raw.season != null && (!Number.isInteger(raw.season) || raw.season < 1)) issues.push(issue('EPISODE_SEASON_INVALID', at('season'), '季号须为正整数'))
  return { ok: issues.length === 0, issues, enclosure: enc.url }
}

function validateEpisodeList (episodes) {
  if (!Array.isArray(episodes) || episodes.length === 0) {
    return { ok: false, issues: [issue('EPISODES_EMPTY', 'episodes', 'feed 至少需要一个单集')], items: [] }
  }
  const issues = []
  if (episodes.length > ITEMS_MAX) issues.push(issue('EPISODES_TOO_MANY', 'episodes', `单集数不得超过 ${ITEMS_MAX}`))
  const seen = new Set()
  episodes.forEach((ep, i) => {
    const r = validateEpisode(ep, i)
    issues.push(...r.issues)
    const key = String((ep && (ep.guid || ep.audioUrl || ep.resolvedAudioUrl)) || '').trim()
    if (key) {
      if (seen.has(key)) issues.push(issue('EPISODE_DUPLICATE', `episodes[${i}]`, '存在重复的 guid/音频地址'))
      seen.add(key)
    }
  })
  return { ok: issues.length === 0, issues, items: episodes }
}

function validateFeed (channel, episodes) {
  const c = validateChannel(channel)
  const e = validateEpisodeList(episodes)
  return { ok: c.ok && e.ok, issues: [...c.issues, ...e.issues] }
}

function escapeText (value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr (value) {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function formatDuration (totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

function toRfc2822 (value) {
  const d = value instanceof Date ? value : new Date(value == null ? Date.now() : value)
  if (Number.isNaN(d.getTime())) throw new Error('EPISODE_PUBDATE_INVALID')
  return d.toUTCString()
}

function audioMimeFromUrl (url) {
  let path = ''
  try { path = new URL(url).pathname.toLowerCase() } catch { return 'audio/mpeg' }
  if (path.endsWith('.m4a')) return 'audio/x-m4a'
  if (path.endsWith('.aac')) return 'audio/aac'
  if (path.endsWith('.ogg')) return 'audio/ogg'
  if (path.endsWith('.wav')) return 'audio/wav'
  if (path.endsWith('.mp4')) return 'audio/mp4'
  return 'audio/mpeg'
}

function sortedEpisodes (episodes) {
  return [...episodes].sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
}

function buildItem (ep) {
  const url = ep.resolvedAudioUrl || ep.audioUrl
  const mime = ep.mime || audioMimeFromUrl(url)
  const guid = String(ep.guid || url).trim()
  const lines = ['    <item>']
  lines.push(`      <title>${escapeText(ep.title)}</title>`)
  lines.push(`      <description>${escapeText(ep.description || '')}</description>`)
  if (ep.subtitle) lines.push(`      <itunes:subtitle>${escapeText(ep.subtitle)}</itunes:subtitle>`)
  if (ep.htmlContent) lines.push(`      <content:encoded>${escapeText(ep.htmlContent)}</content:encoded>`)
  lines.push(`      <enclosure url="${escapeAttr(url)}" length="${Number(ep.sizeBytes)}" type="${escapeAttr(mime)}"/>`)
  lines.push(`      <guid isPermaLink="false">${escapeText(guid)}</guid>`)
  lines.push(`      <pubDate>${toRfc2822(ep.pubDate)}</pubDate>`)
  lines.push(`      <itunes:duration>${formatDuration(ep.durationSec)}</itunes:duration>`)
  if (ep.coverUrl) lines.push(`      <itunes:image href="${escapeAttr(ep.coverUrl)}"/>`)
  if (ep.explicit != null) lines.push(`      <itunes:explicit>${escapeText(ep.explicit)}</itunes:explicit>`)
  if (ep.episodeType) lines.push(`      <itunes:episodeType>${escapeText(ep.episodeType)}</itunes:episodeType>`)
  if (ep.season != null) lines.push(`      <itunes:season>${Number(ep.season)}</itunes:season>`)
  if (ep.number != null) lines.push(`      <itunes:episode>${Number(ep.number)}</itunes:episode>`)
  lines.push('    </item>')
  return lines.join('\n')
}

function buildCategoryTag (categoryId) {
  const parts = String(categoryId || '').trim().split('/').map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return `      <itunes:category text="${escapeAttr(parts[0])}"><itunes:category text="${escapeAttr(parts[1])}"/></itunes:category>`
  }
  return `      <itunes:category text="${escapeAttr(parts[0] || '')}"/>`
}

/**
 * 生成 Podcast RSS。校验不过即抛错（fail closed），禁止产出"看似成功但平台不收录"的 feed。
 */
function buildFeed (channel, episodes, options = {}) {
  const check = validateFeed(channel, episodes)
  if (!check.ok) {
    const err = new Error(`PODCAST_FEED_INVALID: ${check.issues.map((i) => i.code).join(',')}`)
    err.code = 'PODCAST_FEED_INVALID'
    err.issues = check.issues
    throw err
  }
  const now = options.now == null ? new Date() : options.now
  const lang = channel.language == null ? 'zh-CN' : String(channel.language)
  const explicit = channel.explicit == null ? 'no' : String(channel.explicit)
  const feedType = channel.feedType == null ? 'episodic' : String(channel.feedType)
  const link = isHttpsUrl(channel.link) || isHttpsUrl(channel.siteUrl) || 'https://example.com/'
  const ordered = sortedEpisodes(episodes)
  const lines = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">')
  lines.push('  <channel>')
  lines.push(`    <title>${escapeText(channel.title)}</title>`)
  lines.push(`    <link>${escapeAttr(link)}</link>`)
  lines.push(`    <description>${escapeText(channel.description)}</description>`)
  if (channel.subtitle) lines.push(`    <itunes:subtitle>${escapeText(channel.subtitle)}</itunes:subtitle>`)
  lines.push(`    <language>${escapeText(lang)}</language>`)
  lines.push(`    <itunes:author>${escapeText(channel.author)}</itunes:author>`)
  lines.push(`    <itunes:explicit>${escapeText(explicit)}</itunes:explicit>`)
  lines.push(`    <itunes:type>${escapeText(feedType)}</itunes:type>`)
  lines.push('    <itunes:owner>')
  lines.push(`      <itunes:name>${escapeText(channel.ownerName || channel.author)}</itunes:name>`)
  lines.push(`      <itunes:email>${escapeText(channel.ownerEmail)}</itunes:email>`)
  lines.push('    </itunes:owner>')
  lines.push(`    <itunes:image href="${escapeAttr(channel.coverUrl)}"/>`)
  lines.push(buildCategoryTag(channel.categoryId))
  lines.push('    <image>')
  lines.push(`      <url>${escapeAttr(channel.coverUrl)}</url>`)
  lines.push(`      <title>${escapeText(channel.title)}</title>`)
  lines.push(`      <link>${escapeAttr(link)}</link>`)
  lines.push('    </image>')
  lines.push(`    <pubDate>${toRfc2822(ordered[0].pubDate)}</pubDate>`)
  lines.push(`    <lastBuildDate>${toRfc2822(now)}</lastBuildDate>`)
  ordered.forEach((ep) => lines.push(buildItem(ep)))
  lines.push('  </channel>')
  lines.push('</rss>')
  return lines.join('\n') + '\n'
}

const ITEM_RE = /<item>([\s\S]*?)<\/item>/g

function attrOf (tag, name) {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag)
  return m ? m[1] : null
}

function tagOf (block, name) {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(block)
  return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : null
}

function parseDuration (text) {
  if (text == null) return null
  const parts = String(text).trim().split(':').map((p) => Number(p))
  if (parts.some((p) => !Number.isFinite(p))) return null
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

/** 自检/导入用的轻量解析：只覆盖 Podcast RSS 的已知字段，不是通用 RSS 解析器。 */
function parseFeed (xml) {
  const source = String(xml || '')
  const items = []
  let m
  ITEM_RE.lastIndex = 0
  while ((m = ITEM_RE.exec(source)) !== null) {
    const block = m[1]
    const enc = /<enclosure[^>]*>/.exec(block)
    items.push({
      title: tagOf(block, 'title'),
      description: tagOf(block, 'description'),
      guid: tagOf(block, 'guid'),
      pubDate: tagOf(block, 'pubDate'),
      durationSec: parseDuration(tagOf(block, 'itunes:duration')),
      audioUrl: enc ? attrOf(enc[0], 'url') : null,
      sizeBytes: enc ? (attrOf(enc[0], 'length') == null ? null : Number(attrOf(enc[0], 'length'))) : null,
      mime: enc ? attrOf(enc[0], 'type') : null
    })
  }
  return {
    title: tagOf(source, 'channel') ? tagOf(source, 'title') : null,
    coverUrl: (() => { const t = /<itunes:image[^>]*>/.exec(source); return t ? attrOf(t[0], 'href') : null })(),
    itemCount: items.length,
    items
  }
}

/**
 * feed 自检：逐项校验 enclosure 可达性/类型/长度一致性，并复核结构字段。
 * headImpl 由消费方注入（禁止在本包发真实网络请求）。
 */
async function verifyFeed (xml, { headImpl, now } = {}) {
  const issues = []
  const parsed = parseFeed(xml)
  if (parsed.itemCount === 0) issues.push(issue('FEED_NO_ITEMS', 'feed', 'feed 中没有任何单集'))
  if (!String(xml).includes('xmlns:itunes=')) issues.push(issue('FEED_MISSING_ITUNES_NS', 'feed', '缺少 itunes 命名空间'))
  if (!/^\uFEFF?<\?xml/.test(String(xml).slice(0, 64))) issues.push(issue('FEED_MISSING_XML_DECL', 'feed', '缺少 XML 声明'))
  const checks = []
  if (typeof headImpl === 'function') {
    for (const item of parsed.items) {
      const one = { url: item.audioUrl, ok: false, reason: null }
      if (!item.audioUrl) {
        one.reason = 'ENCLOSURE_MISSING'
        issues.push(issue('ENCLOSURE_MISSING', 'feed', '存在没有 enclosure 的单集'))
      } else if (!isHttpsUrl(item.audioUrl)) {
        one.reason = 'ENCLOSURE_NOT_HTTPS'
        issues.push(issue('ENCLOSURE_NOT_HTTPS', 'feed', '存在非 https 的 enclosure'))
      } else {
        let res
        try {
          res = await headImpl(item.audioUrl)
        } catch {
          res = { status: null }
        }
        one.status = res == null ? null : res.status
        if (!res || !Number.isInteger(res.status) || res.status >= 400) {
          one.reason = 'ENCLOSURE_UNREACHABLE'
          issues.push(issue('ENCLOSURE_UNREACHABLE', 'feed', `有 ${1} 个 enclosure 不可达（状态 ${res && res.status}）`))
        } else {
          const type = res.contentType == null ? null : String(res.contentType).toLowerCase()
          if (type && !type.startsWith('audio/') && type !== 'application/octet-stream') {
            one.reason = 'ENCLOSURE_TYPE_MISMATCH'
            issues.push(issue('ENCLOSURE_TYPE_MISMATCH', 'feed', 'enclosure 指向的资源不是音频'))
          } else if (item.sizeBytes != null && res.contentLength != null && Number(res.contentLength) !== Number(item.sizeBytes)) {
            one.reason = 'ENCLOSURE_LENGTH_MISMATCH'
            issues.push(issue('ENCLOSURE_LENGTH_MISMATCH', 'feed', '声明的 length 与实际字节数不一致'))
          } else if (item.durationSec == null) {
            one.reason = 'DURATION_MISSING'
            issues.push(issue('DURATION_MISSING', 'feed', '单集缺少时长'))
          } else one.ok = true
        }
      }
      checks.push(one)
    }
  }
  return { ok: issues.length === 0, issues, checks, itemCount: parsed.itemCount, parsed }
}

module.exports = {
  TITLE_MAX,
  SUMMARY_MAX,
  SUBTITLE_MAX,
  DURATION_MAX_SEC,
  ITEMS_MAX,
  COVER_MIN_PX,
  COVER_MAX_PX,
  EXPLICIT_VALUES,
  EPISODE_TYPE_VALUES,
  EPISODE_FEED_TYPE_VALUES,
  AUDIO_MIME_VALUES,
  ITUNES_CATEGORIES,
  issue,
  isHttpsUrl,
  matchCoverSize,
  validateCategory,
  validateChannel,
  validateEpisode,
  validateEpisodeList,
  validateFeed,
  resolveEnclosure,
  escapeText,
  escapeAttr,
  formatDuration,
  toRfc2822,
  audioMimeFromUrl,
  sortedEpisodes,
  buildFeed,
  parseFeed,
  verifyFeed
}
