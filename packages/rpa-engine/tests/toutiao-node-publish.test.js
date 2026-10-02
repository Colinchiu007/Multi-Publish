// toutiao-node-publish.test.js — Node 侧直连发布的字段表与请求构造测试
'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { buildPostData, uploadCover, UA } = require('../src/toutiao-node-publish')

test('buildPostData: 立即发布（timer_status=0）基础字段齐全', () => {
  const body = buildPostData({ title: '标题A', htmlContent: '<p>正文</p>', covers: [] })
  const kv = Object.fromEntries(body.split('&').map((s) => {
    const i = s.indexOf('=')
    return [s.slice(0, i), decodeURIComponent(s.slice(i + 1))]
  }))
  assert.equal(kv.source, '0')
  assert.equal(kv.save, '0')
  assert.equal(kv.timer_status, '0')
  assert.equal(kv.timer_time, '')
  assert.equal(kv.title, '标题A')
  assert.equal(kv.content, '<p>正文</p>')
  assert.equal(kv.pgc_feed_covers, '[]')
  assert.equal(kv.article_ad_type, '2')
  assert.ok(kv.extra.includes('publisher_mp'))
})

test('buildPostData: 定时发布（timer_status=1，时间截断到分钟）', () => {
  const body = buildPostData({ title: 'T', htmlContent: 'C', covers: [], publishTime: '2026-10-02 18:30:59' })
  const kv = Object.fromEntries(body.split('&').map((s) => {
    const i = s.indexOf('=')
    return [s.slice(0, i), decodeURIComponent(s.slice(i + 1))]
  }))
  assert.equal(kv.timer_status, '1')
  assert.equal(kv.timer_time, '2026-10-02 18:30')
})

test('buildPostData: 有封面时 mp_editor_stat 与 pgc_feed_covers 携带 uri', () => {
  const body = buildPostData({
    title: 'T', htmlContent: 'C',
    covers: [{ uri: 'tos-cn-i-x/abc', thumb_width: 100, thumb_height: 80 }],
  })
  assert.ok(/mp_editor_stat=/.test(body))
  const cov = decodeURIComponent(body.match(/pgc_feed_covers=([^&]+)/)[1])
  const arr = JSON.parse(cov)
  assert.equal(arr.length, 1)
  assert.equal(arr[0].uri, 'tos-cn-i-x/abc')
  assert.ok(arr[0].url.includes('toutiaoimg.com'))
})

test('buildPostData: 声明首发时四字段齐开', () => {
  const body = buildPostData({ title: 'T', htmlContent: 'C', covers: [], original: 1 })
  assert.ok(/origin_debut_check_pgc_normal=1/.test(body))
  assert.ok(/claim_origin=1/.test(body))
  assert.ok(/pgc_debut=1/.test(body))
  assert.ok(/exclusive=1/.test(body))
})

test('UA 为现代 Chrome（与页面环境一致）', () => {
  assert.ok(UA.includes('Chrome/'))
})
