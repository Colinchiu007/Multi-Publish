// @ts-check
/**
 * publish-reporter.test.js — 发布指标脱敏上报
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

const { PublishReporter } = require('./publish-reporter')

function makeStore (initial) {
  let data = initial || ''
  return {
    getSetting: vi.fn(() => data),
    setSetting: vi.fn((_k, v) => { data = v }),
    _getData: () => data,
  }
}

function jsonResp ({ status = 200, body = null }) {
  return {
    status,
    ok: status >= 200 && status < 300,
    arrayBuffer: async () => Buffer.from(JSON.stringify(body || {})),
  }
}

const LOG = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function makeAuth () {
  return { url: 'https://ops.example.com', apiKey: 'k' }
}

function makeHistory (records) {
  return { listRecords: vi.fn(() => ({ total: records.length, records })) }
}

describe('PublishReporter', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('聚合发布历史并按平台/日期分桶上报，成功推进水印', async () => {
    const store = makeStore()
    const history = makeHistory([
      { platform: 'wechat_mp', status: 'success', timestamp: '2026-08-11T01:00:00.000Z' },
      { platform: 'wechat_mp', status: 'failed', timestamp: '2026-08-11T02:00:00.000Z' },
      { platform: 'weibo', status: 'success', timestamp: '2026-08-11T03:00:00.000Z' },
      { platform: 'weibo', status: 'visible', timestamp: '2026-08-11T04:00:00.000Z' }, // 监控状态不计入
    ])
    const reporter = new PublishReporter({ store, log: LOG, getOpsCenterAuth: makeAuth, getHistory: () => history, getClientId: () => 'dev-1' })
    const originalFetch = global.fetch
    let sentBody = null
    global.fetch = vi.fn(async (url, opts) => {
      sentBody = JSON.parse(opts.body)
      return jsonResp({ status: 200 })
    })
    try {
      const res = await reporter.reportPending()
      expect(res.code).toBe(0)
      expect(res.reported).toBe(2) // wechat_mp + weibo 两个桶
      expect(sentBody.client_id).toBeTruthy()
      const wm = sentBody.items.find(i => i.platform === 'wechat_mp')
      expect(wm.publish_count).toBe(2)
      expect(wm.ok_count).toBe(1)
      expect(wm.fail_count).toBe(1)
      expect(store._getData()).toContain('2026-08-11T04:00:00.000Z') // 水印推进到最新
    } finally {
      global.fetch = originalFetch
    }
  })

  it('水印去重：同批记录不重复上报', async () => {
    const store = makeStore()
    const history = makeHistory([
      { platform: 'wechat_mp', status: 'success', timestamp: '2026-08-11T01:00:00.000Z' },
      { platform: 'wechat_mp', status: 'success', timestamp: '2026-08-11T02:00:00.000Z' },
    ])
    const reporter = new PublishReporter({ store, log: LOG, getOpsCenterAuth: makeAuth, getHistory: () => history, getClientId: () => 'dev-1' })
    const originalFetch = global.fetch
    let sentBodies = []
    global.fetch = vi.fn(async (url, opts) => { sentBodies.push(JSON.parse(opts.body)); return jsonResp({ status: 200 }) })
    try {
      await reporter.reportPending() // 首次全量
      await reporter.reportPending() // 二次：水印后无新记录
      expect(sentBodies).toHaveLength(1) // 第二次 skip，不发送
    } finally {
      global.fetch = originalFetch
    }
  })

  it('脏记录（非法平台/日期）被丢弃不进桶，其余正常上报', async () => {
    const store = makeStore()
    const history = makeHistory([
      { platform: 'wechat_mp', status: 'success', timestamp: '2026-08-11T01:00:00.000Z' },
      { platform: 'BAD PLATFORM 中文', status: 'success', timestamp: '2026-08-11T02:00:00.000Z' },
      { platform: 'weibo', status: 'success', timestamp: '2026-08-11T03:00:00.000Z' },
    ])
    const reporter = new PublishReporter({ store, log: LOG, getOpsCenterAuth: makeAuth, getHistory: () => history, getClientId: () => 'dev-1' })
    const originalFetch = global.fetch
    let sentBody = null
    global.fetch = vi.fn(async (url, opts) => { sentBody = JSON.parse(opts.body); return jsonResp({ status: 200 }) })
    try {
      const res = await reporter.reportPending()
      expect(res.reported).toBe(2) // 脏平台记录被丢弃
      const platforms = sentBody.items.map(i => i.platform)
      expect(platforms).not.toContain('BAD PLATFORM 中文')
      expect(sentBody.report_id).toContain('dev-1:')
    } finally {
      global.fetch = originalFetch
    }
  })

  it('批量达到 5000 上限时不推进水印（下周期续报），批次幂等防重复', async () => {
    const store = makeStore()
    const records = Array.from({ length: 5000 }, (_, i) => ({
      platform: 'wechat_mp', status: 'success', timestamp: new Date(Date.UTC(2026, 7, 11, 0, 0, i % 60)).toISOString(),
    }))
    const history = { listRecords: vi.fn(() => ({ total: records.length, records })) }
    const reporter = new PublishReporter({ store, log: LOG, getOpsCenterAuth: makeAuth, getHistory: () => history, getClientId: () => 'dev-1' })
    const originalFetch = global.fetch
    global.fetch = vi.fn(async () => jsonResp({ status: 200 }))
    try {
      const res = await reporter.reportPending()
      expect(res.code).toBe(0)
      expect(store._getData()).toBe('') // 水印未推进（记录数达到上限）
    } finally {
      global.fetch = originalFetch
    }
  })

  it('未配置 URL/Key 静默跳过；鉴权失败保留水印', async () => {
    const store = makeStore()
    const history = makeHistory([{ platform: 'x', status: 'success', timestamp: '2026-08-11T01:00:00.000Z' }])
    const reporter = new PublishReporter({ store, log: LOG, getOpsCenterAuth: () => null, getHistory: () => history })
    expect((await reporter.reportPending()).skipped).toBe(true)

    const reporter2 = new PublishReporter({ store, log: LOG, getOpsCenterAuth: makeAuth, getHistory: () => history, getClientId: () => 'dev-1' })
    const originalFetch = global.fetch
    global.fetch = vi.fn(async () => jsonResp({ status: 401 }))
    try {
      const res = await reporter2.reportPending()
      expect(res.code).toBe(-1)
      expect(store._getData()).toBe('') // 水印未推进
    } finally {
      global.fetch = originalFetch
    }
  })
})
