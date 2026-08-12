// @vitest-environment node
'use strict'

const { buildRunDiagnostics, captureEnvSnapshot, MAX_ERROR_LENGTH } = require('./run-diagnostics')

function makeRun (overrides) {
  return {
    id: 'run-123',
    pipeline: 'story2video-compose',
    status: 'failed',
    startedAt: '2026-08-12T00:00:00.000Z',
    endedAt: '2026-08-12T00:02:00.000Z',
    errorCode: 'TIMEOUT',
    error: 'ffmpeg timed out',
    errorParams: { apiKey: 'sk-secret-token', title: '我的视频标题' },
    stages: [
      { name: 'split', status: 'completed' },
      { name: 'generate_assets', status: 'completed' },
      { name: 'compose', status: 'failed', error: 'ffmpeg timed out' },
    ],
    currentStage: 2,
    context: {},
    ...overrides,
  }
}

describe('run-diagnostics：结构化诊断摘要', () => {
  it('失败 run → 分类 + 根因候选 + 阶段明细，纯 JSON 可序列化', () => {
    const diag = buildRunDiagnostics(makeRun(), null)
    expect(diag.runId).toBe('run-123')
    expect(diag.status).toBe('failed')
    expect(diag.stageSummary.total).toBe(3)
    expect(diag.stageSummary.failed).toEqual(['compose'])
    expect(diag.failure.stage).toBe('compose')
    expect(diag.failure.failureType).toBe('timeout')
    expect(diag.failure.severity).toBe('blocker')
    expect(Array.isArray(diag.failure.candidates)).toBe(true)
    expect(diag.durationMs).toBe(120000)
    expect(() => JSON.stringify(diag)).not.toThrow()
    expect(JSON.parse(JSON.stringify(diag))).toEqual(diag)
  })

  it('脱敏：诊断输出不携带 errorParams 原文（apiKey/标题明文不出现）', () => {
    const diag = buildRunDiagnostics(makeRun(), null)
    const json = JSON.stringify(diag)
    expect(json).not.toContain('sk-secret-token')
    expect(json).not.toContain('apiKey')
    expect(json).not.toContain('我的视频标题')
    expect(json).not.toContain('errorParams')
  })

  it('错误文本超长截断到 MAX_ERROR_LENGTH', () => {
    const long = 'x'.repeat(2000)
    const diag = buildRunDiagnostics(makeRun({ error: long, stages: [{ name: 'compose', status: 'failed', error: long }] }), null)
    expect(diag.stages[0].error.length).toBe(MAX_ERROR_LENGTH)
  })

  it('完成 run → 状态 completed，不误判 blocker', () => {
    const diag = buildRunDiagnostics(makeRun({ status: 'completed', error: null, errorCode: null, stages: [{ name: 'compose', status: 'completed' }], currentStage: 1 }), null)
    expect(diag.status).toBe('completed')
    expect(diag.failure.severity).not.toBe('blocker')
  })

  it('空/非法 run → 最小稳定结构，不抛错', () => {
    for (const input of [null, undefined, {}, 'x']) {
      expect(() => buildRunDiagnostics(input, null)).not.toThrow()
      const diag = buildRunDiagnostics(input, null)
      expect(diag).toHaveProperty('failure')
      expect(diag.failure.failureType).toBe('unknown')
    }
  })
})

  it('完成态 run → candidates 为空（不产生噪音）', () => {
    const diag = buildRunDiagnostics(makeRun({ status: 'completed', errorCode: null, error: null, stages: [{ name: 'compose', status: 'completed' }], currentStage: 0 }), null)
    expect(diag.failure.candidates).toEqual([])
  })

  it('真实编排路径（stage 无 failed 状态）失败时按 currentStage 回填', () => {
    const run = makeRun({
      stages: [
        { name: 'split', status: 'completed' },
        { name: 'compose', status: 'running' },
      ],
      currentStage: 1,
    })
    const diag = buildRunDiagnostics(run, null)
    expect(diag.stageSummary.failed).toEqual(['compose'])
    expect(diag.failure.stage).toBe('compose')
  })

  it('error 对象携带数值码 429 → provider 分类', () => {
    const err = new Error('')
    err.code = 429
    const diag = buildRunDiagnostics(makeRun({ errorCode: null, error: err }), null)
    expect(diag.failure.failureType).toBe('provider')
  })
describe('run-diagnostics：环境快照 best-effort', () => {
  it('默认快照含内存/CPU/uptime 且可序列化', () => {
    const snap = captureEnvSnapshot()
    expect(snap.memory).toBeTruthy()
    expect(typeof snap.memory.freeBytes).toBe('number')
    expect(snap.cpu.count).toBeGreaterThan(0)
    expect(snap.uptimeMs).toBeGreaterThan(0)
    expect(() => JSON.stringify(snap)).not.toThrow()
  })

  it('探测函数抛错 → 对应字段 null，整体不抛错', () => {
    const snap = captureEnvSnapshot({
      findFfmpeg: () => { throw new Error('boom') },
      findFfprobe: () => { throw new Error('boom') },
      sidecarProbe: () => { throw new Error('boom') },
    })
    expect(snap.ffmpegAvailable).toBeNull()
    expect(snap.ffprobeAvailable).toBeNull()
    expect(snap.sidecars).toBeNull()
    expect(snap.memory).toBeTruthy()
  })

  it('探测成功 → 布尔/对象字段填值', () => {
    const snap = captureEnvSnapshot({
      findFfmpeg: () => 'C:/tools/ffmpeg.exe',
      sidecarProbe: () => ({ 8002: true, 8013: false }),
    })
    expect(snap.ffmpegAvailable).toBe(true)
    expect(snap.sidecars).toEqual({ 8002: true, 8013: false })
  })

  it('磁盘余量为 number 或 null（平台兼容，永不抛错）', () => {
    const snap = captureEnvSnapshot({ outputDir: require('os').tmpdir() })
    expect(snap.diskFreeBytes === null || typeof snap.diskFreeBytes === 'number').toBe(true)
  })
})

