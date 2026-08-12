// @ts-check
/**
 * test_scheduler_parity.js — 模拟器与真实 governor 对拍（spec: desktop/model-call-observability）
 * 运行脚本级对拍（Python 模拟器 + 桌面端真实自检），断言四组用例关键指标一致。
 */
import { describe, it, expect } from 'vitest'

const { runParity } = require('../../../../scripts/compare-scheduler-models')

describe('scheduler 模拟器与真实 governor 对拍', () => {
  it('四组固定输入关键指标一致（含 429 注入与 5h 额度）', async () => {
    const results = await runParity(1500)
    for (const r of results) {
      expect(r.pass, r.name + ' ' + JSON.stringify(r.checks) + ' python=' + JSON.stringify(r.python) + ' real=' + JSON.stringify(r.real)).toBe(true)
    }
  }, 60000)
})
