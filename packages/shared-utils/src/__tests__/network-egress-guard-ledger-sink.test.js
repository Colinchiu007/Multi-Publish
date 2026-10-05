/**
 * network-egress-guard-ledger-sink.test.js —— 运行时出站台账的**落盘 sink** 合同
 *
 * 为什么必须有：`scripts/check-test-egress-ledger.js` 那条"只可缩小"的基线棘轮，唯一证据来源就是这份 JSONL。
 * 台账原先只活在各自 realm 的 `globalThis` 里 ⇒ 一次跑结束随进程消失，基线根本无从比对（"跑一轮全量落成基线"
 * 这句话在没有 sink 时是不可执行的）。本文件锁五条，逐条对应一个已复现或可复现的失效模式：
 *  ① install 记录必须存在 —— 它是"台账没记录"与"根本没在记录"之间唯一的区分手段（缺了它，
 *     env 名拼错会把门禁读成"零违规"，本仓记作装饰性门禁）；
 *  ② 写失败必须出声但绝不冒泡 —— 守卫把自己的测试弄崩（#2783 同族）比漏记一次更糟；
 *  ③ 同一命令在一个 realm 只记一条 —— `warnOnce` 已压掉 stdout 噪声，台账不得反过来刷屏；
 *  ④ env 未设时必须零副作用（不建文件、不改行为），否则本机随手一跑就留无人清理的产物；
 *  ⑤ 被拦下的真实出站尝试（blocked）也必须进台账 —— 那正是"错误被上层 catch 吞掉"后唯一留痕的形态。
 *
 * 反证（必须实跑，写进执行记录）：把 `ledgerAppend` 改成 no-op ⇒ ①③⑤ 变红；摘掉 install 记录 ⇒ ① 变红；
 * 把写失败的 try/catch 去掉 ⇒ ② 从"出声"变成"当场崩掉被测调用"，那条用例红。
 */
import { describe, expect, it, beforeAll, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const GUARD_MODULE = path.join(here, '..', 'network-egress-guard.js')
const ENV_LEDGER = 'MP_TEST_EGRESS_LEDGER'
const ENV_SUITE = 'MP_TEST_EGRESS_SUITE'
// 与同目录 network-egress-guard-child.test.js 同一口径：探针预算必须显著小于 vitest testTimeout，
// 否则挂死时框架先杀，红里只剩 "Test timed out"，本文件要证的那条现场全丢。
const SINK_PROBE_TIMEOUT_MS = 6000

let guard
let cp
let net

beforeAll(() => {
  guard = require(GUARD_MODULE)
  cp = require('child_process')
  net = require('net')
})

function makeCtx () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-sink-' + process.pid + '-'))
  return { dir, file: path.join(dir, 'ledger.jsonl') }
}
function cleanup (ctx) {
  try { fs.rmSync(ctx.dir, { recursive: true, force: true }) } catch (_) { /* Windows 短暂占用：临时目录由系统回收 */ }
}
const savedEnv = { ledger: process.env[ENV_LEDGER], suite: process.env[ENV_SUITE] }
afterEach(() => {
  if (savedEnv.ledger === undefined) delete process.env[ENV_LEDGER]; else process.env[ENV_LEDGER] = savedEnv.ledger
  if (savedEnv.suite === undefined) delete process.env[ENV_SUITE]; else process.env[ENV_SUITE] = savedEnv.suite
})

const readLines = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => JSON.parse(l))

