'use strict'
/**
 * scripts/check-test-egress-ledger.js —— 测试期「运行时出站台账」基线棘轮（Gate 2c3）
 *
 * 一句话：测试跑起来时，凡起了**非 node 子进程**（守卫注不进去，那个子进程里的真实出站不受约束）
 * 或**真的试过出站被守卫拦下**，都会被记进一份 JSONL 台账。本脚本把本次跑出的键集合与
 * `scripts/test-egress-ledger-baseline.json` 比对，**出现基线里没有的键即红**。
 *
 * 为什么是运行时台账而不是静态 grep（#2491 档3 的改判依据，2026-10-04 实测）：
 * 静态判据的四类形状里，「真实出网且无注入面」命中 9 个文件，抽样 3/3 全是**断言里的 URL 字符串**
 * （NavBar / tab / url-collector）；「起子进程无 timeout」71 处多为 mock 与扫源码的结构锁。
 * 写出来的东西要么是恒真门禁，要么被误报淹没后一周内长满豁免清单 —— 那是装饰性门禁的第二种形态。
 * 运行时台账只登记**真的起过进程 / 真的连过网**的那些，噪声天然为 0。
 *
 * 三条判据的由来（逐条对应一个已复现的失效模式）：
 *  ① 「装配未经证实」必须红：env 名拼错、写入被包装层的 try/catch 吞掉时，读到空集合会被当成"零违规"。
 *     所以 sink 在**装上守卫的那一刻**必须写一条 `{type:'install'}`，本脚本据此判定这份台账是"测到了没东西"
 *     还是"根本没在测"。
 *  ② 坏行与未知 type 必须计数并判红，不得 `catch { continue }` —— 静默跳过会把自己变成假绿源。
 *  ③ 基线里有、本次没出现 = 只出声不判红。分片/子集跑无法证否"再也不出现"，判红只会逼人删掉整份基线。
 *
 * 用法：
 *   node scripts/check-test-egress-ledger.js --ledger <path>      # CI：只判定
 *   node scripts/check-test-egress-ledger.js --ledger <path> --write-baseline   # 本机：把现场并回基线（原因需人工补）
 */
const fs = require('node:fs')
const path = require('node:path')

const KNOWN_TYPES = new Set(['install', 'child', 'blocked'])
const BASELINE_FILE = path.join(__dirname, 'test-egress-ledger-baseline.json')

function keyOf (rec) {
  if (rec.type === 'child') return 'child::' + String(rec.command)
  if (rec.type === 'blocked') {
    const port = rec.port === undefined || rec.port === null ? '' : ':' + rec.port
    return 'blocked::' + String(rec.host) + port
  }
  return null
}

