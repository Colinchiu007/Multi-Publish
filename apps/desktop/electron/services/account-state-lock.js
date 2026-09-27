'use strict'
// @ts-check
/**
 * account-state-lock — 登录态真源写入的 per-account 串行锁
 *
 * 要拦的交错（不是理论风险，是本轮残留登记的那一条）：
 *   检测发出请求（读的是**旧**凭证）→ 云端恢复把新凭证覆盖到本机并写 `unverified(restored)`
 *   → 检测结论迟到一步写成 `active`。
 * 结果是「本机这份凭证从未被验证过」却显示已登录，同时违反两条既有契约：
 * AGENTS.md「恢复到本机的账号 MUST 先 saveCredential 落盘、再回写 unverified」
 * 与「登录态只被正/负证据改写」。渲染层的 `batchCheckAllBusy` / `cloudSyncRunning` 互斥对
 * **定时器发起的检测**没有任何约束力，所以这把闸必须落在主进程。
 *
 * 不变量：**凭证覆盖不得插在「检测读凭证」与「检测写结论」之间**。
 * 两侧各自把整段（检测：checkLoginStatus→写结论；恢复：saveCredential→写状态）放进同一把
 * 以 accountId 为键的锁，交错被压成两种合法序列化，两者都满足上面的不变量。
 *
 * 四条设计约束，改动时不要顺手破：
 *  1. **键是 accountId，不是 platform**：云端合并键 `(platform, platform_uid)` 是云端的事，本机真源按
 *     accountId 唯一，跨账号并行必须保留（批量检测有并发上限与单任务硬超时，全局单锁会让整批
 *     撞上超时预算 —— 见 AGENTS.md「批量 IPC 进度双边界与超时预算契约」）。
 *  2. **临界区内禁止再取同一把锁**：恢复收尾的 `queueLoginCheck` 会走同一把锁，因此它必须在
 *     释放之后调用。`cloud-account-restore.test.js` 里有一条用例直接断言「排队检测时自己不在锁内」，
 *     把它挪回锁内会当场死锁，那条用例就是防这一步复发的。
 *  3. **失败必须放行**：前一个 section 抛错时链若留在 rejected 状态，该账号此后每次检测都会
 *     挂在同一个 rejected 前置上 —— 主进程里表现为「这个账号永远检测不出来」。
 *  4. **等待必须有上限，且上限只作用于"还没进场"的等待者**：一个挂死的写者（浏览器降级检测可以
 *     挂几十秒）若让后来者无限等，批量检测会先广播 `start` 却永远不广播 `done`（违反进度双边界契约），
 *     定期检测更会因 `_running` 永不复位而停掉之后所有轮次。进场之后不设超时——临界区里已经在写
 *     真源，半路放弃才是真正的不一致；所以超时的票**绝不执行 section**（一个迟到的排队者在调用方
 *     已经放弃之后写进过期结论，正是本锁要消灭的形态）。
 */

/** @type {Map<string, { tail: Promise<any>, waiting: number, held: boolean }>} */
const chains = new Map()

/**
 * 取锁等待的默认上限；`MP_ACCOUNT_LOCK_WAIT_MS` 只为排障可放大，非法值回落默认
 * （同本仓 `MP_LOGIN_STATE_GRACE_DAYS` 的口径）。
 */
