// @vitest-environment node
/**
 * upload-wait-strategy.test.js — 视频上传等待策略（纯逻辑 + 等待循环接线）
 *
 * 契约（publish-progress-dup-upload Bug B 取证）：
 * - computeBudgetMs：小文件短预算（909KB/1MB → 90s），96MB → 900s 上限，无体积 → 900s 兜底。
 * - computeReportPercent：页面百分比 0~100 → 30~49 波段，非法 → null。
 * - decideUploadWait：稳定期 wait；页面百分比 <100 时只在停滞+结构性信号下放行；
 *   负向信号消失且正向信号命中 → done；预算耗尽 → besteffort。
 * - 等待循环（upload-waiter.js 的 uploadWaiterMixin._waitForVideoUploadComplete）：
 *   抖音残留 progress 元素（uploading 恒真）不再白等满 15 分钟——909KB 小文件按 90s 预算放行。
 * - readVideoFileBytes：体积可得 → 自适应预算；不可得 → 回退既有 900000ms 预算。
 */
const {
  computeBudgetMs,
  computeReportPercent,
  decideUploadWait,
  MIN_BUDGET_MS,
  MAX_BUDGET_MS,
  STABILIZE_MS,
  STALL_MS,
} = require('./upload-wait-strategy')
const { uploadWaiterMixin, readVideoFileBytes } = require('./upload-waiter')

const MB = 1048576

describe('readVideoFileBytes — 视频体积读取（预算自适应输入）', () => {
  it('存在的文件 → 正数体积', () => {
    expect(readVideoFileBytes(__filename)).toBeGreaterThan(0)
  })

  it('路径缺失/非字符串/不存在 → null（调用方回退 900000ms 既有预算）', () => {
    expect(readVideoFileBytes('/no/such/video.mp4')).toBe(null)
    expect(readVideoFileBytes('')).toBe(null)
    expect(readVideoFileBytes(null)).toBe(null)
    expect(readVideoFileBytes(undefined)).toBe(null)
    expect(readVideoFileBytes(42)).toBe(null)
  })
})

describe('computeBudgetMs — 按文件大小自适应等待预算', () => {
  it('909KB 小视频 → 90s（不再一律 15 分钟）', () => {
    expect(computeBudgetMs(909 * 1024)).toBe(MIN_BUDGET_MS)
  })

  it('1MB → 90s（公式 70s 被下界抬起）', () => {
    expect(computeBudgetMs(MB)).toBe(90000)
  })

  it('50MB → 560s（基线 60s + 50×10s）', () => {
    expect(computeBudgetMs(50 * MB)).toBe(560000)
  })

  it('96MB（B站实测大文件）→ 900s 上限', () => {
    expect(computeBudgetMs(96 * MB)).toBe(MAX_BUDGET_MS)
  })

  it('体积不可得（0/null/undefined/NaN/负数）→ 900s 兜底，与旧默认一致', () => {
    for (const v of [0, null, undefined, NaN, -1, 'x']) {
      expect(computeBudgetMs(v)).toBe(MAX_BUDGET_MS)
    }
  })
})

describe('computeReportPercent — 页面百分比 → 30~49 上报波段', () => {
  it('0 → 30，50 → 39，100 → 49（向下取整）', () => {
    expect(computeReportPercent(0)).toBe(30)
    expect(computeReportPercent(50)).toBe(39)
    expect(computeReportPercent(100)).toBe(49)
  })

  it('非法/缺失 → null（调用方保持既有 30 不上报）', () => {
    for (const v of [null, undefined, NaN, -1, 101, 1000]) {
      expect(computeReportPercent(v)).toBe(null)
    }
  })
})

describe('decideUploadWait — 判定优先级', () => {
  const base = { elapsedMs: 60000, budgetMs: 90000 }

  it('稳定期内（<25s）任何信号都 wait（smoke5/smoke6：blob 预览/广告 video 不可信）', () => {
    const r = decideUploadWait({ ...base, elapsedMs: 1000, positiveSignal: true, uploading: false })
    expect(r.action).toBe('wait')
    const r2 = decideUploadWait({ ...base, elapsedMs: STABILIZE_MS - 1, positiveSignal: true, uploading: false })
    expect(r2.action).toBe('wait')
  })

  it('负向信号消失 + 正向结构信号命中 → done', () => {
    const r = decideUploadWait({ ...base, uploading: false, positiveSignal: true })
    expect(r.action).toBe('done')
  })

  it('抖音死锁形态：uploading 恒真 + 无页面百分比 → 预算前 wait', () => {
    const r = decideUploadWait({ ...base, uploading: true, positiveSignal: false, pagePercent: null })
    expect(r.action).toBe('wait')
    expect(r.reportPercent).toBe(null)
  })

  it('抖音死锁形态：预算耗尽 → besteffort（不再干等 15 分钟）', () => {
    const r = decideUploadWait({ ...base, elapsedMs: 90000, uploading: true, positiveSignal: false, pagePercent: null })
    expect(r.action).toBe('besteffort')
  })

  it('页面百分比 <100 → wait 并上报真实进度', () => {
    const r = decideUploadWait({ ...base, uploading: true, pagePercent: 45, prevPagePercent: 30, stableSinceMs: 0 })
    expect(r.action).toBe('wait')
    expect(r.reportPercent).toBe(38)
  })

  it('停滞（百分比 180s 不变 + 结构性信号）→ 提前 besteffort', () => {
    const r = decideUploadWait({
      ...base, uploading: true, pagePercent: 45, prevPagePercent: 45, stableSinceMs: STALL_MS, structuralSignal: true,
    })
    expect(r.action).toBe('besteffort')
  })

  it('停滞未满 180s → 继续 wait', () => {
    const r = decideUploadWait({
      ...base, uploading: true, pagePercent: 45, prevPagePercent: 45, stableSinceMs: STALL_MS - 1, structuralSignal: true,
    })
    expect(r.action).toBe('wait')
  })

  it('停滞但无任何结构信号（确实还在传）→ wait', () => {
    const r = decideUploadWait({
      ...base, uploading: true, pagePercent: 45, prevPagePercent: 45, stableSinceMs: STALL_MS, structuralSignal: false, positiveSignal: false,
    })
    expect(r.action).toBe('wait')
  })

  it('页面百分比 100 + 负向残留 + 无正向信号 → 预算前 wait，预算后 besteffort', () => {
    const wait = decideUploadWait({ ...base, uploading: true, pagePercent: 100, positiveSignal: false })
    expect(wait.action).toBe('wait')
    const done = decideUploadWait({ ...base, elapsedMs: 90000, uploading: true, pagePercent: 100, positiveSignal: false })
    expect(done.action).toBe('besteffort')
  })
})

