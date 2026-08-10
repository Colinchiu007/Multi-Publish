// @ts-check
/**
 * usage-reporter.test.js — 模型调用用量脱敏上报
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { UsageReporter, classifyStatus } = require('./usage-reporter')

function makeDb (rows) {
  const statements = []
  return {
    prepare: vi.fn((sql) => {
      const stmt = {
        all: vi.fn((...args) => rows),
        run: vi.fn(() => ({ changes: 1 })),
      }
      statements.push({ sql, stmt })
      return stmt
    }),
    _statements: statements,
  }
}

function makeStore (rows, initial) {
  let data = initial || ''
  return {
    db: makeDb(rows),
    getSetting: vi.fn(() => data),
    setSetting: vi.fn((_k, v) => { data = v }),
    _getData: () => data,
  }
}

const LOG = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const AUTH = { url: 'https://ops.example.com', apiKey: 'k' }

describe('classifyStatus', () => {
  it('success / 限流 / 普通失败分类', () => {
    expect(classifyStatus({ status: 'success' })).toEqual({ ok: true, ratelimit: false })
    expect(classifyStatus({ status: 'error', error_message: 'rate limit exceeded' }).ratelimit).toBe(true)
    expect(classifyStatus({ status: 'error', error_message: 'HTTP 429' }).ratelimit).toBe(true)
    expect(classifyStatus({ status: 'timeout', error_message: 'ETIMEDOUT' })).toEqual({ ok: false, ratelimit: false })
  })
})

describe('UsageReporter.reportPending', () => {
  let originalFetch
  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('未配置 auth 时静默跳过', async () => {
    const store = makeStore([])
    const r = new UsageReporter({ store, log: LOG, getOpsCenterAuth: () => null })
    const res = await r.reportPending()
    expect(res).toEqual({ code: 0, skipped: true })
  })

  it('无待上报日志时直接返回 0', async () => {
    const store = makeStore([])
    const r = new UsageReporter({ store, log: LOG, getOpsCenterAuth: () => AUTH, getClientId: () => 'dev-1' })
    const res = await r.reportPending()
    expect(res).toEqual({ code: 0, reported: 0 })
  })

  it('聚合上报并按水印推进；脱敏（不含 error_message）', async () => {
    const rows = [
      { id: 1, provider_id: 'openai', category: 'llm', action: 'chat', status: 'success', latency_ms: 500, tokens_in: 100, tokens_out: 50, cost: 0.01, error_message: null, created_at: '2026-08-09 10:00:00' },
      { id: 2, provider_id: 'openai', category: 'llm', action: 'chat', status: 'error', latency_ms: 2000, tokens_in: 0, tokens_out: 0, cost: 0, error_message: 'rate limit exceeded 敏感信息', created_at: '2026-08-09 11:00:00' },
      { id: 3, provider_id: 'minimax-multimodal', category: 'multimodal', action: 'tts', status: 'success', latency_ms: 12000, tokens_in: 0, tokens_out: 0, cost: 0.5, error_message: null, created_at: '' },
    ]
    const store = makeStore(rows)
    const r = new UsageReporter({ store, log: LOG, getOpsCenterAuth: () => AUTH, getClientId: () => 'dev-1' })
    let body
    global.fetch = vi.fn(async (url, opts) => {
      body = JSON.parse(opts.body)
      return { ok: true, status: 200 }
    })
    const res = await r.reportPending()
    expect(res.code).toBe(0)
    expect(res.reported).toBe(2)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://ops.example.com/api/v1/usage/ingest',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-Catalog-Key': 'k' }) }),
    )
    // 批次号随请求发出（服务端按 client_id+batch_id 去重防重试翻倍）
    expect(body.batch_id).toContain('dev-1:0:3')
    const byAction = Object.fromEntries(body.items.map(i => [i.action, i]))
    expect(byAction.chat.usage_date).toBe('2026-08-09') // 按 created_at 真实日期归日
    expect(byAction.chat.calls).toBe(2)
    expect(byAction.chat.ok_count).toBe(1)
    expect(byAction.chat.fail_count).toBe(1)
    expect(byAction.chat.ratelimit_count).toBe(1)
    expect(byAction.chat.latency_buckets).toEqual({ lt1s: 1, '1to3s': 1, '3to10s': 0, gt10s: 0 })
    expect(byAction.tts.calls).toBe(1)
    expect(byAction.tts.latency_buckets.gt10s).toBe(1)
    // 脱敏：不上报 error_message 字段
    expect(JSON.stringify(body)).not.toContain('rate limit exceeded')
    expect(JSON.stringify(body)).not.toContain('error_message')
    // 水印推进到 max id
    expect(store._getData()).toContain('lastId')
    expect(JSON.parse(store._getData()).lastId).toBe(3)
  })

  it('上报失败保留水印，下次重试不丢数据', async () => {
    const rows = [{ id: 1, provider_id: 'openai', category: 'llm', action: 'chat', status: 'success', latency_ms: 100, tokens_in: 0, tokens_out: 0, cost: 0, error_message: null }]
    const store = makeStore(rows)
    const r = new UsageReporter({ store, log: LOG, getOpsCenterAuth: () => AUTH })
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }))
    const res = await r.reportPending()
    expect(res.code).toBe(-1)
    expect(store._getData()).toBe('') // 水印未推进
  })

  it('start 后定时与首报触发（fake timers）', async () => {
    vi.useFakeTimers()
    const rows = []
    const store = makeStore(rows)
    const r = new UsageReporter({ store, log: LOG, getOpsCenterAuth: () => AUTH })
    const spy = vi.spyOn(r, 'reportPending').mockResolvedValue({ code: 0 })
    r.start()
    expect(spy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5001)
    expect(spy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30 * 60 * 1000)
    expect(spy).toHaveBeenCalledTimes(2)
    r.stop()
  })
})
