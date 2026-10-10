import { describe, it, expect } from 'vitest'
import {
  validateChannel,
  validateEpisode,
  validateFeed,
  buildFeed,
  parseFeed,
  verifyFeed,
  isHttpsUrl,
  formatDuration,
  matchCoverSize,
  audioMimeFromUrl,
  ITUNES_CATEGORIES,
  EXPLICIT_VALUES,
  EPISODE_TYPE_VALUES,
  EPISODE_FEED_TYPE_VALUES,
  COVER_MIN_PX,
  SUMMARY_MAX
} from '../podcast-rss.js'
import * as rssEsm from '../podcast-rss.browser.js'

const NOW = new Date(Date.UTC(2026, 9, 9, 8, 0, 0))

const CHANNEL = {
  title: '测试频道',
  description: '这是一档用于回归的播客频道。',
  author: '测试主播',
  ownerEmail: 'host@example.com',
  coverUrl: 'https://cdn.example.com/cover.png',
  coverSize: '3000x3000',
  categoryId: 'Technology/Podcasting',
  language: 'zh-CN',
  explicit: 'no',
  feedType: 'episodic',
  link: 'https://example.com'
}

const EPISODE = {
  title: '第 1 期 &amp; 实体',
  description: '节目简介',
  audioUrl: 'https://cdn.example.com/e1.mp3',
  durationSec: 3723,
  sizeBytes: 12345678,
  explicit: 'no',
  pubDate: new Date(Date.UTC(2026, 9, 9, 6, 0, 0))
}

function codes (result) {
  return result.issues.map((i) => i.code)
}

describe('podcast-rss · 频道字段校验', () => {
  it('合法频道无告警', () => {
    expect(validateChannel(CHANNEL)).toEqual({ ok: true, issues: [] })
  })

  it('必填项缺失逐项报错（精确码数组）', () => {
    const r = validateChannel({})
    expect(r.ok).toBe(false)
    expect(codes(r)).toEqual([
      'CHANNEL_TITLE_REQUIRED',
      'CHANNEL_DESC_REQUIRED',
      'CHANNEL_COVER_REQUIRED',
      'CHANNEL_AUTHOR_REQUIRED',
      'CHANNEL_OWNER_EMAIL_INVALID',
      'CHANNEL_CATEGORY_REQUIRED'
    ])
  })

  it('封面非 https 与尺寸越界分别报错', () => {
    expect(codes(validateChannel({ ...CHANNEL, coverUrl: 'http://cdn.example.com/a.png' }))).toContain('CHANNEL_COVER_NOT_HTTPS')
    expect(codes(validateChannel({ ...CHANNEL, coverUrl: 'javascript:alert(1)' }))).toContain('CHANNEL_COVER_NOT_HTTPS')
    expect(codes(validateChannel({ ...CHANNEL, coverSize: '800x800' }))).toContain('CHANNEL_COVER_SIZE_OUT_OF_RANGE')
    expect(codes(validateChannel({ ...CHANNEL, coverSize: '3000x2000' }))).toContain('CHANNEL_COVER_NOT_SQUARE')
    expect(codes(validateChannel({ ...CHANNEL, coverSize: '' }))).toContain('CHANNEL_COVER_SIZE_UNKNOWN')
    expect(COVER_MIN_PX).toBe(1400)
  })

  it('简介超过 4000 字符报错', () => {
    expect(codes(validateChannel({ ...CHANNEL, description: 'x'.repeat(SUMMARY_MAX + 1) }))).toContain('CHANNEL_DESC_TOO_LONG')
  })

  it('分类白名单：未知顶级/未知子级/超两级', () => {
    expect(codes(validateChannel({ ...CHANNEL, categoryId: '不存在/子' }))).toContain('CHANNEL_CATEGORY_UNKNOWN')
    expect(codes(validateChannel({ ...CHANNEL, categoryId: 'Technology/不存在子分类' }))).toContain('CHANNEL_SUBCATEGORY_UNKNOWN')
    expect(codes(validateChannel({ ...CHANNEL, categoryId: 'Technology/Podcasting/三级' }))).toContain('CHANNEL_CATEGORY_TOO_DEEP')
    expect(validateChannel({ ...CHANNEL, categoryId: 'Technology' }).ok).toBe(true)
    expect(Object.keys(ITUNES_CATEGORIES).length).toBeGreaterThan(10)
  })

  it('枚举字段拒绝未知取值', () => {
    expect(codes(validateChannel({ ...CHANNEL, explicit: 'maybe' }))).toContain('CHANNEL_EXPLICIT_INVALID')
    expect(codes(validateChannel({ ...CHANNEL, feedType: 'weekly' }))).toContain('CHANNEL_FEED_TYPE_INVALID')
    expect(codes(validateChannel({ ...CHANNEL, language: 'ZH-CN' }))).toContain('CHANNEL_LANGUAGE_INVALID')
    expect(codes(validateChannel({ ...CHANNEL, link: '//example.com' }))).toContain('CHANNEL_LINK_NOT_HTTPS')
  })
})

