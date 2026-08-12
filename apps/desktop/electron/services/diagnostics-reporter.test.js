// @vitest-environment node
'use strict'

const { DatabaseSync } = require('node:sqlite')
const { DiagnosticsReporter, toDiagnosticsSample } = require('./diagnostics-reporter')

function makeSampleRun (over) {
  return {
    id: 'run-1',
    pipeline: 'story2video-compose',
    status: 'failed',
    orchestrationMode: 'orchestrator',
    endedAt: '2026-08-12T03:00:00.000Z',
    diagnostics: {
      runId: 'run-1',
      pipeline: 'story2video-compose',
      status: 'failed',
      durationMs: 120000,
      failure: {
        stage: 'compose', failureType: 'timeout', severity: 'blocker', recoverability: 'retryable',
        candidates: [{ causeId: 'provider_timeout', label: '服务商请求超时', checks: ['a'], advice: 'b', confidence: 'medium' }],
      },
      env: { diskFreeBytes: 31899598848, sidecars: { pythonBackend: true } },
    },
    errorParams: { apiKey: 'sk-secret' },
    ...over,
  }
}

function makeStore () {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE diagnostics_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT UNIQUE, created_at TEXT, payload TEXT)')
  const settings = {}
  return {
    db,
    getSetting: (k) => settings[k] || '',
    setSetting: (k, v) => { settings[k] = v },
  }
}

function makeReporter (store, over = {}) {
  return new DiagnosticsReporter({
    store,
    log: { info () {}, warn () {}, error () {} },
    getOpsCenterAuth: () => ({ url: 'https://ops.example.com', apiKey: 'key-1' }),
    getClientId: () => 'client-hash-1',
    ...over,
  })
}

describe('diagnostics-reporter：白名单样本', () => {
  it('toDiagnosticsSample 只输出白名单字段，不含 errorParams/凭据', () => {
    const sample = toDiagnosticsSample(makeSampleRun())
    expect(sample).toEqual({
      run_id: 'run-1',
      diag_date: '2026-08-12',
      pipeline: 'story2video-compose',
      status: 'failed',
      stage: 'compose',
      failure_type: 'timeout',
      severity: 'blocker',
      recoverability: 'retryable',
      cause_id: 'provider_timeout',
      duration_ms: 120000,
      env: { disk_free_bytes: 31899598848, python_backend: true },
    })
    const json = JSON.stringify(sample)
    expect(json).not.toContain('sk-secret')
    expect(json).not.toContain('apiKey')
    expect(json).not.toContain('errorParams')
  })

  it('非法 run 返回 null（无 diagnostics / 非终态 / 非编排）', () => {
    expect(toDiagnosticsSample(null)).toBeNull()
    expect(toDiagnosticsSample({ id: 'x' })).toBeNull()
    expect(toDiagnosticsSample(makeSampleRun({ status: 'running' }))).toBeNull()
  })
})

describe('diagnostics-reporter：enqueue', () => {
  it('仅编排模式终态 run 入队，run_id 唯一', () => {
    const store = makeStore()
    const r = makeReporter(store)
    expect(r.enqueue(makeSampleRun())).toBe(true)
    expect(r.enqueue(makeSampleRun())).toBe(true) // 同 run_id → INSERT OR IGNORE
    const row = store.db.prepare('SELECT COUNT(*) c FROM diagnostics_queue').get()
    expect(row.c).toBe(1)
    expect(r.enqueue(makeSampleRun({ orchestrationMode: 'state_machine' }))).toBe(false)
  })
})

