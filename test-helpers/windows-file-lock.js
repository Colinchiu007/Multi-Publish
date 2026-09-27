// @ts-check
/**
 * test-helpers/windows-file-lock.js — 真实 Windows 独占文件锁夹具（跨包共用）
 *
 * 为什么要有这个共享模块：同一份实现此前被抄成三份
 * （apps/desktop/electron/services/credential-store.test.js、
 *  apps/desktop/electron/services/account-state-restorer.test.js、
 *  packages/api-publish-engine/test/api-key-manager-atomic-write.test.js），
 * 三份共用同一个缺陷，却各自被「修」过一次 —— 把用例超时 10s → 30s → 60s
 * （71e76a5e、1e22e68f）。缺陷是**无界的握手等待**，抬高超时只决定它多久之后才失败。
 *
 * 缺陷本体：`chunk.toString().includes('LOCKED')` 只看**单个 data 事件**。Node 的 stream
 * data 事件不代表对端 write 边界（子进程一次 WriteLine 完全可能被拆成 'LOC' + 'KED'），
 * 一旦跨块就永远匹配不到，握手 promise 永不 settle。
 *
 * 两条不变量：
 * 1) 握手按**累计缓冲**判定，跨块匹配免疫；
 * 2) 每一段等待都带**显式预算**，超时错误里必须含**相位名**、预算与子进程 stderr。
 *
 * 第三条不变量（2026-09-27 补，起因是 main 上 `stdout=""` 那次红）：
 * **子进程自报 LOCKED 不等于它真的持锁**。实测复现到一条真实失效路径：去掉
 * `& { param(...) }` 块后命令行尾参不再绑定，`$file` 为空 ⇒ `[IO.File]::Open` 抛异常，
 * 但 PowerShell 默认 `ErrorActionPreference=Continue` 会**继续往下执行并照样打印 LOCKED**。
 * 那种形态下夹具是 no-op，消费用例却会对着"没有锁"的文件断言重试逻辑并假绿。
 * 因此 helper 在收到 LOCKED 后必须**从父进程侧反向验证**独占确实生效（写打开必须失败）。
 *
 * 第四条：**预算不得倒挂**。相位预算之和必须小于用例自身声明的超时，否则永远是框架先赢、
 * 诊断信息被吃掉（AGENTS.md QM-3 第 ③ 条）。统一由 `LOCK_CASE_TIMEOUT_MS` 单点持有，
 * 消费方 `it(..., { timeout: LOCK_CASE_TIMEOUT_MS }, ...)` 引用它，禁止各写各的。
 *
 * 用 CJS 导出：消费方一半是 vitest（ESM，走 default import 后解构），
 * 一半是 node --test（packages/api-publish-engine，require），互操作只在这一份实现上收敛。
 */
'use strict'

const fs = require('node:fs')
const { spawn } = require('node:child_process')

const LOCK_MARKER = 'LOCKED'
/** 子进程在 `[IO.File]::Open` **之前**吐这个标记：用于把"PS 没起来"与"起来后 open 卡住"分开 */
const READY_MARKER = 'READY'

// 启动相位：PowerShell 冷启动是被测语义之外的环境开销，且其长尾已被实测证实——
// 本机 16 核 + 16 忙循环下首个 stdout 字节从 0.3s 涨到 3.6~8.4s；main 上出现过
// 「20s 内零 stdout 且子进程未退出」，即 20s 预算在 CI 满载下会被冷启动独吞。
// 因此给它独立且宽裕的预算，但**必须**小于用例总超时（见 LOCK_CASE_TIMEOUT_MS）。
const DEFAULT_READY_TIMEOUT_MS = Number(process.env.MP_WINDOWS_LOCK_READY_TIMEOUT_MS) || 45000
// 持锁相位：PowerShell 已存活，这一步实测稳定在亚秒级，收紧才能暴露真正的锁问题。
const DEFAULT_LOCKED_TIMEOUT_MS = Number(process.env.MP_WINDOWS_LOCK_OPEN_TIMEOUT_MS) || 12000
const DEFAULT_RELEASE_TIMEOUT_MS = Number(process.env.MP_WINDOWS_LOCK_RELEASE_TIMEOUT_MS) || 20000
// 留给被测生产逻辑（读密钥 → 重试 → 写回 → 校验）的余量。
const PRODUCTION_HEADROOM_MS = 15000
const LOCK_CASE_TIMEOUT_MS =
  DEFAULT_READY_TIMEOUT_MS + DEFAULT_LOCKED_TIMEOUT_MS + DEFAULT_RELEASE_TIMEOUT_MS + PRODUCTION_HEADROOM_MS

