#!/usr/bin/env node
// @ts-check
/**
 * compare-scheduler-models.js — 运营后台 Python 模拟器 vs 桌面端真实 governor 对拍（P2）
 *
 * 四组固定输入分别跑：python scheduler_simulator.simulate 与桌面端 rate-limit-self-check.runSelfCheck，
 * 比较 max_concurrent_observed / rate_limited_count / quota_exceeded_count / total_duration_ms（容差）。
 * 防止两套调度模型契约漂移（spec: desktop/model-call-observability「模拟器与真实 governor 对拍」）。
 *
 * 用法：node scripts/compare-scheduler-models.js
 * 退出码：0 = 全部一致；1 = 存在不一致
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

async function main () {
  const results = await runParity()
  let ok = true
  for (const r of results) {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`)
    console.log('  python :', JSON.stringify(r.python))
    console.log('  real   :', JSON.stringify(r.real))
    console.log('  checks :', JSON.stringify(r.checks))
    if (!r.pass) ok = false
  }
  console.log(ok ? 'PARITY OK' : 'PARITY MISMATCH')
  process.exit(ok ? 0 : 1)
}

module.exports = { runParity, CASES }

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