describe('podcast-rss · 单集字段校验', () => {
  it('合法单集通过', () => {
    expect(validateEpisode(EPISODE).ok).toBe(true)
  })

  it('空单集精确报错数组', () => {
    expect(codes(validateEpisode({}))).toEqual([
      'EPISODE_TITLE_REQUIRED',
      'EPISODE_AUDIO_REQUIRED',
      'EPISODE_DURATION_INVALID',
      'EPISODE_SIZE_REQUIRED'
    ])
  })

  it('仅有本地文件时报托管未配置', () => {
    expect(codes(validateEpisode({ ...EPISODE, audioUrl: undefined, localFilePath: 'D:/a.mp3' }))).toContain('EPISODE_HOSTING_NOT_CONFIGURED')
  })

  it('非 https 音频地址一律拒绝', () => {
    expect(codes(validateEpisode({ ...EPISODE, audioUrl: 'http://cdn.example.com/e1.mp3' }))).toContain('EPISODE_AUDIO_NOT_HTTPS')
  })

  it('时长/字节/期号/枚举边界', () => {
    expect(codes(validateEpisode({ ...EPISODE, durationSec: 0 }))).toContain('EPISODE_DURATION_INVALID')
    expect(codes(validateEpisode({ ...EPISODE, sizeBytes: -1 }))).toContain('EPISODE_SIZE_INVALID')
    expect(codes(validateEpisode({ ...EPISODE, number: 0 }))).toContain('EPISODE_NUMBER_INVALID')
    expect(codes(validateEpisode({ ...EPISODE, episodeType: 'extra' }))).toContain('EPISODE_TYPE_INVALID')
    expect(codes(validateEpisode({ ...EPISODE, mime: 'video/mp4' }))).toContain('EPISODE_MIME_INVALID')
    expect(codes(validateEpisode({ ...EPISODE, pubDate: 'not-a-date' }))).toContain('EPISODE_PUBDATE_INVALID')
  })

  it('重复 guid 与空列表', () => {
    expect(validateFeed(CHANNEL, []).issues.map((i) => i.code)).toContain('EPISODES_EMPTY')
    expect(validateFeed(CHANNEL, [EPISODE, { ...EPISODE }]).issues.map((i) => i.code)).toContain('EPISODE_DUPLICATE')
  })
})

