'use strict'
/** 一次性重构脚本：把 ops-resilience-reporter.js 的纯函数块替换为对 protocol 模块的委托。 */
const fs = require('fs')
const path = require('path')

const f = path.join(__dirname, 'apps', 'desktop', 'electron', 'services', 'ops-resilience-reporter.js')
const lines = fs.readFileSync(f, 'utf8').split('\n')

const s = lines.findIndex((l, i) => /^\/\*\*/.test(l) && /ACK 频率控制/.test(lines[i + 1] || ''))
const e = lines.findIndex((l) => /^class OpsResilienceReporter/.test(l))
if (s < 0 || e < 0 || e <= s) {
  console.error('定位失败 s=' + s + ' e=' + e)
  process.exit(1)
}
console.log('替换区间: 行 ' + (s + 1) + ' .. ' + e + '（' + (e - s) + ' 行）')

const repl = [
  '// 载荷构造 / 校验 / 频率控制 / 身份与鉴权解析已下沉到 ops-resilience-protocol.js：',
  '// 本文件只管「什么时候发、发给谁、失败怎么办」。两者正交，混在一起会让两个轴各自变难测，',
  '// 且本文件已逼近 max-lines 门禁（CI 按 LF 计 500 行）。',
  "const { ACK_HEARTBEAT_INTERVAL_MS, decideAck, resolveClientIdentity, resolveResilienceAuth, summarizeAppliedBlocks, validateAckPayload, validateDegradationPayload, DEGRADATION_TIERS, ACK_TYPES, FAILURE_KINDS, CHANNELS } = require('./ops-resilience-protocol')",
  '',
  '',
]
fs.writeFileSync(f, [...lines.slice(0, s), ...repl, ...lines.slice(e)].join('\n'), 'utf8')
console.log('新 LF 行数:', (fs.readFileSync(f, 'utf8').match(/\n/g) || []).length)