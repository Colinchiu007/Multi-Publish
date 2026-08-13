// @ts-check
/**
 * test_scheduler_parity.js — 模拟器与真实 governor 对拍（spec: desktop/model-call-observability）
 * 运行脚本级对拍（Python 模拟器 + 桌面端真实自检），断言四组用例关键指标一致；
 * 并断言「已知差异用例」的差异值与记录一致（防漂移：若未来修复模拟器使两端一致，此处会提示更新）。
 */
import { describe, it, expect } from 'vitest'

const { runParity, runKnownDiffs } = require('../../../../scripts/compare-scheduler-models')

describe('scheduler 模拟器与真实 governor 对拍', () => {
  it('四组固定输入关键指标一致（含 429 注入与 5h 额度）', async () => {
    const results = await runParity(1500)
    for (const r of results) {
      expect(r.pass, r.name + ' ' + JSON.stringify(r.checks) + ' python=' + JSON.stringify(r.python) + ' real=' + JSON.stringify(r.real)).toBe(true)
    }
  }, 60000)

  it('已知差异用例差异值与记录一致（慢调用并发 / 5h 拒绝耗时口径，防漂移）', async () => {
    const known = await runKnownDiffs()
    const byName = Object.fromEntries(known.map((k) => [k.name, k]))
    // 慢调用（耗时 >= 节流间隔）：真实 governor 并发可到 maxConcurrent，模拟器串行 maxc=1
    expect(byName['slow-call-concurrency'].diff.max_concurrent_observed).toBeGreaterThanOrEqual(1)
    expect(byName['slow-call-concurrency'].real.max_concurrent_observed).toBeGreaterThan(byName['slow-call-concurrency'].python.max_concurrent_observed)
    // 5h 拒绝路径：两端拒绝数一致，但 total_duration 口径差异超过官方 1.5s 容差
    expect(byName['quota-5h-real'].real.quota_exceeded_count).toBe(byName['quota-5h-real'].python.quota_exceeded_count)
    expect(Math.abs(byName['quota-5h-real'].diff.total_duration_ms)).toBeGreaterThan(1500)
  }, 120000)
})
