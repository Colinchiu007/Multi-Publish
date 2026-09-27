// @ts-check
/**
 * account-state-lock — 登录态真源写入的 per-account 串行锁（单元 + 死锁防护）
 *
 * 为什么存在：登录态真源（后端 accounts.json 的 status / last_validated / credential 落盘顺序）
 * 有四个互不知情的主进程写者——定期检测 `login-status-monitor`、`account:check-login`、
 * `accounts:batch-check-login`、云端恢复 `cloud-account-restore`。渲染层只在按钮上做了互斥
 * （`Accounts.vue` 的 `batchCheckAllBusy` / `cloudSyncRunning`），**定时器触发的检测不经过任何界面闸**。
 * 于是存在一条真实交错：检测用**旧凭证**发出请求 → 恢复把云端凭证覆盖到本机并写
 * `unverified(restored)` → 检测的结论迟到一步写成 `active`。最终「本机那份凭证从未被验证过」
 * 却显示已登录，直接违反 AGENTS.md「恢复到本机的账号 MUST 先落盘再置 unverified」「登录态只被
 * 正/负证据改写」。
 *
 * 本锁把不变量表达成代码：**凭证覆盖不得插在「检测读凭证」与「检测写结论」之间**。
 *
 * 三条最容易被改坏的性质，各自有独立用例（缺一条即视为锁失效）：
 *  1. 同 key 串行、异 key 不互相阻塞（否则批量检测退化为串行，撞上 QM-3 的超时预算）；
 *  2. 前一个 section **抛错也必须放行后来者**（链若留在 rejected 状态，该账号永久卡死）；
 *  3. 等待队列排空后键必须被回收（长驻主进程里 Map 无界增长 = 泄漏）。
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'

const lock = require('./account-state-lock')

/** 事件序列记录器：并发交错只能靠「谁先发生」来断言，不能靠返回值。 */
function createTrace () {
  /** @type {string[]} */
  const events = []
  return {
    events,
    mark (name) { events.push(name) },
    /** 返回 name 第一次出现的位置；未出现返回 -1 */
    indexOf (name) { return events.indexOf(name) },
  }
}

