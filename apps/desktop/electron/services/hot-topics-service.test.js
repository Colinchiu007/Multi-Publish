// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HotTopicsService, CACHE_KEY, CHANNEL_CONFIGS } from './hot-topics-service.js'
import { classifyTopic } from './hot-topics/classifier.js'
import { parseZhihu, parseToutiao, parseTencent, parseBilibili, parseDouyin, parseBaidu, parseTophub } from './hot-topics/channels.js'

// ── 分类器 ──
describe('hot-topics classifier', () => {
  it('maps toutiao raw category to 10-category system', () => {
    expect(classifyTopic('财经', 'toutiao', '任意文本')).toBe('finance')
    expect(classifyTopic('科技', 'toutiao', '任意文本')).toBe('tech')
  })
  it('falls back to keyword rules when raw category unmapped', () => {
    expect(classifyTopic('未知分类', 'toutiao', 'A股大涨沪指重返3000点')).toBe('finance')
    expect(classifyTopic(null, 'zhihu', 'AI大模型最新突破')).toBe('tech')
    expect(classifyTopic(null, 'bilibili', '国足世界杯预选赛')).toBe('sports')
  })
  it('falls back to general when nothing matches', () => {
    expect(classifyTopic(null, 'zhihu', '完全无关文本')).toBe('general')
  })
})

// ── 渠道解析器（fixture 驱动） ──
describe('hot-topics channel parsers', () => {
  it('parses zhihu json', () => {
    const json = { data: [{ target: { title: '知乎话题A', url: 'https://zhihu.com/q/1' } }, { detail_text: '1234 万热度', target: { title: '知乎话题B' } }] }
    const items = parseZhihu(json)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ channel: 'zhihu', rank: 1, topic: '知乎话题A', url: 'https://zhihu.com/q/1' })
    expect(items[1].hotValue).toBe(1234)
  })
  it('parses toutiao json with Category', () => {
    const json = { data: [{ Title: '头条标题', HotValue: '456789', Url: 'https://toutiao.com/x', Category: '财经' }] }
    const items = parseToutiao(json)
    expect(items[0]).toMatchObject({ channel: 'toutiao', topic: '头条标题', hotValue: 456789, rawCategory: '财经' })
  })
  it('parses tencent json (idlist newslist shape) and filters ad placeholder', () => {
    const json = { idlist: [{ newslist: [
      { title: '腾讯新闻用户最关注的热点，每10分钟更新一次', articletype: '560' },
      { title: '腾讯标题 &amp; 测试', url: 'https://news.qq.com/a', articletype: '0' },
    ] }] }
    const items = parseTencent(json)
    expect(items).toHaveLength(1)
    expect(items[0].topic).toBe('腾讯标题 & 测试')
    expect(items[0].url).toBe('https://news.qq.com/a')
  })
  it('parses bilibili json', () => {
    const json = { data: { list: [{ title: 'B站视频', bvid: 'BV1xx', stat: { view: 99999 } }] } }
    const items = parseBilibili(json)
    expect(items[0]).toMatchObject({ channel: 'bilibili', topic: 'B站视频', hotValue: 99999, url: 'https://www.bilibili.com/video/BV1xx' })
  })
  it('parses douyin json', () => {
    const json = { data: { word_list: [{ word: '抖音热点词', hot_value: 8888888 }] } }
    const items = parseDouyin(json)
    expect(items[0]).toMatchObject({ channel: 'douyin', topic: '抖音热点词', hotValue: 8888888 })
  })
  it('parses baidu embedded s-data html', () => {
    const html = '<html><!--s-data:{"cards":[{"content":[{"rank":"1","word":"百度热搜词&amp;测试","hotScore":"666666","url":"https://baidu.com/s?wd=1"}]}]}--></html>'
    const items = parseBaidu(html)
    expect(items[0].topic).toBe('百度热搜词&测试')
    expect(items[0].hotValue).toBe(666666)
  })
  it('parses tophub weibo node page html', () => {
    const html = '<tbody> <tr> <td align="center">1.</td> <td><a href="https://s.weibo.com/weibo?q=%E6%B5%8B%E8%AF%95" target="_blank" rel="nofollow" itemid="1">男子编造停捐遭威胁事件被抓</a></td> <td class="ws">125万</td> </tr></tbody>'
    const items = parseTophub(html)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ channel: 'tophub', topic: '男子编造停捐遭威胁事件被抓', hotValue: 1250000 })
  })
  it('sanitizeUrl rejects non-http protocols', async () => {
    const { sanitizeUrl } = await import('./hot-topics/channels.js')
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeUrl('https://ok.com')).toBe('https://ok.com')
  })
})

