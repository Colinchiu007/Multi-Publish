// @ts-check
/**
 * test_scheduler_parity.js — 模拟器与真实 governor 对拍（spec: desktop/model-call-observability）
 * 运行脚本级对拍（Python 模拟器 + 桌面端真实自检），断言 6 组用例关键指标一致
 * （官方四组 + 5h 真实参数 + 慢调用并发推进；2026-08-13 模拟器并发推进升级后 quota-5h-real / concurrency-real 纳入 must-pass）；
 * 并断言「已知差异用例」（interval==duration 临界测量噪声）差异值存在（防漂移）。
 */
import { describe, it, expect } from 'vitest'

const { runParity, runKnownDiffs, concurrencyCheck, deferralEvidence, effectiveMaxConcurrent, pythonMetrics, CASES, KNOWN_DIFF_CASES } = require('../../../../scripts/compare-scheduler-models')
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
        // maxc 三元值 + 豁免是否命中也要进这条 CI 留痕：CLI 路径打印了、vitest 路径不打印，
        // 等于"CI 上静默命中豁免"没人看得见 —— 观察者必须报告自己看不见的那部分。
        + ' maxc=' + r.python.max_concurrent_observed + '→' + r.real.max_concurrent_observed
        + '/cap=' + r.maxConcurrent
        + ' 推迟证据=' + (r.deferralEvidence.observed ? '有' : '无') + '(' + r.deferralEvidence.maxSpanMs + 'ms)'
        + ' noiseBypass=' + r.noiseBypass
        + ' 完成顺序分歧=' + r.completionOrderDiverges
        + ' pass=' + r.pass)
      // 失败信息必须带上「实际生效容差」与「本次差值」：上一轮 main 红时只给了 python/real
      // 两个 JSON，看不出 1653ms 是超了 1500 还是超了比例，排障要回头翻脚本。
      expect(r.pass, r.name + ' ' + JSON.stringify(r.checks)
        + ' maxc判据=' + JSON.stringify(r.concurrency)
        + ' diffTotalDurationMs=' + r.diffTotalDurationMs
        + ' allowedTotalDurationMs=' + r.allowedTotalDurationMs
        + ' python=' + JSON.stringify(r.python) + ' real=' + JSON.stringify(r.real)).toBe(true)
    }

    // #2626 已修：模拟器不再把注入 429 的那条记成 completed。完成顺序自该单起**计入 pass**
    // （由上面 `expect(r.pass).toBe(true)` 真正承重），所以这里**不再**断言"分歧存在" ——
    // 那条过渡守卫的本职是"修复前别让分歧被静默吞掉"，修好后继续留着就是把已知缺陷钉成正确行为。
    const inj = results.find((r) => r.name === 'inject-429')
    expect(inj, 'inject-429 必须仍在 must-pass 的 CASES 里（上面已断言，这里兜第二层）').toBeTruthy()
    // 序列本身也要钉死：只断言"两侧相等"会放过"两侧同时错"的形状
    // （例如取数口径被改成恒定返回空序列，那两边当然相等）。
    expect(inj.completionOrder.simulated).toEqual([1, 2, 4, 5, 6])
    expect(inj.completionOrder.real).toEqual([1, 2, 4, 5, 6])
    expect(inj.completionOrderDiverges, '两侧完成顺序又分歧了 ⇒ 要么模拟器回归到记 completed，要么真实侧形状变了').toBe(false)
    expect(inj.checks.completion_order, 'completion_order 必须已在 runParity 的 checks 里（摘掉它 = 把硬判定降级回只打印）').toBe(true)
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

  // 返回 { result, maxLagMs }：maxLagMs 是**实测**到的本 tick 最大延迟（含我们自己注入的阻塞
  // 与宿主环境额外施加的饥饿）。低档要不要要求"必须等于模型值"，只能由这个实测值决定 ——
  // 用注入名义值当依据会在满载 CI 上造假红（环境自己就能饿到 500ms，#2606 正是这么红的）。
  function withBlocker (blockMs, everyMs, fn) {
    let armed = true
    let maxLagMs = 0
    let expectedAt = Date.now() + everyMs
    const h = setInterval(() => {
      const now = Date.now()
      const lag = now - expectedAt
      if (lag > maxLagMs) maxLagMs = lag
      expectedAt = now + everyMs
      if (!armed) return
      const t = now
      while (Date.now() - t < blockMs) { /* 同步占用当前 tick，模拟 CI 满载下的帧饥饿 */ }
    }, everyMs)
    return Promise.resolve()
      .then(fn)
      .then((result) => ({ result, maxLagMs }))
      .finally(() => { armed = false; clearInterval(h) })
  }

  it('低档饥饿不产生重叠；高档饥饿必现 +1 且始终不越上限', async () => {
    const sim = pythonMetrics(P).max_concurrent_observed
    const cap = effectiveMaxConcurrent(P)
    // 判定"是否真的没饿到阈值"的分界：起始间隔的一半。低于它不可能让一次 20ms 调用
    // 的完成回调推迟到下一次放行之后。
    const LAG_BOUND_MS = Math.floor(GAP_MS / 2)

    const lowRun = await withBlocker(Math.floor(GAP_MS / 12), 250, () => runSelfCheck(P))
    const highRun = await withBlocker(Math.ceil(GAP_MS * 1.2), 300, () => runSelfCheck(P))
    const low = lowRun.result
    const high = highRun.result

    // 每次跑都打印两档实测值 + 实测帧延迟，让"这条锁在测什么"事后可判读（否则下次没人知道）
    console.log('[parity-noise] gap=' + GAP_MS + 'ms bound=' + LAG_BOUND_MS
      + ' sim=' + sim + ' cap=' + cap
      + ' low(' + Math.floor(GAP_MS / 12) + 'ms,lag=' + lowRun.maxLagMs + 'ms)=' + low.metrics.max_concurrent_observed
      + ' high(' + Math.ceil(GAP_MS * 1.2) + 'ms,lag=' + highRun.maxLagMs + 'ms)=' + high.metrics.max_concurrent_observed)

    const evOpt = { requestDurationMs: P.requestDurationMs, interStartMs: GAP_MS }
    const lowEv = deferralEvidence(low.timeline, evOpt)
    const highEv = deferralEvidence(high.timeline, evOpt)
    console.log('[parity-noise] 推迟证据 bound=' + lowEv.boundMs
      + ' low=' + JSON.stringify({ o: lowEv.observed, maxSpan: lowEv.maxSpanMs })
      + ' high=' + JSON.stringify({ o: highEv.observed, maxSpan: highEv.maxSpanMs, d: highEv.detail }))

    const lowVerdict = concurrencyCheck({
      simulated: sim, real: low.metrics.max_concurrent_observed, maxConcurrent: cap, evidence: lowEv,
    })
    expect(lowVerdict.pass, '低档实测越界：' + JSON.stringify(lowVerdict)).toBe(true)
    // spec Scenario「饥饿不足阈值时不得掩盖真实差异」的可执行版本：**条件化于实测延迟**。
    // 真没饿到阈值 ⇒ 必须等于模型值（+1 不许被当成万能容差）；环境自己饿过了头 ⇒ 本轮
    // 不主张这条，并把原因打印出来 —— 这不是放弃断言，而是把断言的前提写进判据。
    if (lowRun.maxLagMs < LAG_BOUND_MS) {
      expect(low.metrics.max_concurrent_observed,
        '实测帧延迟 ' + lowRun.maxLagMs + 'ms < 阈值 ' + LAG_BOUND_MS + 'ms，此时不该出现重叠')
        .toBe(sim)
      expect(lowVerdict.noiseBypass, '未达阈值却命中豁免 ⇒ 阈值判断与实测矛盾，需重新取证').toBe(false)
      // 证据侧也要自洽：没有 +1 的时候不该凭空报出"回调被推迟"
      expect(lowEv.observed, '低档不该探到推迟证据：' + lowEv.detail).toBe(false)
    } else {
      console.log('[parity-noise] 低档本轮跳过「必须相等」：宿主自身帧延迟 ' + lowRun.maxLagMs + 'ms 已达阈值')
    }

    // 高档：饥饿由本用例工程化，结果必须**恰好**是 sim + 1 ⇒ 证明豁免分支真的会被走到
    //
    // 这条精确断言之所以安全，是因为本组 cap=2 而 sim=1 ⇒ real 只可能取 1 或 2，
    // 没有第三个值可漂。**复制到更高 cap 的用例时不要照抄**：cap=4 下同一批饥饿可能同时
    // 推迟两个回调（real 可为 2 或 3），精确值就会在 CI 上 flake —— 那种场合改用
    // concurrencyCheck 的 noiseBypass，而不是断言具体数值。
    expect(high.metrics.max_concurrent_observed, '高档饥饿未复现 +1（机制变了，判据依据要重新取证）')
      .toBe(sim + 1)
    // 因果证据必须同时到位：只有"+1"而没有"被拉长的窗口与其它调用重叠"，
    // 就分不清是回调推迟还是 governor 提前放行 —— 后者是真回归，不得豁免。
    expect(highEv.observed, '高档出现 +1 却探不到推迟证据 ⇒ 判据依据需重新取证：'
      + JSON.stringify(highEv)).toBe(true)
    const highVerdict = concurrencyCheck({
      simulated: sim, real: high.metrics.max_concurrent_observed, maxConcurrent: cap, evidence: highEv,
    })
    expect(highVerdict.pass).toBe(true)
    expect(highVerdict.noiseBypass, '高档必须命中豁免，否则说明这条豁免是死分支').toBe(true)
    // 反面对照：把证据摘掉，同一个 +1 必须判红 —— 证明豁免是靠证据挣来的，不是白给的。
    expect(concurrencyCheck({
      simulated: sim, real: high.metrics.max_concurrent_observed, maxConcurrent: cap,
      evidence: { observed: false, maxSpanMs: highEv.maxSpanMs, requestDurationMs: P.requestDurationMs, detail: '' },
    }).pass, '无证据的 +1 竟然通过了 ⇒ 因果门是空的').toBe(false)
    // 越上限的不变量在两个档都不能破（不断言总耗时：慢机器上挂钟会漂，那属于 duration 判据的辖区）
    expect(low.metrics.max_concurrent_observed).toBeLessThanOrEqual(cap)
    expect(high.metrics.max_concurrent_observed).toBeLessThanOrEqual(cap)
  }, 120000)
})
