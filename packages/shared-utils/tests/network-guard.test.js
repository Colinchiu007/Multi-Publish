// @ts-check
/**
 * packages/shared-utils/tests/test-network-guard.test.js
 *
 * 测试层出站守卫的**唯一实现**自身的回归保护。
 *
 * 为什么从 apps/desktop/test-setup.js 里抽出来：那份守卫此前只装在 desktop 的 vitest setup 上，
 * `packages/*`（252 个测试文件）与 `ops-center` 完全裸奔 —— 而本仓没有任何传输层兜底
 * （`nock`/`msw`/`setupServer` 实测 0 命中），"测试不出网"全靠每个文件手工注入桩。
 * 抄第二份实现必然漂移（本仓已在登录态映射、文件锁夹具上各栽过一次），故收敛为一份 + 接线守卫。
 *
 * 三条跨运行时硬约束（都由 CI 实测得来，改动时一条都不能丢）：
 *  1) Node 24 的 undici 会把 `[options, cb]` **当单个数组参数**传进 `Socket.prototype.connect`，
 *     不递归展平就把目标判成 unknown 而静默放过；
 *  2) Node 22 的 `_http_client` 会把 socket 早期错误改写成 `socket hang up`，错误文案到不了调用方
 *     ⇒ 可诊断性不得依赖错误对象，必须另落账本 + console.warn；
 *  3) emit 'error' 之后 `destroy()` **不得再带 error 参数**，否则二次触发无人监听的 'error'。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import net from 'node:net'

const {
  isLoopbackHostForTest,
  readConnectTarget,
  installTestNetworkGuard,
  BLOCKED_EGRESS_KEY,
} = require('../src/network-egress-guard.js')

describe('isLoopbackHostForTest — 只放行本机语义，判据按整个 127/8', () => {
  it('127/8 全段、localhost、::1、IPv4-mapped、去方括号形态一律算 loopback', () => {
    for (const host of ['127.0.0.1', '127.5.5.5', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1']) {
      expect(isLoopbackHostForTest(host), host).toBe(true)
    }
  })

  it('非 loopback 与空值必须算"要拦"，大小写不敏感', () => {
    for (const host of ['example.com', '93.184.216.34', 'api.multi-publish.com', '', undefined, 'FE80::1']) {
      expect(isLoopbackHostForTest(host), String(host)).toBe(false)
    }
  })

  // 0.0.0.0 / :: 作为**连接目标**时落到 loopback；作为**监听地址**是"绑全网卡"，
  // 那是另一条判据（本守卫只作用于 connect 入口），不得混成一条，否则要么漏拦
  // `listen(0)`（supertest 内部就是这样），要么把 31 个本地服务用例打红。
  it('0.0.0.0 与 :: 在 connect 语义下放行（并留注释说明与 listen 语义不同）', () => {
    expect(isLoopbackHostForTest('0.0.0.0')).toBe(true)
    expect(isLoopbackHostForTest('::')).toBe(true)
  })
})

describe('readConnectTarget — 四种入参形态 + Node 24 数组参数', () => {
  it('connect(options) / connect(port, host) / connect(host, port) / connect(path) 都能读出目标', () => {
    expect(readConnectTarget([{ host: 'example.com', port: 80 }])).toEqual({ kind: 'host', host: 'example.com', port: 80 })
    expect(readConnectTarget([{ hostname: 'api.test', port: 443 }])).toEqual({ kind: 'host', host: 'api.test', port: 443 })
    expect(readConnectTarget([8080, 'example.org'])).toEqual({ kind: 'host', host: 'example.org', port: 8080 })
    expect(readConnectTarget(['example.net', 9000])).toEqual({ kind: 'host', host: 'example.net', port: 9000 })
    expect(readConnectTarget([{ path: '\\\\.\\pipe\\mp-x' }])).toEqual({ kind: 'path' })
    expect(readConnectTarget(['/tmp/mp.sock'])).toEqual({ kind: 'path' })
  })

  it('Node 24 undici 的 [[options, cb]] 必须递归展平（第一版就是在这里静默放过）', () => {
    const nested = [{ host: 'blocked.test', port: 8099 }, () => {}]
    expect(readConnectTarget([nested])).toEqual({ kind: 'host', host: 'blocked.test', port: 8099 })
  })

  it('读不出目标时返回 unknown，不得返回一个"看起来像 loopback"的对象', () => {
    expect(readConnectTarget([undefined]).kind).toBe('unknown')
    expect(readConnectTarget([]).kind).toBe('unknown')
  })
})

describe('installTestNetworkGuard — 拦截、记账、幂等与"守卫自己失聪必须出声"', () => {
  let warn
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installTestNetworkGuard()
  })
  afterEach(() => {
    warn.mockRestore()
    delete globalThis[BLOCKED_EGRESS_KEY]
  })

  it('非 loopback 连接被拒：立即失败、账本入账且带 node 版本（不依赖错误文案传递信息）', () => {
    const socket = new net.Socket()
    const seen = new Promise((resolve) => socket.once('error', resolve))
    net.Socket.prototype.connect.call(socket, { host: 'example.com', port: 8099 })
    return seen.then((error) => {
      expect(error.code).toBe('ERR_TEST_NETWORK_BLOCKED')
      expect(error.host).toBe('example.com')
      const ledger = globalThis[BLOCKED_EGRESS_KEY]
      const hit = ledger.list.find((e) => e.host === 'example.com' && e.port === 8099)
      expect(hit, '账本里没有本次出站：' + JSON.stringify(ledger.list)).toBeTruthy()
      expect(hit.node).toBe(process.version)
    })
  })

  it('loopback 与 unix / named pipe 一律放行（不得把 31 个本地服务用例打红）', () => {
    expect(readConnectTarget([{ host: '127.0.0.1', port: 0 }]).host).toBe('127.0.0.1')
    const server = net.createServer()
    const connect = (port) => new Promise((resolve, reject) => {
      const s = net.connect(port, '127.0.0.1')
      s.once('connect', () => { s.destroy(); resolve(true) })
      s.once('error', reject)
    })
    return new Promise((resolve) => server.listen(0, '127.0.0.1', async () => {
      const port = server.address().port
      try {
        expect(await connect(port)).toBe(true)
        expect(globalThis[BLOCKED_EGRESS_KEY]?.list.length || 0).toBe(0)
      } finally {
        server.close(resolve)
      }
    }))
  })

  it('目标读不出来时不得静默放过：必须出声一次且去重（守卫被 Node 升级摘掉就是这种形状）', () => {
    const socket = new net.Socket()
    let hostRejections = 0
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        net.Socket.prototype.connect.call(socket, undefined)
      } catch (_) {
        hostRejections += 1
      }
    }
    const shouts = warn.mock.calls.filter((args) => String(args[0]).includes('TEST-NETWORK-BLOCKED'))
    // 去重：同一进程内只喊一次（否则刷屏会让人把警告当噪声关掉）
    expect(shouts.length).toBe(1)
    // 守卫不得吞掉 Node 自身的参数校验 —— "放行"必须是原样交给宿主，而不是静默返回一个假 socket
    expect(hostRejections).toBe(2)
    socket.destroy()
  })

  it('重复安装不得叠加（多 realm / 多 setup 文件共存时仍只有一层守卫）', () => {
    const before = net.Socket.prototype.connect
    installTestNetworkGuard()
    installTestNetworkGuard()
    expect(net.Socket.prototype.connect).toBe(before)
  })
})