describe('diagnostics-reporter：枚举归一化与超时重试', () => {
  it('未知枚举归一化为 unknown（不触发服务端整批 400）', () => {
    const sample = toDiagnosticsSample(makeSampleRun({ diagnostics: {
      ...makeSampleRun().diagnostics,
      failure: { stage: 'bogus', failureType: 'bogus', severity: 'bogus', recoverability: 'bogus', candidates: [] },
    } }))
    expect(sample.stage).toBe('unknown')
    expect(sample.failure_type).toBe('unknown')
    expect(sample.severity).toBe('unknown')
    expect(sample.recoverability).toBe('unknown')
  })

  it('duplicate 响应按 acked_max_id 推进水印并保留新行', async () => {
    const store = makeStore()
    const r = makeReporter(store)
    r.enqueue(makeSampleRun({ id: 'run-a' }))
    // 第一次上报成功（服务端已提交但响应丢失的场景由第二次模拟）
    let firstBatch = null
    global.fetch = async (_u, opts) => { firstBatch = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ ingested: 1 }) } }
    await r.reportPending()
    delete global.fetch
    // 新行入队后重试同窗口：服务端返回 duplicate + acked_max_id=1
    r.enqueue(makeSampleRun({ id: 'run-b' }))
    let dupBody = null
    global.fetch = async (_u, opts) => { dupBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ duplicate: true, acked_max_id: 1 }) } }
    const result = await r.reportPending()
    delete global.fetch
    expect(result.duplicate).toBe(true)
    expect(store.getSetting('opsCenterDiagnosticsReport')).toContain('"lastId":1')
    // 队列仅剩 run-b（id=2）
    const remaining = store.db.prepare('SELECT run_id FROM diagnostics_queue ORDER BY id').all()
    expect(remaining.map(x => x.run_id)).toEqual(['run-b'])
  })
})

describe('diagnostics-reporter：reportPending', () => {
  it('未配置 ops-center 时静默跳过', async () => {
    const store = makeStore()
    const r = makeReporter(store, { getOpsCenterAuth: () => null })
    expect(await r.reportPending()).toEqual({ code: 0, skipped: true })
  })

  it('上报 daily 桶 + 失败样本，推进 watermark 并清理队列', async () => {
    const store = makeStore()
    const r = makeReporter(store)
    r.enqueue(makeSampleRun())
    r.enqueue(makeSampleRun({ id: 'run-2', status: 'completed' }))

    let captured = null
    global.fetch = async (url, opts) => {
      captured = { url, body: JSON.parse(opts.body) }
      return { ok: true, status: 200 }
    }
    const result = await r.reportPending()
    expect(result.reported).toBe(1) // 1 个 daily 桶（同日期同 pipeline 合并）
    expect(captured.url).toContain('/api/v1/diagnostics/ingest')
    expect(captured.body.daily[0]).toMatchObject({ diag_date: '2026-08-12', total_runs: 2, failed_runs: 1, success_runs: 1 })
    expect(captured.body.samples.length).toBe(1) // 仅失败样本
    expect(captured.body.batch_id).toBe('client-hash-1:0:2')
    expect(captured.body.taxonomy_version).toBe(1)
    expect(store.getSetting('opsCenterDiagnosticsReport')).toContain('"lastId":2')
    expect(store.db.prepare('SELECT COUNT(*) c FROM diagnostics_queue').get().c).toBe(0)
    delete global.fetch
  })

  it('上报失败保留 watermark 与队列（可重试）', async () => {
    const store = makeStore()
    const r = makeReporter(store)
    r.enqueue(makeSampleRun())
    global.fetch = async () => { throw new Error('network down') }
    const result = await r.reportPending()
    expect(result.code).toBe(-1)
    expect(store.getSetting('opsCenterDiagnosticsReport') || '').toBe('')
    expect(store.db.prepare('SELECT COUNT(*) c FROM diagnostics_queue').get().c).toBe(1)
    delete global.fetch
  })

  it('同窗口 batch_id 稳定（幂等）', async () => {
    const store = makeStore()
    const r = makeReporter(store)
    r.enqueue(makeSampleRun())
    let body1 = null
    global.fetch = async (_u, opts) => { body1 = JSON.parse(opts.body); return { ok: true, status: 200 } }
    await r.reportPending()
    expect(body1.batch_id).toBe('client-hash-1:0:1')
    delete global.fetch
  })
})
