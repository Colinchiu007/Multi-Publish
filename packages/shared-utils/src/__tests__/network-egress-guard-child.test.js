/**
 * network-egress-guard-child.test.js — 测试期「禁止真实出站」守卫的**子进程面**
 *
 * 为什么要这一层（#2783 的另一半，两轮外部评审判 Critical）：守卫原先只 patch
 * `net.Socket.prototype.connect`，那只对**装它的那个 realm** 生效。而测试会用
 * `spawnSync` / `execFileSync` / `fork` 起**另一个 node 进程**做事 —— 那个 realm 里没有守卫，
 * 于是"测试期零真实出站"对这条路径结构性无效。#2783 的事故正是这个形状：
 * `require('electron')` 在测试 realm 里 `spawnSync(process.execPath, [install.js])`，
 * 子进程真去下载了 4 秒，耗时与 stdout 被 vitest 记到"当时正在跑的那条用例"头上。
 *
 * 五条被实测钉住的口径：
 *  1) 注入是否生效**一律由子进程自己报告**（打印 `process.execArgv`），不用 mock 断言"我调过 spawn" ——
 *     Node 的 `execFileSync` 走的是内部绑定，patch 公开导出的 `spawnSync` 对它**无效**，
 *     靠 mock 会得到一条恒绿的假锁（本仓把它记作"装饰性门禁"）。
 *  2) 只对 node 系子进程注入；非 node（git / python / electron）不改 argv，只进台账并出声。
 *  3) 幂等：调用方自己已带同一 `--require` 时不得重复注入。
 *  4) `fork` 走 `options.execArgv`，不得塞进 argv（那是脚本参数位）。
 *  5) 目标地址用 RFC 5737 的 TEST-NET-2（198.51.100.7）：不可路由、不需要 DNS；
 *     守卫生效时根本不发 SYN（拦在 connect 入口），所以"秒失败"本身就是判据之一。
 */
