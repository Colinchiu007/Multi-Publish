// @ts-check
/**
 * test_scheduler_parity.js — 模拟器与真实 governor 对拍（spec: desktop/model-call-observability）
 * 运行脚本级对拍（Python 模拟器 + 桌面端真实自检），断言 6 组用例关键指标一致
 * （官方四组 + 5h 真实参数 + 慢调用并发推进；2026-08-13 模拟器并发推进升级后 quota-5h-real / concurrency-real 纳入 must-pass）；
 * 并断言「已知差异用例」（interval==duration 临界测量噪声）差异值存在（防漂移）。
 */
import { describe, it, expect } from 'vitest'

const { runParity, runKnownDiffs, concurrencyCheck, effectiveMaxConcurrent, pythonMetrics, CASES, KNOWN_DIFF_CASES } = require('../../../../scripts/compare-scheduler-models')
const { runSelfCheck } = require('../services/rate-limit-self-check')

describe('scheduler 模拟器与真实 governor 对拍', () => {
  it('六组固定输入关键指标一致（含 429 注入、5h 额度、真实参数、并发推进）', async () => {
    // 存在性前置（不是冗余）：标题里的"六组"必须是可判定的事实。否则把某组移出
    // must-pass 只会让这条锁少跑一组而**照样绿** —— 缺席被当成通过是本仓反复踩过的形态。
    expect(CASES.map((c) => c.name)).toEqual([
      'rpm120-concurrency2', 'rpm30-concurrency1', 'inject-429', 'quota-5h', 'quota-5h-real', 'concurrency-real',
    ])
    // inject-429 不得被移进 KNOWN_DIFF（移出判定等于删锁，而不是修判据）
    expect(KNOWN_DIFF_CASES.map((c) => c.name)).not.toContain('inject-429')

    const results = await runParity(1500)
    for (const r of results) {
      // 每次跑都打印逐用例的「预测 / 实测 / 差值 / 生效容差」。调容差需要的是分布，
      // 而只在失败时才有的信息等于每三个月拿到一个孤立样本 —— 上一轮就是靠 1653/1640
      // 两个偶发样本才判出漂移是「常量 + 比例」，靠猜会把门禁调成既不灵敏也不稳定。
      console.log('[parity] ' + r.name
        + ' python=' + r.python.total_duration_ms
        + ' real=' + r.real.total_duration_ms
        + ' diff=' + r.diffTotalDurationMs
        + ' allowed=' + r.allowedTotalDurationMs
        + ' pass=' + r.pass)
      // 失败信息必须带上「实际生效容差」与「本次差值」：上一轮 main 红时只给了 python/real
      // 两个 JSON，看不出 1653ms 是超了 1500 还是超了比例，排障要回头翻脚本。
      expect(r.pass, r.name + ' ' + JSON.stringify(r.checks)
        + ' maxc判据=' + JSON.stringify(r.concurrency)
        + ' diffTotalDurationMs=' + r.diffTotalDurationMs
        + ' allowedTotalDurationMs=' + r.allowedTotalDurationMs
        + ' python=' + JSON.stringify(r.python) + ' real=' + JSON.stringify(r.real)).toBe(true)
    }
  }, 120000)

  it('已知差异用例差异值与记录一致（interval==duration 临界测量噪声，防漂移）', async () => {
    const known = await runKnownDiffs()
    const byName = Object.fromEntries(known.map((k) => [k.name, k]))
    // slow-call-concurrency：interval==duration 临界，真实 governor 定时器误差产生 1ms 级重叠 → maxc = 模拟器 + 1（噪声，非并发能力）
    expect(byName['slow-call-concurrency'].diff.max_concurrent_observed).toBe(1)
    expect(Math.abs(byName['slow-call-concurrency'].diff.total_duration_ms)).toBeLessThan(1500)
  }, 120000)
})

/**
 * 并发判据合同（spec: desktop/model-call-observability「模拟器与真实 governor 对拍」）。
 *
 * 为什么单独立一组纯数据用例：判据本身必须是可判定、可反证的真值表，不能只在"真跑了 47s
 * 对拍"时被动暴露。#2606 那次 main 红就是这条判据把**测量口径**当成了**契约漂移**——
 * `max_concurrent_observed` 由"任务开始到其完成回调真正执行"的窗口计出，事件帧被饿到
 * 接近相邻起始间隔时，前一个 20ms 调用的递减被推迟，真实侧就会比确定性模拟器多报 1，
 * 而多出来的那个 1 从未越过配置上限（2 ≤ maxConcurrent=2）。
 */