/**
 * 累计式标记匹配器（纯对象，便于单测跨块行为）。
 * @param {string} [marker]
 * @returns {{feed: (chunk: any) => boolean, isLocked: () => boolean, text: () => string}}
 */
function createLockHandshake (marker = LOCK_MARKER) {
  let buf = ''
  let locked = false
  return {
    feed (chunk) {
      buf += typeof chunk === 'string' ? chunk : String(chunk)
      if (!locked && buf.includes(marker)) locked = true
      return locked
    },
    isLocked () {
      return locked
    },
    text () {
      return buf
    },
  }
}

function buildLockScript () {
  return [
    '& {',
    'param($file, $holdMs)',
    '[Console]::Out.WriteLine("' + READY_MARKER + '")',
    '[Console]::Out.Flush()',
    '$handle = $null',
    '$handle = [IO.File]::Open($file, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)',
    'try {',
    '[Console]::Out.WriteLine("' + LOCK_MARKER + '")',
    '[Console]::Out.Flush()',
    '[Threading.Thread]::Sleep([int]$holdMs)',
    '} finally { if ($handle) { $handle.Dispose() } }',
    '}',
  ].join('\n')
}

/**
 * 从父进程侧反向验证「filePath 此刻确实被别的进程独占」。
 * 子进程以 `[IO.FileShare]::Read` 打开 ⇒ 其它进程**仍可读、但不可写**；
 * 所以一次请求写权限的 open 必须失败（Windows 上是 EPERM / EBUSY）。
 * @param {string} filePath
 * @returns {boolean} true = 确实被挡住（锁是真的）；false = 写得进去（夹具是 no-op）
 */
function exclusiveLockIsEffective (filePath) {
  let handle = null
  try {
    handle = fs.openSync(filePath, 'r+')
    return false
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EBUSY') return true
    // ENOENT / EINVAL 等：文件不在或参数错，不能当成"已持锁"，原样抛出
    throw error
  } finally {
    if (handle !== null) {
      try { fs.closeSync(handle) } catch (_) { /* 已关闭 */ }
    }
  }
}


function withBudget (promise, timeoutMs, makeMessage) {
  let timer
  const budget = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(makeMessage(timeoutMs))), timeoutMs)
    if (timer && typeof timer.unref === 'function') timer.unref()
  })
  return Promise.race([promise, budget]).finally(() => clearTimeout(timer))
}

/**
 * 在 filePath 上持有一个真实的 Windows 独占句柄 holdMs 毫秒。
 * @param {string} filePath
 * @param {number} holdMs
 * @param {{readyTimeoutMs?: number, lockedTimeoutMs?: number, releaseTimeoutMs?: number,
 *          spawnImpl?: Function, verifyLockHeld?: boolean}} [options]
 * @returns {Promise<{exitPromise: Promise<void>, release: () => Promise<void>}>}
 */
