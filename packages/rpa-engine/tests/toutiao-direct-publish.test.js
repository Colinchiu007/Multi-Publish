// toutiao-direct-publish.test.js — Node 侧直连发布的契约测试
// 注意：本包是 CommonJS 且 vitest globals:true —— 用全局 describe/it/expect，禁止 require('vitest')
'use strict'
const { cookiesFromSession, buildPostData, PUBLISH_QUERY, UA } = require('../src/toutiao-direct-publish')

describe('toutiao-direct-publish 契约', () => {
  it('cookiesFromSession: 排序拼接 + 含 HttpOnly', async () => {
    const fakeSession = {
      cookies: {
        get: async (filter) => {
          expect(filter.domain).toBe('toutiao.com')
          return [
            { name: 'z_token', value: 'Z' },
            { name: 'sessionid', value: 'abc', httpOnly: true },
            { name: 'tt_webid', value: '123' },
          ]
        },
      },
    }
    const cs = await cookiesFromSession(fakeSession)
    expect(cs).toBe('sessionid=abc; tt_webid=123; z_token=Z') // 按 name 排序
  })

  function toKv (body) {
    return Object.fromEntries(body.split('&').map((s) => {
      const i = s.indexOf('=')
      return [s.slice(0, i), decodeURIComponent(s.slice(i + 1))]
    }))
  }

  it('buildPostData: 立即发布基础字段齐全', () => {
    const kv = toKv(buildPostData({ title: '标题A', htmlContent: '<p>正文</p>', covers: [] }))
    expect(kv.source).toBe('0')
    expect(kv.save).toBe('0')
    expect(kv.timer_status).toBe('0')
    expect(kv.title).toBe('标题A')
    expect(kv.content).toBe('<p>正文</p>')
    expect(kv.pgc_feed_covers).toBe('[]')
    expect(kv.article_ad_type).toBe('2')
  })

  it('buildPostData: 定时发布 timer_status=1 且时间截断到分钟', () => {
    const kv = toKv(buildPostData({ title: 'T', htmlContent: 'C', covers: [], publishTime: '2026-10-02 18:30:59' }))
    expect(kv.timer_status).toBe('1')
    expect(kv.timer_time).toBe('2026-10-02 18:30')
  })

  it('buildPostData: 封面映射 uri 与 toutiaoimg url', () => {
    const body = buildPostData({
      title: 'T', htmlContent: 'C',
      covers: [{ uri: 'tos-cn-i-x/abc', thumb_width: 100, thumb_height: 80 }],
    })
    const cov = JSON.parse(decodeURIComponent(body.match(/pgc_feed_covers=([^&]+)/)[1]))
    expect(cov.length).toBe(1)
    expect(cov[0].uri).toBe('tos-cn-i-x/abc')
    expect(cov[0].url).toContain('toutiaoimg.com')
  })

  it('buildPostData: 声明首发四字段齐开', () => {
    const body = buildPostData({ title: 'T', htmlContent: 'C', covers: [], original: 1 })
    expect(body).toContain('origin_debut_check_pgc_normal=1')
    expect(body).toContain('claim_origin=1')
    expect(body).toContain('pgc_debut=1')
    expect(body).toContain('exclusive=1')
  })

  it('buildPostData: 空 title 保留字段（服务端按空校验）', () => {
    const body = buildPostData({ title: '', htmlContent: 'C', covers: [] })
    expect(body).toMatch(/(^|&)title=(&|$)/)
  })

  it('PUBLISH_QUERY 含 aid=1231 / source=mp / type=article', () => {
    expect(PUBLISH_QUERY).toContain('aid=1231')
    expect(PUBLISH_QUERY).toContain('source=mp')
    expect(PUBLISH_QUERY).toContain('type=article')
  })

  it('UA 为现代 Chrome', () => {
    expect(UA).toContain('Chrome/')
  })
})
