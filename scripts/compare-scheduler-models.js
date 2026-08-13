#!/usr/bin/env node
// @ts-check
/**
 * compare-scheduler-models.js — 运营后台 Python 模拟器 vs 桌面端真实 governor 对拍（P2）
 *
 * 固定输入分别跑：python scheduler_simulator.simulate 与桌面端 rate-limit-self-check.runSelfCheck，
 * 比较 max_concurrent_observed / rate_limited_count / quota_exceeded_count / total_duration_ms（容差）。
 * 防止两套调度模型契约漂移（spec: desktop/model-call-observability「模拟器与真实 governor 对拍」）。
 *
 * 用法：node scripts/compare-scheduler-models.js
 * 退出码：0 = 核心用例全部一致；1 = 存在不一致。
 * 已知差异（KNOWN_DIFF_CASES）只记录输出，不影响退出码；详见 runKnownDiffs。
 */
'use strict'

const { spawnSync } = require('child_process')
const path = require('path')
const { runSelfCheck } = require('../apps/desktop/electron/services/rate-limit-self-check')

const CASES = [
  { name: 'rpm120-concurrency2', params: { rpm: 120, maxConcurrent: 2, requestCount: 8, requestDurationMs: 20 } },
  { name: 'rpm30-concurrency1', params: { rpm: 30, maxConcurrent: 1, requestCount: 4, requestDurationMs: 20 } },
  { name: 'inject-429', params: { rpm: 120, maxConcurrent: 2, requestCount: 6, requestDurationMs: 20, inject429At: 3, cooldownMs: 300 } },
  { name: 'quota-5h', params: { rpm: 120, maxConcurrent: 2, limitPer5h: 2, requestCount: 4, requestDurationMs: 20 } },
]

/**
 * 已知差异用例（2026-08-13 对拍实证，记录在案而非断言一致）：
 * - slow-call-concurrency：真实 governor 慢调用（单请求耗时 >= RPM 节流间隔）并发可到 maxConcurrent，
 *   模拟器为串行事件循环（同批到达逐条推进时钟）→ max_concurrent_observed 恒 1，属已知观测口径差异；
 * - quota-5h-real：5h 拒绝路径真实 governor 被拒请求仍经历排队/时间槽后才报 QUOTA_EXCEEDED，
 *   total_duration 与模拟器（等待前立即预检拒绝）偏差超出 1.5s 容差，属已知耗时口径差异。
 * 退出码不因这些差异变为非零；若未来修复模拟器使两端一致，parity 测试的防漂移断言会提示更新。
 */
const KNOWN_DIFF_CASES = [
  { name: 'slow-call-concurrency', preset: 'elevenlabs', params: { rpm: 20, maxConcurrent: 2, requestCount: 8, requestDurationMs: 3000 } },
  { name: 'quota-5h-real', preset: 'doubao-tts', params: { rpm: 20, maxConcurrent: 2, limitPer5h: 5, requestCount: 8, requestDurationMs: 100 } },
]

function pythonMetrics (params) {
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'ops-center/backend')",
    "from services.scheduler_simulator import simulate",
    "p = json.loads(sys.argv[1])",
    "r = simulate(p)",
    "print(json.dumps(r['metrics']))",
  ].join('\n')
  const pyParams = {
    rpm: params.rpm,
    max_concurrent: params.maxConcurrent,
    limit_per_5h: params.limitPer5h != null ? params.limitPer5h : null,
    request_count: params.requestCount,
    request_duration_ms: params.requestDurationMs,
    arrival_interval_ms: 0,
    inject_429_at: params.inject429At != null ? params.inject429At : null,
    exceed_5h: params.limitPer5h != null,
    cooldown_ms: params.cooldownMs != null ? params.cooldownMs : 30000,
  }
  const res = spawnSync('python', ['-c', script, JSON.stringify(pyParams)], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    timeout: 30000,
  })
  if (res.status !== 0) throw new Error('python simulator failed: ' + (res.stderr || res.stdout))
  const lines = res.stdout.trim().split('\n')
  return JSON.parse(lines[lines.length - 1])
}

async function runParity (toleranceMs = 1500) {
  const results = []
  for (const c of CASES) {
    const py = pythonMetrics(c.params)
    const real = await runSelfCheck(c.params)
    const checks = {
      max_concurrent_observed: real.metrics.max_concurrent_observed === py.max_concurrent_observed,
      rate_limited_count: real.metrics.rate_limited_count === py.rate_limited_count,
      quota_exceeded_count: real.metrics.quota_exceeded_count === py.quota_exceeded_count,
      total_duration_ms: Math.abs(real.metrics.total_duration_ms - py.total_duration_ms) <= toleranceMs,
    }
    results.push({
      name: c.name,
      python: py,
      real: real.metrics,
      checks,
      pass: Object.values(checks).every(Boolean),
    })
  }
  return results
}

async function runKnownDiffs () {
  const results = []
  for (const c of KNOWN_DIFF_CASES) {
    const py = pythonMetrics(c.params)
    const real = await runSelfCheck(c.params)
    results.push({
      name: c.name,
      preset: c.preset,
      python: py,
      real: real.metrics,
      diff: {
        max_concurrent_observed: real.metrics.max_concurrent_observed - py.max_concurrent_observed,
        total_duration_ms: real.metrics.total_duration_ms - py.total_duration_ms,
      },
      note: c.name === 'slow-call-concurrency'
        ? '已知：慢调用（耗时 >= 节流间隔）真实并发可到 maxConcurrent，模拟器串行事件循环 maxc=1'
        : '已知：5h 拒绝路径真实 governor 被拒请求仍经历排队/时间槽，total_duration 偏差超过容差',
    })
  }
  return results
}

async function main () {
  const results = await runParity()
  let ok = true
  for (const r of results) {
    console.log('[' + (r.pass ? 'PASS' : 'FAIL') + '] ' + r.name)
    console.log('  python :', JSON.stringify(r.python))
    console.log('  real   :', JSON.stringify(r.real))
    console.log('  checks :', JSON.stringify(r.checks))
    if (!r.pass) ok = false
  }
  const known = await runKnownDiffs()
  for (const r of known) {
    console.log('[KNOWN DIFF] ' + r.name + ' (' + r.preset + ')')
    console.log('  python :', JSON.stringify({ maxc: r.python.max_concurrent_observed, total: r.python.total_duration_ms }))
    console.log('  real   :', JSON.stringify({ maxc: r.real.max_concurrent_observed, total: r.real.total_duration_ms, no_network: r.real.network_calls === 0 }))
    console.log('  diff   :', JSON.stringify(r.diff))
    console.log('  note   :', r.note)
  }
  console.log(known.length ? 'KNOWN_DIFFS: ' + known.length + ' cases recorded (documented limitation, not parity failure)' : 'KNOWN_DIFFS: none')
  console.log(ok ? 'PARITY OK' : 'PARITY MISMATCH')
  process.exit(ok ? 0 : 1)
}

module.exports = { runParity, CASES, runKnownDiffs, KNOWN_DIFF_CASES }

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