import { describe, expect, it, beforeAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const GUARD_MODULE = path.join(here, '..', 'network-egress-guard.js')
const SETUP_MODULE = path.join(here, '..', '..', 'network-egress-guard.setup.js')
const TEST_NET_IP = '198.51.100.7'

let guard
let cp

beforeAll(() => {
  guard = require(GUARD_MODULE)
  cp = require('child_process')
})

const EXEC_ARGV_PROBE = 'console.log(JSON.stringify(process.execArgv))'

function childExecArgvOf (argv) {
  const out = cp.spawnSync(process.execPath, argv, { encoding: 'utf8', timeout: 10000 })
  expect(out.status, String(out.stderr || '')).toBe(0)
  return JSON.parse(String(out.stdout).trim().split('\n').pop())
}

/** 在子进程里真的连一次 TEST-NET-2，看它是不是被自己 realm 里的守卫拦在 connect 入口 */
const BLOCK_PROBE = [
  'const net = require("net")',
  'const s = new net.Socket()',
  's.on("error", (e) => { console.log(JSON.stringify({ blocked: e && e.code === "ERR_TEST_NETWORK_BLOCKED", code: e && e.code })); process.exit(0) })',
  'try { s.connect(443, "' + TEST_NET_IP + '") } catch (e) {',
  '  console.log(JSON.stringify({ blocked: e && e.code === "ERR_TEST_NETWORK_BLOCKED", code: e && e.code }))',
  '  process.exit(0)',
  '}',
].join('\n')

describe('子进程面：守卫必须传给 node 子进程', () => {
  it('对照组：走未包装的原始 spawnSync 时，子进程里 socket 面根本不存在（证明是这一层在起作用）', () => {
    // 装上之后 cp.spawnSync 本身已会注入 --require ⇒ 对照组必须显式走原始函数，
    // 否则"对照组"测的是包装层的效果而不是"没有守卫时是什么样"。
    const raw = cp.spawnSync.__mpOriginalSpawn || cp.spawnSync
    const out = raw.call(cp, process.execPath, ['-e',
      'const net=require("net");console.log(JSON.stringify(!!net.Socket.prototype.connect.__mpTestNetworkGuardApplied))'],
    { encoding: 'utf8', timeout: 10000 })
    expect(JSON.parse(String(out.stdout).trim())).toBe(false)
  })

  it('installTestChildProcessGuard 存在且幂等（重复安装不得产生双层包装）', () => {
    expect(typeof guard.installTestChildProcessGuard).toBe('function')
    // 本测试面可能已由 vitest setupFiles 先装过一次 ⇒ 锁"承重性质"而不是首次返回值
    const before = cp.spawnSync
    expect(before.__mpChildEgressGuarded).toBe(true)
    expect(guard.installTestChildProcessGuard({ setupPath: SETUP_MODULE }).alreadyApplied).toBe(true)
    expect(cp.spawnSync).toBe(before)
    expect(typeof before.__mpOriginalSpawn).toBe('function')
    expect(before.__mpOriginalSpawn.__mpChildEgressGuarded).toBeUndefined()
  })

  it('装上后 spawnSync 起的 node 子进程必须自己看到注入的 --require（子进程自报，不是 mock）', () => {
    guard.installTestChildProcessGuard({ setupPath: SETUP_MODULE })
    const argv = childExecArgvOf(['-e', EXEC_ARGV_PROBE])
    expect(argv).toContain('--require')
    expect(argv).toContain(SETUP_MODULE)
  })

  it('execFileSync 同样必须被覆盖（Node 内部绑定绕过 spawnSync，只 patch spawnSync 会恒绿）', () => {
    guard.installTestChildProcessGuard({ setupPath: SETUP_MODULE })
    const out = cp.execFileSync(process.execPath, ['-e', EXEC_ARGV_PROBE], { encoding: 'utf8', timeout: 10000 })
    const argv = JSON.parse(String(out).trim().split('\n').pop())
    expect(argv).toContain(SETUP_MODULE)
  })

  it('注入的守卫在子进程里真的拦下 connect，且是秒失败（拦在入口 ⇒ 无 DNS 无 SYN）', () => {
    guard.installTestChildProcessGuard({ setupPath: SETUP_MODULE })
    const t0 = Date.now()
    const out = cp.spawnSync(process.execPath, ['-e', BLOCK_PROBE], { encoding: 'utf8', timeout: 10000 })
    const json = JSON.parse(String(out.stdout).trim().split('\n').pop())
    expect(json.blocked).toBe(true)
    expect(json.code).toBe('ERR_TEST_NETWORK_BLOCKED')
    expect(Date.now() - t0).toBeLessThan(6000)
  })

  it('幂等：调用方自带同一 --require 时，子进程只看到一个（不得重复注入）', () => {
    guard.installTestChildProcessGuard({ setupPath: SETUP_MODULE })
    const argv = childExecArgvOf(['--require', SETUP_MODULE, '-e', EXEC_ARGV_PROBE])
    expect(argv.filter((a) => a === '--require').length).toBe(1)
  })

  it('非 node 子进程：argv 一字不改，但必须进台账（不冒充"守住了"）', () => {
    guard.installTestChildProcessGuard({ setupPath: SETUP_MODULE })
    const out = cp.spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 10000 })
    expect(String(out.stdout)).toMatch(/^git version /)
    const externals = guard.readExternalChildLedger()
    expect(Array.isArray(externals)).toBe(true)
    expect(externals.some((e) => /git(\.exe)?$/i.test(String(e.command)))).toBe(true)
  })

  it('fork 走 options.execArgv，不进 argv 位置（由子进程自己写盘报告，不用 mock）', async () => {
    guard.installTestChildProcessGuard({ setupPath: SETUP_MODULE })
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egress-child-fork-'))
    const outFile = path.join(dir, 'report.json')
    const child = path.join(dir, 'child.js')
    fs.writeFileSync(child, [
      'const fs = require("fs")',
      'fs.writeFileSync(process.argv[2], JSON.stringify({ execArgv: process.execArgv, rest: process.argv.slice(2) }))',
    ].join('\n'))
    const proc = cp.fork(child, [outFile], { silent: true })
    const t0 = Date.now()
    while (!fs.existsSync(outFile) && Date.now() - t0 < 8000) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    try { proc.kill() } catch { /* 已退出 */ }
    expect(fs.existsSync(outFile), 'fork 出的子进程没有写出报告：注入或 fork 本身失败').toBe(true)
    const json = JSON.parse(fs.readFileSync(outFile, 'utf8'))
    expect(json.execArgv).toContain('--require')
    expect(json.execArgv).toContain(SETUP_MODULE)
    // 脚本参数位必须原样：把 --require 塞进 argv 会让子进程把路径当参数，argv 就被污染
    expect(json.rest).toEqual([outFile])
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('守卫内部异常不得吃掉真实 spawn（fail-open 但必须响亮）', () => {
    guard.installTestChildProcessGuard({ setupPath: SETUP_MODULE })
    const out = cp.spawnSync(process.execPath, ['--version'], { encoding: 'utf8', timeout: 10000 })
    expect(String(out.stdout).trim()).toMatch(/^v\d+\./)
  })
})

describe('装配面唯一：setup 必须同时装 socket 与子进程两个平面', () => {
  it('network-egress-guard.setup.js 两个 installer 都要调用', () => {
    const src = fs.readFileSync(SETUP_MODULE, 'utf8')
    expect(src).toMatch(/installTestNetworkGuard\(\)/)
    expect(src).toMatch(/installTestChildProcessGuard/)
  })
})
