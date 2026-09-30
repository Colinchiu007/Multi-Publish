// @ts-check
/**
 * packages/shared-utils/src/network-egress-guard.js — 测试层「禁止真实出站」的唯一实现
 *
 * 为什么要有这个共享模块：守卫原先只装在 `apps/desktop/test-setup.js` 的 vitest setup 里，
 * `packages/*`（252 个测试文件）与 `ops-center` 完全裸奔。本仓 **没有** `nock`/`msw`/`setupServer`
 * （实测全仓 0 命中），"测试不出网"没有任何传输层兜底，全靠逐文件手工注入桩 —— 漏一处就是一次真出站，
 * 而真出站挂起时先撞上框架 `testTimeout`，红里只剩 `Test timed out in 10000ms`，看不到主机也看不到出路。
 * 同一份判定被抄成第二份必然漂移（本仓已在登录态三态映射、Windows 文件锁夹具上各栽过一次），
 * 所以这里只放实现，各测试面只负责"装上它"。
 *
 * 三条硬约束（每条都对应一次已发生过的假绿，改动时一条都不能丢）：
 *  1) **Node 24 的 http/undici** 走 `net:Object.connect` 时会把 `[options, cb]` **作为单个数组参数**
 *     传进 `Socket.prototype.connect`（实测 arg0 = Array，keys=['0','1']）。不递归展平就把目标判成
 *     unknown 而静默放过 —— 第一版守卫正是这样漏掉的。
 *  2) **Node 22 的 `_http_client`** 会把 socket 早期错误改写成 `socket hang up`（CI 实测，本地 Node 24
 *     不改写），错误文案到不了调用方 ⇒ 可诊断性**不得**只挂在错误对象上，必须同时落账本 + console.warn，
 *     断言只依赖"秒失败 + 账本有记录"。
 *  3) `emit('error')` 之后的 `destroy()` **不得再带 error 参数**，否则二次触发无人监听的 'error'；
 *     而无监听者的调用方又必须走 `destroy(error)` 保持响亮 —— 只 `destroy()` 会让等 error 事件的调用方
 *     静默挂起，比崩掉更糟。
 *
 * 口径：放行 loopback（127/8、::1、localhost、`0.0.0.0`、`::`）与 unix / named pipe，其余在 **connect
 * 入口**拦截（因此 DNS 也不会发生，不会把 CI 拖进解析超时）。注意 `0.0.0.0` 只在 connect 语义下算本机；
 * "监听绑全网卡"是另一条判据，不得并进这里（否则要么漏拦 `listen(0)`，要么把全仓本地服务用例打红）。
 */
'use strict'

const net = require('net')

const NETWORK_GUARD_APPLIED = '__mpTestNetworkGuardApplied'
const GUARD_WARNED = '__mpGuardWarned'
const BLOCKED_EGRESS_KEY = '__mpBlockedEgress'
const BLOCK_MARK = '[TEST-NETWORK-BLOCKED]'
const BLOCKED_CODE = 'ERR_TEST_NETWORK_BLOCKED'

function isLoopbackHostForTest (rawHost) {
  const host = String(rawHost || '').trim().replace(/^\[(.*)\]$/, '$1').toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0' || host === '::') return true
  if (host.startsWith('127.')) return true
  if (host.startsWith('::ffff:127.')) return true
  return false
}

/**
 * 从 `Socket.prototype.connect` 的实参里解析目标。返回 `{kind:'path'}` 表示 unix / named pipe，
 * `{kind:'unknown'}` 表示读不出来（调用方必须放行**但出声**，见 installTestNetworkGuard）。
 */
function readConnectTarget (args) {
  const first = args[0]
  if (Array.isArray(first)) return readConnectTarget(first)
  if (first && typeof first === 'object') {
    if (typeof first.path === 'string' && first.path) return { kind: 'path' }
    return { kind: 'host', host: first.host || first.hostname, port: first.port }
  }
  if (typeof first === 'string') {
    if (first.includes('/') || first.includes('\\')) return { kind: 'path' }
    return { kind: 'host', host: first, port: typeof args[1] === 'number' ? args[1] : undefined }
  }
  if (typeof first === 'number') {
    return { kind: 'host', host: typeof args[1] === 'string' ? args[1] : undefined, port: first }
  }
  return { kind: 'unknown' }
}

/**
 * 装上守卫。幂等：标记打在**被打补丁的函数自身**上（不是模块级 flag），因此 vitest 多 worker /
 * 多 realm 各自加载一次也不会互相覆盖成双层守卫。
 * @returns {{alreadyApplied: boolean}}
 */
function installTestNetworkGuard () {
  if (net.Socket.prototype.connect[NETWORK_GUARD_APPLIED]) return { alreadyApplied: true }
  const originalConnect = net.Socket.prototype.connect
  const guardedConnect = function (...args) {
    const target = readConnectTarget(args)
    if (target.kind !== 'path' && !target.host) {
      // 读不出目标就放行是必要的（不能因守卫误伤正常用例），但必须出声：
      // 静默放过等于守卫被 Node 的一次版本升级悄悄摘掉，正是本仓吃过两次的"假绿"形状。
      if (!net.Socket.prototype.connect[GUARD_WARNED]) {
        net.Socket.prototype.connect[GUARD_WARNED] = true
        console.warn(BLOCK_MARK + ' 守卫警告：无法从 connect 参数中识别目标主机（kind='
          + target.kind + '），本次放行。Node 版本=' + process.version
          + '，arg0 类型=' + (args[0] && args[0].constructor && args[0].constructor.name))
      }
    }
    if (target.kind === 'host' && target.host && !isLoopbackHostForTest(target.host)) {
      const socket = this
      const portText = target.port === undefined ? '' : ':' + target.port
      const detail = BLOCK_MARK + ' 单元测试禁止真实出站连接：' + target.host + portText + '。'
        + '请注入传输层桩（global.fetch = vi.fn() / __registerMock("axios", 桩) / 构造注入 axios|fetchImpl），'
        + '或把被测服务起在 127.0.0.1 的临时端口（listen(0, "127.0.0.1")）后访问 loopback 地址。'
      const error = new Error(detail)
      error.code = BLOCKED_CODE
      error.host = target.host
      error.port = target.port

      const blocked = globalThis[BLOCKED_EGRESS_KEY]
        || (globalThis[BLOCKED_EGRESS_KEY] = { list: [], seen: new Set() })
      const key = target.host + portText
      blocked.list.push({ host: target.host, port: target.port, at: Date.now(), node: process.version })
      if (!blocked.seen.has(key)) {
        blocked.seen.add(key)
        console.warn(detail)
      }

      process.nextTick(() => {
        const hasListener = socket.listenerCount('error') > 0
        if (!socket.destroyed && hasListener) {
          try { socket.emit('error', error) } catch (_) { /* 已被上层消化 */ }
          socket.destroy()
        } else {
          socket.destroy(error)
        }
      })
      return socket
    }
    return originalConnect.apply(this, args)
  }
  guardedConnect[NETWORK_GUARD_APPLIED] = true
  net.Socket.prototype.connect = guardedConnect
  return { alreadyApplied: false }
}

module.exports = {
  isLoopbackHostForTest,
  readConnectTarget,
  installTestNetworkGuard,
  BLOCKED_EGRESS_KEY,
  BLOCKED_CODE,
  BLOCK_MARK,
}