describe('并发观测判据合同（上限不变量 + 单侧有界噪声）', () => {
  it('相等时通过，且不算命中噪声豁免', () => {
    const r = concurrencyCheck({ simulated: 2, real: 2, maxConcurrent: 2 })
    expect(r.pass).toBe(true)
    expect(r.noiseBypass).toBe(false)
  })

  it('真实侧比模型多 1 且未越上限 ⇒ 通过，但必须如实标出命中豁免', () => {
    const r = concurrencyCheck({ simulated: 1, real: 2, maxConcurrent: 2 })
    expect(r.pass, JSON.stringify(r)).toBe(true)
    expect(r.noiseBypass, '豁免不得静默生效，否则没人知道这次是靠噪声口径过的').toBe(true)
  })

  it('多 1 但同时越过配置上限 ⇒ 判红（上限不变量任何情况不放宽）', () => {
    const r = concurrencyCheck({ simulated: 2, real: 3, maxConcurrent: 2 })
    expect(r.pass, '2+1=3 已超上限 2，必须红：' + JSON.stringify(r)).toBe(false)
  })

  it('真实侧低于模型 ⇒ 判红（该方向的偏差只能来自调度行为差异）', () => {
    const r = concurrencyCheck({ simulated: 2, real: 1, maxConcurrent: 2 })
    expect(r.pass, JSON.stringify(r)).toBe(false)
  })

  it('多 2 及以上 ⇒ 判红（豁免只到 +1，不是万能容差）', () => {
    expect(concurrencyCheck({ simulated: 1, real: 3, maxConcurrent: 4 }).pass).toBe(false)
  })

  // 这条是判据设计的关键后果，不能只靠推导：cap=1 的用例（rpm30-concurrency1）里
  // 豁免被上限夹住后**等价于仍要求相等**，否则"+1"就把真实的单并发违约吃掉了。
  it('配置上限为 1 时 +1 豁免必须失效（被上限夹住 ⇒ 等价严格相等）', () => {
    const r = concurrencyCheck({ simulated: 1, real: 2, maxConcurrent: 1 })
    expect(r.pass, 'maxConcurrent=1 时观测到 2 就是违约，必须红：' + JSON.stringify(r)).toBe(false)
    expect(concurrencyCheck({ simulated: 1, real: 1, maxConcurrent: 1 }).pass).toBe(true)
  })
})

/**
 * 饥饿阈值两档（spec 新增的两个 Scenario 的可执行证据）。
 *
 * 存在理由：上面的真值表只说明"判据允许 +1"，不说明"+1 确实来自回调推迟而不是我给
 * 判据开后门"。所以这里在同进程内造可控饥饿，按**相对倍数**取两档（绝对毫秒在不同机器上
 * 含义不同）：低档 ≤ 相邻起始间隔的 1/10 ⇒ 不该产生重叠；高档 ≥ 间隔的 1.2 倍 ⇒ 必然重叠，
 * 且仍受上限夹住。高档那一档同时充当"豁免分支是活代码"的证明 —— 一个从不被命中的豁免
 * 与一个不存在的豁免同样危险。
 */
describe('并发观测的饥饿阈值（证明 +1 来自回调推迟，不是给判据开后门）', () => {
  // inject-429 的形状：rpm=120 ⇒ 相邻起始间隔 500ms；单次调用 20ms；配置上限 2
  const P = { rpm: 120, maxConcurrent: 2, requestCount: 6, requestDurationMs: 20, inject429At: 3, cooldownMs: 300 }
  const GAP_MS = 60000 / P.rpm

  function withBlocker (blockMs, everyMs, fn) {
    let armed = true
    const h = setInterval(() => {
      if (!armed) return
      const t = Date.now()
      while (Date.now() - t < blockMs) { /* 同步占用当前 tick，模拟 CI 满载下的帧饥饿 */ }
    }, everyMs)
    return Promise.resolve()
      .then(fn)
      .finally(() => { armed = false; clearInterval(h) })
  }

  it('低档饥饿不产生重叠；高档饥饿必现 +1 且始终不越上限', async () => {
    const sim = pythonMetrics(P).max_concurrent_observed
    const cap = effectiveMaxConcurrent(P)

    const low = await withBlocker(Math.floor(GAP_MS / 12), 250, () => runSelfCheck(P))
    const high = await withBlocker(Math.ceil(GAP_MS * 1.2), 300, () => runSelfCheck(P))

    // 每次跑都打印两档实测值与档别，让"这条锁在测什么"事后可判读（否则下次没人知道）
    console.log('[parity-noise] gap=' + GAP_MS + 'ms sim=' + sim + ' cap=' + cap
      + ' low(' + Math.floor(GAP_MS / 12) + 'ms)=' + low.metrics.max_concurrent_observed
      + ' high(' + Math.ceil(GAP_MS * 1.2) + 'ms)=' + high.metrics.max_concurrent_observed)

    // 低档：只要求"不越上限、不比模型多超过 1"。故意**不**断言它必须等于 sim ——
    // CI 自己就可能饿到 500ms（#2606 就是这么红的），把那条写进来等于新造一个假红源。
    const lowVerdict = concurrencyCheck({ simulated: sim, real: low.metrics.max_concurrent_observed, maxConcurrent: cap })
    expect(lowVerdict.pass, '低档实测越界：' + JSON.stringify(lowVerdict)).toBe(true)

    // 高档：饥饿由本用例工程化，结果必须**恰好**是 sim + 1 ⇒ 证明豁免分支真的会被走到
    expect(high.metrics.max_concurrent_observed, '高档饥饿未复现 +1（机制变了，判据依据要重新取证）')
      .toBe(sim + 1)
    const highVerdict = concurrencyCheck({ simulated: sim, real: high.metrics.max_concurrent_observed, maxConcurrent: cap })
    expect(highVerdict.pass).toBe(true)
    expect(highVerdict.noiseBypass, '高档必须命中豁免，否则说明这条豁免是死分支').toBe(true)
    // 越上限的不变量在两个档都不能破（不断言总耗时：慢机器上挂钟会漂，那属于 duration 判据的辖区）
    expect(low.metrics.max_concurrent_observed).toBeLessThanOrEqual(cap)
    expect(high.metrics.max_concurrent_observed).toBeLessThanOrEqual(cap)
  }, 120000)
})