/** 手动掌控的 promise，用来把「在途」这一状态固定在时间里。 */
function deferred () {
  /** @type {(v?: any) => void} */
  let resolve
  /** @type {(e?: any) => void} */
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/**
 * 把当前所有微任务排空（一个 macrotask 边界）。
 * 不用 `await Promise.resolve()` 数微任务：那会把断言绑死在实现跳几次的细节上，
 * 而本锁要证的性质是「另一个持锁者在门被开之前不得进场」，与 hop 数量无关。
 */
function flush () {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('account-state-lock 串行锁合同', () => {
  it('同 accountId：第二个临界区必须等第一个 settle 之后才开始', async () => {
    const t = createTrace()
    const gate = deferred()

    const first = lock.withAccountStateLock('acc-mutex-1', async () => {
      t.mark('first:start')
      await gate.promise
      t.mark('first:end')
      return 'A'
    })
    const second = lock.withAccountStateLock('acc-mutex-1', async () => {
      t.mark('second:start')
      t.mark('second:end')
      return 'B'
    })

    await flush()
    // 第一个已进场、尚未 settle 时，第二个绝不允许进场（这一句才是「互斥」本体）
    expect(t.events).toEqual(['first:start'])
    expect(lock.accountStateLockHeld('acc-mutex-1')).toBe(true)

    gate.resolve()
    expect(await first).toBe('A')
    expect(await second).toBe('B')
    expect(t.events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('不同 accountId：互不阻塞（批量检测不得退化为串行）', async () => {
    const t = createTrace()
    const gate = deferred()

    const a = lock.withAccountStateLock('acc-par-a', async () => {
      t.mark('a:start')
      await gate.promise
      t.mark('a:end')
    })
    const b = lock.withAccountStateLock('acc-par-b', async () => {
      t.mark('b:start')
      t.mark('b:end')
    })

    await flush()
    // b 在 a 仍被挂起时就必须已经完成——若实现按全局单锁，这里只会得到 a:start
    expect(t.events).toEqual(['a:start', 'b:start', 'b:end'])
    gate.resolve()
    await Promise.all([a, b])
  })

  it('前一个 section 抛错不得把后来者永久挡在门外（失败必须放行）', async () => {
    const t = createTrace()
    const boom = lock.withAccountStateLock('acc-fail-1', async () => {
      throw new Error('检测炸了')
    })
    const after = lock.withAccountStateLock('acc-fail-1', async () => {
      t.mark('after:start')
      return 'ok'
    })

    await expect(boom).rejects.toThrow('检测炸了')
    expect(await after).toBe('ok')
    expect(t.events).toEqual(['after:start'])
  })

  it('等待队列排空后回收键（主进程长驻，Map 无界增长即泄漏）', async () => {
    const before = lock.accountStateLockQueueSize()
    await lock.withAccountStateLock('acc-leak-1', async () => 1)
    await lock.withAccountStateLock('acc-leak-2', async () => 2)
    expect(lock.accountStateLockQueueSize(), '两个临界区结束后键必须被回收').toBe(before)
    expect(lock.accountStateLockHeld('acc-leak-1')).toBe(false)

    // 抛错的那一路同样必须回收：否则失败一次就在 Map 里留一个永不释放的键
    await expect(lock.withAccountStateLock('acc-leak-3', async () => { throw new Error('x') })).rejects.toThrow('x')
    expect(lock.accountStateLockQueueSize()).toBe(before)
  })

  it('同步抛错的 section 同样放行后来者并回收队列', async () => {
    const boom = lock.withAccountStateLock('acc-sync-throw', () => { throw new Error('同步抛错') })
    const after = lock.withAccountStateLock('acc-sync-throw', async () => 'ok')
    await expect(boom).rejects.toThrow('同步抛错')
    expect(await after).toBe('ok')
  })

  it('缺 accountId 一律当场抛错：静默不串行等于把要防的竞态留在原地', () => {
    for (const bad of [undefined, null, '', '   ']) {
      expect(() => lock.withAccountStateLock(bad, async () => 'x'), '空 accountId 被放行: ' + JSON.stringify(bad))
        .toThrow(/accountId/)
    }
  })

  it('FIFO：三个排队者按登记顺序进场，不得插队', async () => {
    const t = createTrace()
    const gate = deferred()
    /** @type {Promise<any>[]} */
    const holders = []
    holders.push(lock.withAccountStateLock('acc-fifo', async () => {
      t.mark('1:enter')
      await gate.promise
      t.mark('1:leave')
    }))
    // 先登记的后来者必须先拿到锁——批量检测的进度语义依赖不因插队而漂移
    holders.push(lock.withAccountStateLock('acc-fifo', async () => { t.mark('2:enter') }))
    holders.push(lock.withAccountStateLock('acc-fifo', async () => { t.mark('3:enter') }))
    gate.resolve()
    await Promise.all(holders)
    expect(t.events).toEqual(['1:enter', '1:leave', '2:enter', '3:enter'])
  })

  it('accountStateLockHeld 只反映「临界区在途」，排队者不得被误报为持锁', async () => {
    const gate = deferred()
    const first = lock.withAccountStateLock('acc-held', () => gate.promise)
    const second = lock.withAccountStateLock('acc-held', async () => 'b')
    await flush()
    expect(lock.accountStateLockHeld('acc-held')).toBe(true)
    gate.resolve()
    await Promise.all([first, second])
    expect(lock.accountStateLockHeld('acc-held')).toBe(false)
  })
})

// ─── 取锁等待上限（外部评审 Critical：锁等待不得绕开单任务硬超时预算）───
describe("account-state-lock 取锁等待上限", () => {
  it("等待超时：调用方拿到 ACCOUNT_LOCK_WAIT_TIMEOUT，且 section 从未执行", async () => {
    const gate = deferred()
    let ran = false
    const held = lock.withAccountStateLock("acc-wait-1", () => gate.promise)
    await flush()
    const waiter = lock.withAccountStateLock("acc-wait-1", async () => { ran = true; return "nope" }, { waitTimeoutMs: 20 })

    await expect(waiter).rejects.toThrow(/ACCOUNT_LOCK_WAIT_TIMEOUT|等待超时/)
    expect((await waiter.catch((e) => e)).code).toBe("ACCOUNT_LOCK_WAIT_TIMEOUT")
    expect(ran, "超时后仍执行 section = 调用方已放弃却又写进一份过期结论").toBe(false)

    // 等待者退出后不得把队列焊死：持锁者释放，后来者必须能进场
    gate.resolve()
    await held
    expect(await lock.withAccountStateLock("acc-wait-1", async () => "ok")).toBe("ok")
    expect(lock.accountStateLockQueueSize()).toBe(0)
  })

  it("已进场之后超时不生效：临界区里的写入不会被半路放弃", async () => {
    const result = await lock.withAccountStateLock("acc-wait-2", async () => {
      await new Promise((r) => setTimeout(r, 60))
      return "写完了"
    }, { waitTimeoutMs: 10 })
    expect(result).toBe("写完了")
  })

  it("超时路径不产生 unhandledRejection（前一个 section reject/超时都必须被链吃掉）", async () => {
    /** @type {unknown[]} */
    const rejections = []
    const onRejection = (reason) => { rejections.push(reason) }
    process.on("unhandledRejection", onRejection)
    try {
      const gate = deferred()
      const held = lock.withAccountStateLock("acc-wait-3", () => gate.promise)
      await flush()
      const timeouts = [0, 1, 2].map(() => lock.withAccountStateLock("acc-wait-3", async () => "x", { waitTimeoutMs: 15 }))
      const results = await Promise.allSettled(timeouts)
      expect(results.every((r) => r.status === "rejected" && r.reason.code === "ACCOUNT_LOCK_WAIT_TIMEOUT")).toBe(true)
      gate.resolve()
      await held
      // 给可能迟到的 rejection 一个落地窗口（同 account-batch-check.test.js 的既有手法）
      await new Promise((r) => setTimeout(r, 60))
      await new Promise((r) => process.nextTick(r))
      expect(rejections).toEqual([])
    } finally {
      process.off("unhandledRejection", onRejection)
    }
  })

  it("超时不得把后来者一起拖死：排队三个、只超时等待中的那两个", async () => {
    const gate = deferred()
    const order = []
    const held = lock.withAccountStateLock("acc-wait-4", async () => { order.push("1:hold"); await gate.promise; order.push("1:release") })
    await flush()
    const timeout = lock.withAccountStateLock("acc-wait-4", async () => order.push("2:timeout-ran"), { waitTimeoutMs: 20 })
    const late = lock.withAccountStateLock("acc-wait-4", async () => { order.push("3:late"); return "ok" })
    await expect(timeout).rejects.toThrow()
    gate.resolve()
    await held
    expect(await late).toBe("ok")
    expect(order).toEqual(["1:hold", "1:release", "3:late"])
  })
})