describe('podcast-rss · feed 构建', () => {
  it('校验不过时 fail closed，并携带 issues', () => {
    let err = null
    try {
      buildFeed(CHANNEL, [{ ...EPISODE, durationSec: null }], { now: NOW })
    } catch (e) { err = e }
    expect(err).not.toBeNull()
    expect(err.code).toBe('PODCAST_FEED_INVALID')
    expect(err.issues.map((i) => i.code)).toEqual(['EPISODE_DURATION_INVALID'])
  })

  it('头部结构与 itunes 命名空间逐行精确', () => {
    const xml = buildFeed(CHANNEL, [EPISODE], { now: NOW })
    expect(xml.split('\n').slice(0, 2)).toEqual([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" version="2.0">'
    ])
    expect(xml.split('\n').slice(3, 6)).toEqual([
      '    <title>测试频道</title>',
      '    <link>https://example.com</link>',
      '    <description>这是一档用于回归的播客频道。</description>'
    ])
    expect(xml).toContain('      <itunes:email>host@example.com</itunes:email>')
    expect(xml).toContain('      <itunes:category text="Technology"><itunes:category text="Podcasting"/></itunes:category>')
    expect(xml).toContain('    <lastBuildDate>Fri, 09 Oct 2026 08:00:00 GMT</lastBuildDate>')
    expect(xml.endsWith('</rss>\n')).toBe(true)
  })

  it('单集块逐行精确（时长格式化 + enclosure 三属性）', () => {
    const xml = buildFeed(CHANNEL, [EPISODE], { now: NOW })
    const lines = xml.split('\n')
    const start = lines.indexOf('    <item>')
    expect(lines.slice(start + 1, start + 8)).toEqual([
      '      <title>第 1 期 &amp;amp; 实体</title>',
      '      <description>节目简介</description>',
      '      <enclosure url="https://cdn.example.com/e1.mp3" length="12345678" type="audio/mpeg"/>',
      '      <guid isPermaLink="false">https://cdn.example.com/e1.mp3</guid>',
      '      <pubDate>Fri, 09 Oct 2026 06:00:00 GMT</pubDate>',
      '      <itunes:duration>01:02:03</itunes:duration>',
      '      <itunes:explicit>no</itunes:explicit>'
    ])
  })

  it('标题中的尖括号被转义，不产出可注入标记', () => {
    const xml = buildFeed(CHANNEL, [{ ...EPISODE, title: '<script>alert(1)</script>' }], { now: NOW })
    expect(xml).toContain('<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>')
    expect(xml).not.toContain('<title><script>')
  })

  it('单集按发布时间倒序，最新一期在最前', () => {
    const older = { ...EPISODE, title: '旧', guid: 'old', audioUrl: 'https://cdn.example.com/old.mp3', pubDate: new Date(Date.UTC(2026, 8, 1)) }
    const xml = buildFeed(CHANNEL, [older, EPISODE], { now: NOW })
    expect(xml.indexOf('第 1 期')).toBeLessThan(xml.indexOf('旧'))
  })

  it('MIME 按扩展名派生，可被显式覆盖', () => {
    expect(audioMimeFromUrl('https://c/a.m4a')).toBe('audio/x-m4a')
    expect(audioMimeFromUrl('https://c/a?x=1')).toBe('audio/mpeg')
    const xml = buildFeed(CHANNEL, [{ ...EPISODE, mime: 'audio/wav' }], { now: NOW })
    expect(xml).toContain('type="audio/wav"')
  })

  it('audioUrl 与 resolvedAudioUrl 共存时 enclosure 取 audioUrl——与校验侧 resolveEnclosure 同优先级（QM-6 Critical 回归）', () => {
    const ep = { ...EPISODE, resolvedAudioUrl: 'http://bad.example.com/x.mp3' }
    expect(validateFeed(CHANNEL, [ep]).ok).toBe(true)
    const xml = buildFeed(CHANNEL, [ep], { now: NOW })
    expect(xml).toContain('enclosure url="https://cdn.example.com/e1.mp3"')
    expect(xml).not.toContain('http://bad.example.com')
  })

  it('guid 为纯空白时与校验侧同口径视为缺省，回落 enclosure URL（QM-6 W2 回归）', () => {
    const ep = { ...EPISODE, guid: '   ' }
    const xml = buildFeed(CHANNEL, [ep], { now: NOW })
    expect(xml).toContain('<guid isPermaLink="false">https://cdn.example.com/e1.mp3</guid>')
    expect(xml).not.toContain('<guid isPermaLink="false"></guid>')
  })
})

