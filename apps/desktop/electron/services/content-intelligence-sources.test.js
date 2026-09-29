/**
 * content-intelligence-sources.js 的 url 字段收口回归
 * （PRD-HREF-SCHEME-GUARD-2026-09-29，QM-5 第 4 步「回归保护测试」）
 *
 * 为什么单独立一个文件：渲染层的 href 结构锁只查"这个文件 import 了共享判据"，
 * 把 `safeHttpUrl(d.url)` 的包裹拆掉、留着 import，锁照样绿。所以采集侧必须按**行为**锁：
 * 喂真实形态的第三方载荷，断言产出的 `url` 里不可能存在非 http/https 协议。
 *
 * 真实依赖：直接 require 被测 mixin，只替换 `_getAxios()` 返回假 axios
 * （不发任何真实请求，符合「测试层禁止真实出站」）。
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const sourcesMixin = require(path.resolve(__dirname, './content-intelligence-sources.js'))

/** 用假 axios 装配一个被测 mixin 的实例（this 依赖只有这两个） */
function makeTarget (payloadFor) {
  return Object.assign({}, sourcesMixin, {
    _getAxios () {
      return { get: async (_url, _opts) => ({ data: payloadFor(_url) }) }
    },
  })
}

const hnHit = (over = {}) => ({
  objectID: '12345',
  title: 'Show HN: 一个标题',
  url: 'https://example.com/real',
  points: 10,
  num_comments: 3,
  author: 'someone',
  created_at_i: 1700000000,
  ...over,
})

const ghItem = (over = {}) => ({
  id: 1,
  full_name: 'owner/repo',
  html_url: 'https://github.com/owner/repo',
  description: 'desc',
  stargazers_count: 50,
  open_issues_count: 2,
  owner: { login: 'owner' },
  created_at: '2026-05-01T00:00:00Z',
  language: 'JavaScript',
  topics: ['a'],
  ...over,
})

const redditChild = (permalink) => ({
  kind: 't3',
  data: { id: 'r1', title: 'reddit title', permalink, selftext: '', score: 5, num_comments: 1, created_utc: 1700000000, author: 'op', subreddit: 'test' },
})

describe('_searchHN — HN 的 url 由提交人完全可控，必须收口', () => {
  it('javascript: 载荷不得进入结果，回落本站 item 页（链接仍然可用，且必然安全）', async () => {
    const t = makeTarget(() => ({ hits: [hnHit({ url: 'javascript:window.electronAPI.store.set("pwned","1")' })] }))
    const out = await t._searchHN('q', 5)
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://news.ycombinator.com/item?id=12345')
  })

  it('data: / vbscript: / 协议相对 / 缺协议 一律回落，不得原样透出', async () => {
    for (const bad of [
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      '//evil.example/x',
      'evil.example/x',
      ' javascript:alert(1)',
    ]) {
      const t = makeTarget(() => ({ hits: [hnHit({ url: bad })] }))
      const out = await t._searchHN('q', 5)
      expect(out[0].url, `载荷 ${JSON.stringify(bad)} 不应被原样采用`).toBe('https://news.ycombinator.com/item?id=12345')
    }
  })

  it('合法 https 必须逐字保留（不得被重编码或改写），首尾空白去掉', async () => {
    const t = makeTarget(() => ({ hits: [hnHit({ url: '  https://example.com/a%20b?c=1  ' })] }))
    const out = await t._searchHN('q', 5)
    expect(out[0].url).toBe('https://example.com/a%20b?c=1')
  })

  it('url 缺席（纯文本贴）仍走既有回落', async () => {
    const t = makeTarget(() => ({ hits: [hnHit({ url: undefined })] }))
    const out = await t._searchHN('q', 5)
    expect(out[0].url).toBe('https://news.ycombinator.com/item?id=12345')
  })
})

describe('_fetchHNTrending — 热榜分支与检索分支同口径', () => {
  it('热榜里的 javascript: 同样被收口', async () => {
    const t = makeTarget(() => ({ hits: [hnHit({ url: 'javascript:alert(1)' })] }))
    const out = await t._fetchHNTrending(5)
    expect(out[0].url).toBe('https://news.ycombinator.com/item?id=12345')
  })
})

describe('_searchGitHub / _fetchGitHubTrending — html_url 属外部字段，不得免检', () => {
  it('检索分支：非法协议产出 null（渲染端据此不成链），合法值逐字保留', async () => {
    const t = makeTarget(() => ({
      items: [ghItem({ html_url: 'javascript:alert(1)' }), ghItem({ id: 2, html_url: 'https://github.com/a/b' })],
    }))
    const out = await t._searchGitHub('q', 5)
    expect(out[0].url).toBeNull()
    expect(out[1].url).toBe('https://github.com/a/b')
  })

  it('热榜分支：同口径', async () => {
    const t = makeTarget(() => ({ items: [ghItem({ html_url: 'javascript:alert(1)' })] }))
    const out = await t._fetchGitHubTrending(5)
    expect(out[0].url).toBeNull()
  })
})

describe('reddit 分支 — 本站拼接的绝对地址不受影响', () => {
  it('permalink 拼接结果必须原样保留（回归：不得把安全路径误杀成 null）', async () => {
    for (const fn of ['_searchReddit', '_fetchRedditTrending']) {
      const t = makeTarget(() => ({ data: { children: [redditChild('/r/test/comments/abc/xx')] } }))
      const out = await t[fn]('q', 5)
      expect(out[0].url).toBe('https://reddit.com/r/test/comments/abc/xx')
    }
  })
})