function defaultWaitTimeoutMs () {
  const raw = Number(process.env.MP_ACCOUNT_LOCK_WAIT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 30000
}

function waitTimeoutError (key, waitTimeoutMs) {
  const error = new Error(`登录态写入等待超时（accountId=${key}，>${waitTimeoutMs}ms 未取到锁）`)
  error.code = 'ACCOUNT_LOCK_WAIT_TIMEOUT'
  return error
}

function toKey (accountId) {
  if (typeof accountId !== 'string' && typeof accountId !== 'number') {
    throw new TypeError('account-state-lock: accountId 必须是字符串或数字，缺 accountId 不串行即等于没修')
  }
  const key = String(accountId).trim()
  if (!key) throw new TypeError('account-state-lock: accountId 不得为空')
  return key
}

/**
 * 在 accountId 的临界区内执行 section，按登记顺序 FIFO 串行。
 * section 的返回值/异常原样透传给调用方；无论成败都会放行后来者并回收队列。
 * @template T
 * @param {string|number} accountId
 * @param {() => (T|Promise<T>)} section
 * @param {{ waitTimeoutMs?: number }} [options] 取锁等待上限，默认 30s（见文件头约束 4）
 * @returns {Promise<T>}
 */
function withAccountStateLock (accountId, section, options = {}) {
  const key = toKey(accountId)
  if (typeof section !== 'function') throw new TypeError('account-state-lock: section 必须是函数')

  let state = chains.get(key)
  if (!state) {
    state = { tail: Promise.resolve(), waiting: 0, held: false }
    chains.set(key, state)
  }
  state.waiting += 1

  const waitTimeoutMs = Number.isFinite(options.waitTimeoutMs) && options.waitTimeoutMs > 0
    ? options.waitTimeoutMs
    : defaultWaitTimeoutMs()
  /**
   * 调用方拿到的 promise 与队列链**解耦**：这是超时语义成立的前提。
   * 若两者同体，超时只能等到"轮到本等待者"才浮出来 —— 那时持锁者可能还挂着几十秒，
   * 批量遮罩依旧停在 start、定期检测依旧不复位，等于没加超时。
   * 解耦后：超时当场让调用方失败；轮到它时看到票已过期，就**跳过 section**，只把链往下推。
   */
  /** @type {{resolve: (v:any)=>void, reject: (e:any)=>void}} */
  let settleCaller
  const callerPromise = new Promise((resolve, reject) => { settleCaller = { resolve, reject } })
  const ticket = { entered: false, expired: false, timer: null }

  const settle = () => {
    state.waiting -= 1
    if (state.waiting === 0 && chains.get(key) === state) chains.delete(key)
  }

  const run = () => {
    if (ticket.expired) {
      // 调用方已经收到超时；这里绝不执行 section，只负责把队列往前推
      settle()
      return undefined
    }
    ticket.entered = true
    if (ticket.timer) {
      clearTimeout(ticket.timer)
      ticket.timer = null
    }
    state.held = true
    // 同步调用 section（不套 Promise.resolve().then）：多一跳会把「进场」推迟到调用方
    // 让出之后，交错窗口在语义上就变了；同步抛错也必须归一成 rejection，走同一条收口路径。
    let outcome
    try {
      outcome = section()
    } catch (e) {
      outcome = Promise.reject(e)
    }
    const internal = Promise.resolve(outcome).finally(() => {
      state.held = false
      settle()
    })
    internal.then(
      (value) => { if (!ticket.expired) settleCaller.resolve(value) },
      (error) => { if (!ticket.expired) settleCaller.reject(error) },
    )
    // 最后一个等待者的失败如果只有这条链引用（调用方另有 promise），就会变成 unhandledRejection
    internal.catch(() => {})
    return internal
  }

  // 前后两个分支都是 run：前一环节成功或失败都必须放行本环节
  const step = state.tail.then(run, run)
  // 队列链本身**不得携带失败**。上一行 `.then(run, run)` 的产物在被最后一名等待者使用时，
  // 链上再无接手人 —— section 的 rejection 就以"队尾 promise"的身份逃逸成 unhandledRejection
  // （CI 实测：vitest 报 `Errors 2`，栈顶是 run() 里的 section() 调用点，而调用方其实已经
  // 通过 callerPromise 收到过同一个错误）。生产里这会打到 process 的 unhandledRejection 钩子。
  // 失败的正确出口只有一个：callerPromise。链只负责顺序。
  state.tail = step.then(() => undefined, () => undefined)

  ticket.timer = setTimeout(() => {
    ticket.timer = null
    if (ticket.entered || ticket.expired) return
    ticket.expired = true
    settleCaller.reject(waitTimeoutError(key, waitTimeoutMs))
  }, waitTimeoutMs)
  // 注意：**不给这把等待 timer 加 unref**。unref 的 timer 在事件循环只剩它时不会被服务，
  // 表现为"等锁永远不会超时"——那正是本要防的挂死。主进程本来长驻，保留它对退出无影响；
  // 临界区自身（检测/落盘）的时长才是不该拖住退出的东西，而那由各自的超时负责。

  return callerPromise
}

/** 该 accountId 当前是否处于临界区内（供日志与「不得在锁内排队检测」的回归断言）。 */
function accountStateLockHeld (accountId) {
  const state = chains.get(toKey(accountId))
  return Boolean(state && state.held)
}

/** 正在排队/持锁的键数量（泄漏哨兵：排空后必须归零）。 */
function accountStateLockQueueSize () {
  return chains.size
}

module.exports = { withAccountStateLock, accountStateLockHeld, accountStateLockQueueSize }