describe('podcast-rss · 解析与自检', () => {
  it('构建后可解析回同构字段（往返锁）', () => {
    const xml = buildFeed(CHANNEL, [EPISODE], { now: NOW })
    const parsed = parseFeed(xml)
    expect(parsed.itemCount).toBe(1)
    expect(parsed.items[0].audioUrl).toBe('https://cdn.example.com/e1.mp3')
    expect(parsed.items[0].sizeBytes).toBe(12345678)
    expect(parsed.items[0].mime).toBe('audio/mpeg')
    expect(parsed.items[0].durationSec).toBe(3723)
    expect(parsed.coverUrl).toBe('https://cdn.example.com/cover.png')
  })

  it('自检：不可达 / 类型不符 / 长度不符分别产出对应码', async () => {
    const xml = buildFeed(CHANNEL, [EPISODE], { now: NOW })
    const bad = async () => ({ status: 404 })
    const r1 = await verifyFeed(xml, { headImpl: bad })
    expect(r1.issues.map((i) => i.code)).toEqual(['ENCLOSURE_UNREACHABLE'])
    const r2 = await verifyFeed(xml, { headImpl: async () => ({ status: 200, contentType: 'text/html', contentLength: 12345678 }) })
    expect(r2.issues.map((i) => i.code)).toEqual(['ENCLOSURE_TYPE_MISMATCH'])
    const r3 = await verifyFeed(xml, { headImpl: async () => ({ status: 200, contentType: 'audio/mpeg', contentLength: 1 }) })
    expect(r3.issues.map((i) => i.code)).toEqual(['ENCLOSURE_LENGTH_MISMATCH'])
    const r4 = await verifyFeed(xml, { headImpl: async () => ({ status: 200, contentType: 'audio/mpeg', contentLength: 12345678 }) })
    expect(r4.ok).toBe(true)
    expect(r4.checks).toEqual([{ url: 'https://cdn.example.com/e1.mp3', ok: true, reason: null, status: 200 }])
  })

  it('自检：无 head 实现时只做结构检查，不发请求', async () => {
    const xml = buildFeed(CHANNEL, [EPISODE], { now: NOW })
    const r = await verifyFeed(xml, {})
    expect(r.ok).toBe(true)
    expect(r.checks).toEqual([])
  })

  it('自检：缺少 XML 声明与 itunes 命名空间时报结构码', async () => {
    const r = await verifyFeed('<rss><channel><title>x</title></channel></rss>', {})
    expect(r.issues.map((i) => i.code)).toEqual(['FEED_NO_ITEMS', 'FEED_MISSING_ITUNES_NS', 'FEED_MISSING_XML_DECL'])
  })
})

describe('podcast-rss · 共享工具口径', () => {
  it('isHttpsUrl 复用共享协议判据，拒绝 javascript:/协议相对/缺协议', () => {
    expect(isHttpsUrl('https://a.com/x.mp3')).toBe('https://a.com/x.mp3')
    expect(isHttpsUrl('javascript:alert(1)')).toBe(null)
    expect(isHttpsUrl('//a.com/x.mp3')).toBe(null)
    expect(isHttpsUrl('a.com/x.mp3')).toBe(null)
    expect(isHttpsUrl('http://a.com/x.mp3')).toBe(null)
  })

  it('formatDuration：不足一小时为 MM:SS，超过为 HH:MM:SS', () => {
    expect(formatDuration(65)).toBe('01:05')
    expect(formatDuration(3723)).toBe('01:02:03')
    expect(formatDuration(0)).toBe('00:00')
  })

  it('matchCoverSize 支持大小写 x 与空格', () => {
    expect(matchCoverSize('3000 X 3000')).toEqual({ w: 3000, h: 3000 })
    expect(matchCoverSize('bad')).toBe(null)
  })
})

// 渲染层经 vite alias 消费 podcast-rss.browser.js（见 apps/desktop/vite.config.js）。
// 孪生是**窄面**（只承载分类/枚举目录与时长格式化），漂移会让浏览器侧下拉与主进程校验口径分裂，
// 由本 describe 按 podcast-endpoints 孪生先例逐字比对。
describe('podcast-rss · CJS/ESM 孪生 parity（窄面孪生）', () => {
  it('孪生导出集合恰好等于渲染层消费的窄面（只能按渲染层真实需求扩大）', () => {
    expect(Object.keys(rssEsm).sort()).toEqual([
      'EPISODE_FEED_TYPE_VALUES',
      'EPISODE_TYPE_VALUES',
      'EXPLICIT_VALUES',
      'ITUNES_CATEGORIES',
      'formatDuration'
    ])
  })

  it('枚举与分类目录与主进程版逐字同构', () => {
    expect(rssEsm.EXPLICIT_VALUES).toEqual(EXPLICIT_VALUES)
    expect(rssEsm.EPISODE_TYPE_VALUES).toEqual(EPISODE_TYPE_VALUES)
    expect(rssEsm.EPISODE_FEED_TYPE_VALUES).toEqual(EPISODE_FEED_TYPE_VALUES)
    expect(JSON.stringify(rssEsm.ITUNES_CATEGORIES)).toBe(JSON.stringify(ITUNES_CATEGORIES))
  })

  it('formatDuration 与主进程版在边界表上逐点一致', () => {
    for (const sec of [0, 1, 59, 60, 65, 3599, 3600, 3723, 86399, 86400, -5, 12.9, '75', null, undefined, NaN]) {
      expect(rssEsm.formatDuration(sec)).toBe(formatDuration(sec))
    }
  })
})
