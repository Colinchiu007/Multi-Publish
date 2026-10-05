'use strict'
/**
 * packages/shared-utils/src/network-egress-ledger.js — 测试期运行时出站台账的落盘 sink
 *
 * 为什么单独成文件：这些函数是 `network-egress-guard.js` 的**证据出口**（realm 内台账随进程消失，
 * 没有落盘就没有任何可比对的现场），而守卫本体已经顶到行数门禁（`check-max-lines` 的 limit=500）。
 * 正解是按门禁的意思拆分，不是去抬阈值或往挂账清单里塞一条。
 *
 * 三条口径随代码一起搬过来，改动时一条都别丢：
 *  1) **env 未设 ⇒ 零副作用**：`ledgerFile()` 返回 null 时所有函数都不碰文件系统、不改行为。
 *  2) **写失败必须出声但绝不冒泡**（守卫把自己的测试弄崩比漏记一条更糟，#2783 同族）；
 *     且 `ledgerAppend` 返回**三态** `skip|ok|fail` —— 把"没配路径"当成失败去回滚 realm 内台账，
 *     会改掉既有消费者 `readExternalChildLedger()` 的语义（本仓实测踩过，见守卫里的注释）。
 *  3) **判"写成功"要看文件真的变大**：若某个 setup 抢在守卫之前把 `fs.appendFileSync` 换成 no-op，
 *     try/catch 抓不到任何东西，棘轮就退化成恒绿。所以写完必须比尺寸。
 *     `fs` 用**模块加载期捕获的绑定**：测试面通过 `--require` / `setupFiles` 装守卫，早于测试文件体里
 *     的 `__registerMock('fs', …)`，晚一步的替换动不到这里持有的引用（#2794 的教训）。
 */
const fsReal = require('fs')

const LEDGER_ENV = 'MP_TEST_EGRESS_LEDGER'
const LEDGER_SUITE_ENV = 'MP_TEST_EGRESS_SUITE'
const LEDGER_INSTALL_KEY = '__mpEgressLedgerInstalled'
const LEDGER_WRITTEN_KEY = '__mpEgressLedgerWritten'
const LEDGER_FAIL_MARK = '[TEST-EGRESS-LEDGER-SINK-FAILED]'

function ledgerFile () {
  const p = process.env[LEDGER_ENV]
  return typeof p === 'string' && p.length > 0 ? p : null
}

/** 文件字节数；任何异常/非数字都返回 null（读不到，比如文件还不存在） */
function ledgerSize (file) {
  try {
    const st = fsReal.statSync(file)
    return st && typeof st.size === 'number' ? st.size : null
  } catch (_) {
    return null
  }
}

/**
 * @returns {'skip'|'ok'|'fail'} 见文件头第 2 条口径
 */
function ledgerAppend (record) {
  const file = ledgerFile()
  if (!file) return 'skip'
  const line = JSON.stringify(Object.assign(
    { suite: process.env[LEDGER_SUITE_ENV] || '(unset)', pid: process.pid },
    record
  )) + '\n'
  const sizeBefore = ledgerSize(file)
  try {
    fsReal.appendFileSync(file, line, 'utf8')
  } catch (e) {
    console.error(LEDGER_FAIL_MARK + ' 无法写台账 ' + file + '（type=' + (record && record.type) + '）：'
      + (e && e.message ? e.message : String(e)) + '；真实调用照常执行，但本轮该 realm 的运行时证据缺失')
    return 'fail'
  }
  const sizeAfter = ledgerSize(file)
  const min = sizeBefore === null ? 0 : sizeBefore
  if (sizeAfter === null) {
    console.error(LEDGER_FAIL_MARK + ' 写完后台账文件读不到尺寸（' + file + '，type=' + (record && record.type)
      + '）⇒ 写入不可证实，按失败处理（宁可漏一条证据登记，也不要一条恒绿的棘轮）')
    return 'fail'
  }
  if (sizeAfter <= min) {
    console.error(LEDGER_FAIL_MARK + ' 台账写入后尺寸没变（' + file + '，' + min + '→' + sizeAfter
      + '，type=' + (record && record.type) + '）⇒ appendFileSync 疑似被替换成 no-op，本 realm 的运行时证据不可信')
    return 'fail'
  }
  return 'ok'
}

/**
 * 落盘一次，失败则允许后续同类事件重试。
 * realm 内"只出声一次"的去重（warnOnce / blocked.seen）不得兼作"只写一次"的去重 ——
 * 否则一次写失败会被自己的去重永久固化，台账少记且无声（QM-6 codex 路命中）。
 */
function ledgerWriteOnce (record, key) {
  const written = globalThis[LEDGER_WRITTEN_KEY] || (globalThis[LEDGER_WRITTEN_KEY] = new Set())
  if (written.has(key)) return
  if (ledgerAppend(record) !== 'fail') written.add(key)
}

/** install 记录按 (realm, 台账文件) 去重，且只在真的写成功之后才置位（理由见守卫里的注释） */
function recordInstallOnce () {
  const file = ledgerFile()
  if (!file) return
  if (globalThis[LEDGER_INSTALL_KEY] === file) return
  if (ledgerAppend({ type: 'install', node: process.version }) === 'ok') globalThis[LEDGER_INSTALL_KEY] = file
}

/**
 * 台账 env 必须跟着 node 子进程走下去：调用方**自带 env** 而里面没有台账路径时，
 * 子进程照样装守卫、照样拦网，但它的 blocked/child 记录写不进本次跑的台账 ⇒ "这次没出现过站"是假证据。
 * 只在"调用方确实给了 env 且缺这个键"时补 —— 没给 env 的调用天然继承 process.env，改它只有风险没有收益。
 */
function withLedgerEnv (options) {
  const file = ledgerFile()
  if (!file) return options
  if (!options || typeof options !== 'object') return options
  if (!Object.prototype.hasOwnProperty.call(options, 'env')) return options
  const env = options.env
  if (!env || typeof env !== 'object' || env[LEDGER_ENV]) return options
  return Object.assign({}, options, {
    env: Object.assign({}, env, {
      [LEDGER_ENV]: file,
      [LEDGER_SUITE_ENV]: process.env[LEDGER_SUITE_ENV] || '(unset)'
    })
  })
}

module.exports = {
  LEDGER_ENV,
  LEDGER_SUITE_ENV,
  LEDGER_FAIL_MARK,
  ledgerFile,
  ledgerAppend,
  ledgerWriteOnce,
  recordInstallOnce,
  withLedgerEnv
}
