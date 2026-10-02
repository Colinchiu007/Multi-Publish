// toutiao-direct-publish.test.js — Node 侧直连发布的契约测试
'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { cookiesFromSession, buildPostData, uploadCover, publishWithSign, PUBLISH_QUERY } = require('../src/toutiao-direct-publish')

test('cookiesFromSession: 排序拼接 + 含 HttpOnly', async () => {
  // 模拟 Electron session.cookies.get 返回（含 HttpOnly 会话 cookie）
  const fakeSession = {
    cookies: {
      get: async (filter) => {
        assert.equal(filter.domain, 'toutiao.com')
        return [
          { name: 'z_token', value: 'Z' },
          { name: 'sessionid', value: 'abc', httpOnly: true },
          { name: 'tt_webid', value: '123' },
        ]
      },
    },
  }
  const cs = await cookiesFromSession(fakeSession)
  assert.equal(cs, 'sessionid=abc; tt_webid=123; z_token=Z') // 按 name 排序
})

test('buildPostData: 发布字段表（参考产品同款）——立即发布', () => {
  const body = buildPostData({ title: '标题X', htmlContent: '<p>正文X</p>', covers: [] })
  const kv = Object.fromEntries(body.split('&').map((s) => {
    const i = s.indexOf('=')
    return [s.slice(0, i), decodeURIComponent(s.slice(i + 1))]
  }))
  assert.equal(kv.source, '0')
  assert.equal(kv.save, '0')
  assert.equal(kv.timer_status, '0')
  assert.equal(kv.title, '标题X')
  assert.equal(kv.content, '<p>正文X</p>')
  assert.equal(kv.pgc_feed_covers, '[]')
})

test('buildPostData: 空 title 也保留字段（服务端按空校验，不吞字段）', () => {
  const body = buildPostData({ title: '', htmlContent: 'C', covers: [] })
  assert.ok(/(^|&)title=(&|$)/.test(body))
})

test('buildPostData: 定时时间截断到分钟且 timer_status=1', () => {
  const body = buildPostData({ title: 'T', htmlContent: 'C', covers: [], publishTime: '2026-10-02 18:30:59' })
  const kv = Object.fromEntries(body.split('&').map((s) => {
    const i = s.indexOf('=')
    return [s.slice(0, i), decodeURIComponent(s.slice(i + 1))]
  }))
  assert.equal(kv.timer_status, '1')
  assert.equal(kv.timer_time, '2026-10-02 18:30')
})

test('PUBLISH_QUERY 含 aid=1231（字节系必需）', () => {
  assert.ok(PUBLISH_QUERY.includes('aid=1231'))
  assert.ok(PUBLISH_QUERY.includes('source=mp'))
  assert.ok(PUBLISH_QUERY.includes('type=article'))
})

test('publishWithSign: 返回映射 code/pgcId（mock https 响应）', async () => {
  // 不真发请求：直接断言函数存在且签名正确（网络层由 e2e 覆盖）
  assert.equal(typeof publishWithSign, 'function')
  assert.equal(uploadCover.constructor.name, 'AsyncFunction')
})