describe('运行时出站台账 sink', () => {
  it('①env 装上后 install 记录必须落盘且带 suite/pid —— "装配未经证实"判据的现场来源', () => {
    const ctx = makeCtx()
    try {
      process.env[ENV_LEDGER] = ctx.file
      process.env[ENV_SUITE] = 'unit-test-fixture'
      const out = guard.installTestChildProcessGuard({ setupPath: GUARD_MODULE })
      expect(typeof out.alreadyApplied).toBe('boolean')
      const installs = readLines(ctx.file).filter((r) => r.type === 'install')
      expect(installs.length).toBeGreaterThanOrEqual(1)
      expect(installs[0].suite).toBe('unit-test-fixture')
      expect(installs[0].pid).toBe(process.pid)
    } finally { cleanup(ctx) }
  })

  it('②写失败必须出声但不冒泡 —— 由子进程自己报告 stderr，不用 mock 断言 console 被调过', () => {
    // 为什么不用 vi.spyOn(console,'error')：守卫与用例可能不在同一个 console 上（vitest 按测试环境
    // 接管 console），"没抓到"既可能是实现没出声、也可能是探针没接对通道 —— 那是本仓记作"探针测的不是那个变量"的形状。
    // 子进程自己把 stderr 交回来，出声与不出声在断言里就是可区分的两件事。
    const ctx = makeCtx()
    try {
      const script = path.join(ctx.dir, 'sink-fail-probe.js')
      fs.writeFileSync(script, [
        'const guard = require(' + JSON.stringify(GUARD_MODULE) + ')',
        'const cp = require("child_process")',
        '// MP_TEST_EGRESS_LEDGER 由父进程指成一个**目录** ⇒ appendFileSync 必抛 EISDIR',
        'guard.installTestChildProcessGuard({ setupPath: __filename })',
        'const out = cp.spawnSync("git", ["--version"], { encoding: "utf8", timeout: 15000 })',
        'process.stdout.write(JSON.stringify({',
        '  gitOk: /^git version /.test(String(out.stdout)),',
        '  status: out.status,',
        '  ledger: guard.readExternalChildLedger().map((e) => e.command)',
        '}))'
      ].join('\n'), 'utf8')
      const child = cp.spawnSync(process.execPath, [script], {
        encoding: 'utf8',
        timeout: SINK_PROBE_TIMEOUT_MS,
        env: Object.assign({}, process.env, { MP_TEST_EGRESS_LEDGER: ctx.dir, MP_TEST_EGRESS_SUITE: 'child-probe' })
      })
      expect(child.status, '子进程探针自身退出码非 0：' + String(child.stderr).slice(0, 400)).toBe(0)
      expect(String(child.stderr)).toContain('[TEST-EGRESS-LEDGER-SINK-FAILED]')
      const report = JSON.parse(String(child.stdout).trim().split('\n').pop())
      // 出声之外，真实调用必须照常完成 —— 守卫把自己的测试弄崩比漏记一条更糟（#2783 同族）
      expect(report.gitOk).toBe(true)
      expect(report.ledger).toContain('git')
    } finally { cleanup(ctx) }
  })

  it('③同一非 node 命令在一个 realm 只记一条，第二个命令仍照记', () => {
    const ctx = makeCtx()
    try {
      process.env[ENV_LEDGER] = ctx.file
      process.env[ENV_SUITE] = 'unit-test-fixture'
      guard.installTestChildProcessGuard({ setupPath: GUARD_MODULE })
      cp.spawnSync('git', ['--version'], { timeout: SINK_PROBE_TIMEOUT_MS })
      cp.spawnSync('git', ['--version'], { timeout: SINK_PROBE_TIMEOUT_MS })
      const children = readLines(ctx.file).filter((r) => r.type === 'child')
      expect(children.length).toBe(1)
      expect(String(children[0].command)).toMatch(/^git(\.exe)?$/i)
      expect(children[0].suite).toBe('unit-test-fixture')
      cp.spawnSync('mp-sink-second-cmd', [], { timeout: SINK_PROBE_TIMEOUT_MS })
      const after = readLines(ctx.file).filter((r) => r.type === 'child')
      expect(after.length).toBe(2)
      expect(after[1].command).toBe('mp-sink-second-cmd')
    } finally { cleanup(ctx) }
  })

  it('④env 未设时零副作用：不得创建文件，也不得改变真实调用的失败语义', () => {
    const ctx = makeCtx()
    delete process.env[ENV_LEDGER]
    try {
      const out = cp.spawnSync('mp-sink-noop-cmd', [], { encoding: 'utf8', timeout: SINK_PROBE_TIMEOUT_MS })
      expect(out.error && out.error.code).toBe('ENOENT')
      expect(fs.existsSync(ctx.file)).toBe(false)
    } finally { cleanup(ctx) }
  })

  it('⑤被守卫拦下的真实出站必须进台账（含 host 与 port）', async () => {
    const ctx = makeCtx()
    try {
      process.env[ENV_LEDGER] = ctx.file
      process.env[ENV_SUITE] = 'unit-test-fixture'
      guard.installTestNetworkGuard()
      guard.installTestChildProcessGuard({ setupPath: GUARD_MODULE })
      const socket = net.connect(443, '198.51.100.7') // TEST-NET-1：不可路由，守卫按语义秒拦
      socket.on('error', () => { /* 按契约抛回，本用例只关心台账里有没有这一条 */ })
      const deadline = Date.now() + SINK_PROBE_TIMEOUT_MS
      let blocked = []
      for (;;) {
        blocked = fs.existsSync(ctx.file) ? readLines(ctx.file).filter((r) => r.type === 'blocked') : []
        if (blocked.length > 0) break
        if (Date.now() > deadline) {
          socket.destroy()
          throw new Error('台账里始终没有 blocked 记录 —— 出站拦截面没接上 sink（不是"没连网"）')
        }
        await new Promise((resolve) => setTimeout(resolve, 20)) // 必须让出宏任务：纯微任务自旋对 setTimeout 免疫
      }
      socket.destroy()
      expect(blocked.length).toBe(1)
      expect(blocked[0].host).toBe('198.51.100.7')
      expect(blocked[0].port).toBe(443)
    } finally { cleanup(ctx) }
  })

  it('预算不得倒挂：探针超时必须显著小于本包 vitest testTimeout，且 testTimeout 由配置现场读出', () => {
    const cfgText = fs.readFileSync(path.join(here, '..', '..', 'vitest.config.js'), 'utf8')
    const m = cfgText.match(/testTimeout:\s*(\d+)/)
    expect(m, 'vitest.config.js 里找不到 testTimeout ⇒ 本条锁的前提没了，须改锁不得改判据').toBeTruthy()
    const configured = Number(m[1])
    expect(SINK_PROBE_TIMEOUT_MS).toBeLessThan(configured)
    console.log('[egress-sink] 现场预算 probe=' + SINK_PROBE_TIMEOUT_MS + 'ms testTimeout=' + configured + 'ms')
  })

  it('⑥append 被换成 no-op 时必须判为写失败，且失败不得固化去重（恢复后同一事件要能补写）', () => {
    // QM-6（codex 路）命中的形态：守卫装载之前若有 setup 把 fs.appendFileSync 换成空函数，
    // try/catch 什么都抓不到 ⇒ 我们会把 no-op 当成功，整条棘轮退化成恒绿。
    // 现在判"写成功"要求文件真的变大；且失败不得置位去重标记，否则"这一次没写进去"会被永久固化。
    const ctx = makeCtx()
    const fsMod = require('fs')
    const originalAppend = fsMod.appendFileSync
    try {
      process.env[ENV_LEDGER] = ctx.file
      process.env[ENV_SUITE] = 'unit-test-fixture'
      fsMod.appendFileSync = () => { /* no-op：模拟被替换掉的写 */ }
      guard.installTestNetworkGuard()
      guard.installTestChildProcessGuard({ setupPath: GUARD_MODULE })
      expect(fs.existsSync(ctx.file), 'no-op 的 append 不该留下任何字节').toBe(false)
    } finally {
      fsMod.appendFileSync = originalAppend
    }
    // 写恢复了：install 必须这次真的落盘 —— 证明前一次的失败没有被 realm 级去重吞掉
    guard.installTestNetworkGuard()
    guard.installTestChildProcessGuard({ setupPath: GUARD_MODULE })
    expect(fs.existsSync(ctx.file)).toBe(true)
    const installs = readLines(ctx.file).filter((r) => r.type === 'install')
    expect(installs.length).toBe(1)
    expect(typeof fsMod.appendFileSync).toBe('function')

    // child 记录同理：no-op 期间起的命令要能在写恢复后由"下一次同样的事件"补进台账
    fsMod.appendFileSync = () => { /* no-op */ }
    cp.spawnSync('mp-sink-retry-cmd', [], { timeout: SINK_PROBE_TIMEOUT_MS })
    expect(guard.readExternalChildLedger().some((e) => e.command === 'mp-sink-retry-cmd'),
      'realm 内台账不得因写失败被撤掉（它是既有消费者 readExternalChildLedger 的判据）').toBe(true)
    expect(readLines(ctx.file).some((r) => r.type === 'child'), 'no-op 期间不该有任何 child 记录落盘').toBe(false)
    fsMod.appendFileSync = originalAppend
    cp.spawnSync('mp-sink-retry-cmd', [], { timeout: SINK_PROBE_TIMEOUT_MS })
    const children = readLines(ctx.file).filter((r) => r.type === 'child')
    expect(children.length, '写恢复后，同一命令的下一次 spawn 必须补写落盘').toBe(1)
    expect(children[0].command).toBe('mp-sink-retry-cmd')
    cleanup(ctx)
  })

  it('⑦node 子进程自带 env 缺台账键时，注入必须把键补下去（否则子进程拦了网但记录丢了）', () => {
    const ctx = makeCtx()
    try {
      process.env[ENV_LEDGER] = ctx.file
      process.env[ENV_SUITE] = 'unit-test-fixture'
      const args = [process.execPath, ['-e', '0'], { env: { PATH: process.env.PATH } }]
      expect(guard.applyChildGuard('spawn', args, GUARD_MODULE)).toBe('injected-argv')
      const injected = args[2]
      expect(injected.env[ENV_LEDGER], '子进程 env 必须带上台账路径，否则它的 blocked/child 记录写不进本次台账').toBe(ctx.file)
      expect(injected.env[ENV_SUITE]).toBe('unit-test-fixture')
      // 反向：调用方没给 env 时不得凭空造一个（那会改变 Node 的继承语义，属无收益的风险）
      const bare = [process.execPath, ['-e', '0']]
      expect(guard.applyChildGuard('spawn', bare, GUARD_MODULE)).toBe('injected-argv')
      expect(bare.length).toBe(2)
      // 反向：调用方已自带台账键时不得覆盖成父进程的值以外的东西
      const own = [process.execPath, ['-e', '0'], { env: { [ENV_LEDGER]: 'D:/keep/me.jsonl' } }]
      guard.applyChildGuard('spawn', own, GUARD_MODULE)
      expect(own[2].env[ENV_LEDGER]).toBe('D:/keep/me.jsonl')
    } finally { cleanup(ctx) }
  })

  it('⑧台账键未设时 withLedgerEnv 不得改动任何参数（零副作用原则要覆盖 env 面）', () => {
    delete process.env[ENV_LEDGER]
    const args = [process.execPath, ['-e', '0'], { env: { PATH: 'x' } }]
    const optsBefore = args[2]
    expect(guard.applyChildGuard('spawn', args, GUARD_MODULE)).toBe('injected-argv')
    expect(args[2], '没有台账路径时不得替换调用方的 options 对象').toBe(optsBefore)
    expect(args[2].env.PATH).toBe('x')
  })
})