// ── Service：缓存 fail-closed / 去重 / 限流 / 熔断 ──
describe('HotTopicsService', () => {
  function makeService(overrides = {}) {
    return new HotTopicsService({ log: { info: () => {}, warn: () => {}, error: () => {} }, ...overrides })
  }

  it('getCache fail-closed on corrupt persisted data', () => {
    const store = { getSetting: () => 'not-json{{{', setSetting: vi.fn() }
    const svc = makeService({ settingsStore: store })
    expect(svc.getCache()).toEqual({ topics: [], fetchedAt: 0, channelStats: {} })
  })

  it('getCache returns persisted cache', () => {
    const persisted = { topics: [{ id: 'zhihu:1', topic: 't' }], fetchedAt: 123, channelStats: {} }
    const store = { getSetting: () => JSON.stringify(persisted), setSetting: vi.fn() }
    const svc = makeService({ settingsStore: store })
    expect(svc.getCache()).toEqual(persisted)
  })

  it('fetchTopics serves fresh cache without network', async () => {
    const svc = makeService()
    svc.memCache = { topics: [{ id: 'a' }], fetchedAt: Date.now(), channelStats: {} }
    const spy = vi.spyOn(svc, '_collectChannel')
    const res = await svc.fetchTopics()
    expect(res.fromCache).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })

  it('fetchTopics dedupes cross-channel topics and merges mergedFrom', async () => {
    const svc = makeService()
    const item = (ch, rank, topic) => ({ channel: ch, rank, topic, hotValue: null, url: null, rawCategory: null })
    vi.spyOn(svc, '_collectChannel').mockImplementation(async (cfg) => {
      if (cfg.id === 'zhihu') return { channel: 'zhihu', items: [item('zhihu', 1, '重复选题')], skipped: false }
      if (cfg.id === 'toutiao') return { channel: 'toutiao', items: [item('toutiao', 1, '重复选题'), item('toutiao', 2, '唯一选题')], skipped: false }
      return { channel: cfg.id, items: null, skipped: true }
    })
    const res = await svc.fetchTopics({ force: true })
    expect(res.topics).toHaveLength(2)
    const dup = res.topics.find(x => x.topic === '重复选题')
    expect(dup.channel).toBe('zhihu')
    expect(dup.mergedFrom).toContain('toutiao')
  })

  it('channel failure does not block other channels and counts toward breaker', async () => {
    const svc = makeService()
    let failCount = 0
    vi.spyOn(svc, '_collectChannel').mockImplementation(async (cfg) => {
      if (cfg.id === 'douyin') {
        failCount++
        return { channel: 'douyin', items: null, skipped: false, error: 'HTTP 432' }
      }
      return { channel: cfg.id, items: [], skipped: false }
    })
    const res = await svc.fetchTopics({ force: true })
    expect(res.channelStats.douyin.ok).toBe(false)
    expect(res.channelStats.douyin.error).toBe('HTTP 432')
    expect(res.channelStats.zhihu.ok).toBe(true)
  })

  it('throttle blocks refetch within interval', () => {
    const svc = makeService()
    expect(svc.throttle.tryAcquire('zhihu', 5)).toBe(true)
    expect(svc.throttle.tryAcquire('zhihu', 5)).toBe(false)
  })

  it('breaker opens after 3 consecutive failures and recovers after cooldown', () => {
    const svc = makeService()
    const opts = { threshold: 3, cooldownMs: 10 }
    expect(svc.breaker.isOpen('x', opts)).toBe(false)
    svc.breaker.recordFailure('x', opts)
    svc.breaker.recordFailure('x', opts)
    expect(svc.breaker.isOpen('x', opts)).toBe(false)
    svc.breaker.recordFailure('x', opts)
    expect(svc.breaker.isOpen('x', opts)).toBe(true)
    // 冷却 10ms 后 HALF_OPEN 放行
    return new Promise(resolve => setTimeout(() => {
      expect(svc.breaker.isOpen('x', opts)).toBe(false)
      resolve()
    }, 30))
  })

  it('writes cache to settings store after fetch', async () => {
    const store = { getSetting: () => null, setSetting: vi.fn() }
    const svc = makeService({ settingsStore: store })
    vi.spyOn(svc, '_collectChannel').mockResolvedValue({ channel: 'zhihu', items: [], skipped: false })
    await svc.fetchTopics({ force: true })
    expect(store.setSetting).toHaveBeenCalledWith(CACHE_KEY, expect.stringContaining('"topics"'))
  })

  it('has 7 channel configs with interval >= 5 minutes', () => {
    expect(CHANNEL_CONFIGS).toHaveLength(7)
    for (const cfg of CHANNEL_CONFIGS) {
      expect(cfg.intervalMinutes).toBeGreaterThanOrEqual(5)
      expect(cfg.url.startsWith('https://')).toBe(true)
    }
  })
})