function evaluate ({ ledgerText, baseline }) {
  const lines = ledgerText === null || ledgerText === undefined
    ? null
    : String(ledgerText).split(/\r?\n/).filter((l) => l.trim() !== '')
  const fileMissing = lines === null
  const seen = new Set()
  let installSeen = false
  let malformed = 0
  let unknownTypes = 0
  const parsedList = lines === null ? [] : lines
  for (const line of parsedList) {
    let rec
    try {
      rec = JSON.parse(line)
    } catch (_) {
      malformed++
      continue
    }
    if (!rec || typeof rec !== 'object') { malformed++; continue }
    if (!KNOWN_TYPES.has(rec.type)) { unknownTypes++; continue }
    if (rec.type === 'install') { installSeen = true; continue }
    const key = keyOf(rec)
    if (key === null || key.endsWith('undefined') || key.endsWith('null')) { malformed++; continue }
    seen.add(key)
  }
  const baselineKeys = Object.keys(baseline || {})
  const newEntries = [...seen].filter((k) => !baselineKeys.includes(k)).sort()
  const staleKeys = baselineKeys.filter((k) => !seen.has(k)).sort()
  const sinkUnproven = fileMissing || !installSeen
  const ok = !sinkUnproven && malformed === 0 && unknownTypes === 0 && newEntries.length === 0
  return {
    ok,
    sinkUnproven,
    fileMissing,
    malformed,
    unknownTypes,
    newEntries,
    staleKeys,
    seenKeys: [...seen].sort(),
    render () {
      if (fileMissing) return 'FAIL: 台账文件不存在 —— sink 根本没产出（检查 MP_TEST_EGRESS_LEDGER 是否指向可写路径）'
      const head = '[egress-ledger] 台账行数=' + parsedList.length +
        '，观测键=' + seen.size + '，基线键=' + baselineKeys.length +
        '，坏行=' + malformed + '，未知类型=' + unknownTypes
      if (parsedList.length === 0) return 'FAIL: 台账文件存在但 0 行 —— sink 被装上了却没写出任何东西，'
        + '要么路径不可写、要么写入被包装层吞掉（这不是"没有子进程"的证据）'
      if (sinkUnproven) return head + '\nFAIL: 装配未经证实 —— 台账里没有任何 {type:"install"} 记录，'
        + '无法区分"这次跑确实没起非 node 子进程"与"台账写入没装上"。'
      const linesOut = [head]
      if (malformed > 0) linesOut.push('FAIL: 坏行 ' + malformed + ' 条 —— 台账形状被破坏，后续判定不可信')
      if (unknownTypes > 0) linesOut.push('FAIL: 未知记录类型 ' + unknownTypes + ' 条（只接受 install/child/blocked）')
      if (newEntries.length > 0) {
        linesOut.push('FAIL: 出现基线之外的运行时台账键（清单只能缩小，新增必须逐条写清"为什么这里会起非 node 子进程 / 会真的试出站"）：')
        for (const k of newEntries) linesOut.push('  + ' + k)
      }
      if (staleKeys.length > 0) {
        linesOut.push('提示（不判红）：基线里 ' + staleKeys.length + ' 条本次未出现，'
          + '可能是分片/子集跑的覆盖差异，也可能该路径已消失 —— 只有在全量跑里持续未出现才可删除：')
        for (const k of staleKeys) linesOut.push('  - ' + k)
      }
      if (ok) linesOut.push('PASS: 运行时出站台账与基线一致，没有新增的非 node 子进程或真实出站尝试')
      return linesOut.join('\n')
    }
  }
}

function loadBaseline (file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  return json.entries || {}
}

function main (argv) {
  const get = (name) => {
    const i = argv.indexOf('--' + name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  // 布尔旗标必须用 includes 判，不能借 get() 读"下一个参数"：
  // `--ledger X --write-baseline`（文档里的写法，旗标在最末尾）时 argv[i+1] 是 undefined，
  // 于是这个"重生成基线"的入口会**静默什么都不做** —— 外部评审（codex 路）实测指出，我复核成立。
  const has = (name) => argv.includes('--' + name)
  const ledgerPath = get('ledger') || process.env.MP_TEST_EGRESS_LEDGER
  if (!ledgerPath) {
    console.log('FAIL: 没给 --ledger，且 MP_TEST_EGRESS_LEDGER 未设置 —— 判定域为空，不得当作通过')
    return 1
  }
  const baselineFile = get('baseline') || BASELINE_FILE
  const ledgerText = fs.existsSync(ledgerPath) ? fs.readFileSync(ledgerPath, 'utf8') : null
  const baseline = loadBaseline(baselineFile)
  const r = evaluate({ ledgerText, baseline })
  console.log(r.render())
  if (has('write-baseline')) {
    // 只在显式带旗标时写盘，且**不看 r.ok**：有新键（ok=false）正是需要并键的那一次。
    // 原实现要求 r.ok 才写 ⇒ 这个入口永远无事可做（同一条评审命中的第二个缺陷，我复核成立）。
    const added = r.seenKeys.filter((k) => !(k in baseline))
    if (added.length === 0) {
      console.log('没有需要并入的新键（观测键都在基线里）')
      return 0
    }
    // 保留基线文件里除 entries 以外的字段（$comment / $measuredAt 是给人看的出处，写丢就没人知道这文件怎么来的）
    const whole = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
    whole.entries = Object.assign({}, baseline)
    for (const k of added) whole.entries[k] = '(待补原因)'
    fs.writeFileSync(baselineFile, JSON.stringify(whole, null, 2) + '\n', 'utf8')
    console.log('已并入 ' + added.length + ' 个新键（原因先写 "(待补原因)"）：' + added.join(', '))
    console.log('下一步必须逐条补原因 —— 同文件里"每条原因 ≥8 字符"的夹具锁会判红，直到补全')
    return 0
  }
  return r.ok ? 0 : 1
}

module.exports = { evaluate, keyOf, main }

if (require.main === module) process.exitCode = main(process.argv.slice(2))