async function holdExclusiveWindowsFileLock (filePath, holdMs, options = {}) {
  const spawnImpl = options.spawnImpl || spawn
  const readyTimeoutMs = options.readyTimeoutMs || DEFAULT_READY_TIMEOUT_MS
  const lockedTimeoutMs = options.lockedTimeoutMs || DEFAULT_LOCKED_TIMEOUT_MS
  const releaseTimeoutMs = options.releaseTimeoutMs || DEFAULT_RELEASE_TIMEOUT_MS
  // 关掉它就等于回到"相信子进程自报"的旧缺陷；仅握手相位的单测允许（那时尚无真实文件）
  const verifyLockHeld = options.verifyLockHeld !== false

  const child = spawnImpl('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    buildLockScript(),
    filePath,
    String(holdMs),
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })

  let stderr = ''
  const ready = createLockHandshake(READY_MARKER)
  const locked = createLockHandshake(LOCK_MARKER)
  const startedAt = Date.now()
  let readyAt = null
  let lockedAt = null

  const settle = {}
  const signal = {}
  for (const name of ['ready', 'locked']) {
    let outer
    signal[name] = new Promise((resolve, reject) => { outer = { resolve, reject } })
    settle[name] = outer
  }
  signal.ready.catch(() => {})
  signal.locked.catch(() => {})

  let settleExit
  const exitPromise = new Promise((resolve, reject) => {
    settleExit = { resolve, reject }
  })
  // 子进程可能在任何人在 await 之前就非零退出（例如握手超时后我们已抛错返回）。
  // 先挂一个消费方避免 unhandledRejection；返回的仍是同一个 promise，真正 await 它的
  // 用例照样能拿到 rejection。
  exitPromise.catch(() => {})

  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  child.stdout.on('data', (chunk) => {
    ready.feed(chunk)
    if (ready.isLocked() && readyAt === null) {
      readyAt = Date.now() - startedAt
      settle.ready.resolve()
    }
    locked.feed(chunk)
    if (locked.isLocked() && lockedAt === null) {
      lockedAt = Date.now() - startedAt
      settle.locked.resolve()
    }
  })
  child.once('error', (error) => {
    const message = 'PowerShell failed to start: ' + (error && error.message)
    settle.ready.reject(new Error(message))
    settle.locked.reject(new Error(message))
    settleExit.reject(error)
  })
  child.once('exit', (code) => {
    if (!locked.isLocked()) {
      const message = 'PowerShell exited before locking the file: ' + stderr
      settle.ready.reject(new Error(message))
      settle.locked.reject(new Error(message))
    }
    if (code === 0) settleExit.resolve()
    else settleExit.reject(new Error('PowerShell file lock exited with code ' + code + ': ' + stderr))
  })

  const failFast = async (phasePromise, budget, makeMessage) => {
    try {
      await withBudget(phasePromise, budget, makeMessage)
    } catch (error) {
      try { child.kill() } catch (_) { /* 子进程已退出 */ }
      throw error
    }
  }

  // 相位 1：PowerShell 是否起来了。与"能不能拿到锁"是两件事，必须分开报。
  await failFast(
    signal.ready,
    readyTimeoutMs,
    (ms) => 'PowerShell did not reach the startup phase (no "' + READY_MARKER + '" marker) within ' + ms + 'ms'
      + ' — child startup itself was starved, the file lock was never attempted'
      + ' (stdout=' + JSON.stringify(ready.text()) + ', stderr=' + JSON.stringify(stderr) + ')',
  )
  // 相位 2：起来之后，open 有没有拿到锁。
  await failFast(
    signal.locked,
    lockedTimeoutMs,
    (ms) => 'lock phase: child reported READY but never "' + LOCK_MARKER + '" within ' + ms + 'ms'
      + ' (READY observed at ' + readyAt + 'ms, total ' + (Date.now() - startedAt) + 'ms,'
      + ' stdout=' + JSON.stringify(locked.text()) + ', stderr=' + JSON.stringify(stderr) + ')',
  )

  // 相位 3：标记不等于效果 —— 从父进程侧反向确认独占是真的。
  let effective = null
  if (verifyLockHeld) {
    try {
      effective = exclusiveLockIsEffective(filePath)
    } catch (error) {
      try { child.kill() } catch (_) { /* 已退出 */ }
      throw new Error('lock effectiveness probe failed on ' + filePath + ': '
        + (error && error.message) + ' (stdout=' + JSON.stringify(locked.text()) + ')')
    }
    if (!effective) {
      try { child.kill() } catch (_) { /* 已退出 */ }
      throw new Error('lock not verified: the child printed "' + LOCK_MARKER + '" but ' + filePath
        + ' is still writable from this process, so the fixture holds nothing'
        + ' — consumers would assert retry behaviour against an unlocked file and pass vacuously'
        + ' (stderr=' + JSON.stringify(stderr) + ')')
    }
  }

  // 逐次留痕：预算该给多大要靠这里攒出来的分布，不是靠注释里的"秒级"断言。
  console.log('[windows-file-lock] ready=' + readyAt + 'ms locked=' + lockedAt + 'ms'
    + ' verify=' + (effective === null ? 'off' : 'ok') + ' holdMs=' + holdMs)

  return {
    exitPromise,
    release: () => withBudget(
      exitPromise,
      releaseTimeoutMs,
      (ms) => 'file lock was not released within ' + ms + 'ms'
        + ' (holdMs=' + holdMs + ', stderr=' + JSON.stringify(stderr) + ')',
    ),
  }
}

module.exports = {
  holdExclusiveWindowsFileLock,
  createLockHandshake,
  exclusiveLockIsEffective,
  LOCK_MARKER,
  READY_MARKER,
  DEFAULT_READY_TIMEOUT_MS,
  DEFAULT_LOCKED_TIMEOUT_MS,
  DEFAULT_RELEASE_TIMEOUT_MS,
  PRODUCTION_HEADROOM_MS,
  LOCK_CASE_TIMEOUT_MS,
}