// 等待循环接线：验证 Bug B 的真实收益（抖音 909KB 不再白等 15 分钟）
describe('_waitForVideoUploadComplete — 自适应轮询循环', () => {
  let nowMs

  function setClock (start) {
    nowMs = start
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs)
  }

  function makeCtx (provider) {
    let n = 0
    const exec = vi.fn(async () => provider(n++))
    const win = { webContents: { executeJavaScript: exec } }
    const ctx = {
      // 3s 轮询不真睡：只推进虚拟时钟
      _sleep: vi.fn(async (ms) => { nowMs += Number(ms) || 0 }),
      _emitProgress: vi.fn(),
    }
    ctx._probeUploadSignal = (w, probeFn) => uploadWaiterMixin._probeUploadSignal.call(ctx, w, probeFn)
    return { win, ctx, exec }
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('抖音死锁形态（uploading 恒真、无页面百分比）：909KB 按 90s 预算放行，不再等满 900s', async () => {
    setClock(1000000)
    const { win, ctx } = makeCtx(() => ({ uploading: true, pagePercent: null, positive: false, structural: false }))
    const startedAt = Date.now()

    const ok = await uploadWaiterMixin._waitForVideoUploadComplete.call(ctx, win, 'douyin', 900000, { fileBytes: 909 * 1024 })

    expect(ok).toBe(false) // best-effort 放行（与旧语义一致：warn 后继续）
    const elapsed = Date.now() - startedAt
    expect(elapsed).toBeGreaterThanOrEqual(90000)
    expect(elapsed).toBeLessThan(900000)
  })

  it('不传 fileBytes 时保持 900000 兜底预算（既有调用点兼容）', async () => {
    setClock(1000000)
    const { win, ctx } = makeCtx(() => ({ uploading: true, pagePercent: null, positive: false, structural: false }))
    const startedAt = Date.now()

    const ok = await uploadWaiterMixin._waitForVideoUploadComplete.call(ctx, win, 'kuaishou')

    expect(ok).toBe(false)
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900000)
  })

  it('页面百分比上行 + 正向信号（负向消失）→ done 且进度上报到 30~49 波段', async () => {
    setClock(1000000)
    const { win, ctx } = makeCtx((n) => (n < 9
      ? { uploading: true, pagePercent: 10, positive: false, structural: false }
      : { uploading: false, pagePercent: 100, positive: true, structural: true }))

    const ok = await uploadWaiterMixin._waitForVideoUploadComplete.call(ctx, win, 'douyin', 900000, { fileBytes: 909 * 1024 })

    expect(ok).toBe(true)
    const stages = ctx._emitProgress.mock.calls.map((c) => c[1])
    const percents = ctx._emitProgress.mock.calls.map((c) => c[2])
    expect(stages.every((s) => s === 'waiting upload...')).toBe(true) // 不新增文案
    expect(percents[0]).toBe(31) // 30 + 10*0.19 = 31.9 → 31
    expect(percents[percents.length - 1]).toBe(49)
    // 单调不倒退
    expect([...percents].sort((a, b) => a - b)).toEqual(percents)
  })

  it('停滞（百分比冻结 + 结构性信号）→ 提前放行，早于预算', async () => {
    setClock(1000000)
    const { win, ctx } = makeCtx(() => ({ uploading: true, pagePercent: 45, positive: false, structural: true }))

    const ok = await uploadWaiterMixin._waitForVideoUploadComplete.call(ctx, win, 'douyin', 900000, { fileBytes: 909 * 1024 })

    expect(ok).toBe(false)
    // 停滞判定 180s < 90s 预算，故此处按预算放行；关键是远早于旧版 900s
    expect(Date.now() - 1000000).toBeLessThan(900000)
    expect(ctx._emitProgress).toHaveBeenCalledWith('douyin', 'waiting upload...', 38)
  })

  it('executeJavaScript 抛错 → 容错为无信号，循环不中断（等满预算后 best-effort）', async () => {
    setClock(1000000)
    const { win, ctx } = makeCtx(() => { throw new Error('execution context destroyed') })

    const ok = await uploadWaiterMixin._waitForVideoUploadComplete.call(ctx, win, 'douyin', 900000, { fileBytes: 909 * 1024 })

    expect(ok).toBe(false)
    expect(ctx._emitProgress).not.toHaveBeenCalled()
  })
})
