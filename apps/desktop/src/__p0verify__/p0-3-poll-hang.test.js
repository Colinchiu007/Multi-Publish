/**
 * P0-3 实证验证：Collection 批量轮询异常分支不处理 → UI 永久卡在「采集中」
 *
 * 装置说明（重要）：batchCollecting 等是 Collection.vue 组件内部的闭包 ref，
 * **无法从外部注入依赖**。因此本验证不 mock 组件，而是把 Collection.vue
 * 中 startBatchPolling 的轮询体（:2545-2587）逐行提取为可测函数 ——
 * 提取时保持控制流与赋值点完全一致，并在下方用「源码锚点断言」锁住这一致性。
 *
 * 被测锚点（Collection.vue）：
 *   :2559  status completed/success → batchCollecting = false + stopBatchPolling()
 *   :2576  status failed/error     → batchCollecting = false + stopBatchPolling()
 *   :2584  catch                   → 空（仅注释），无计数、无超时、无提示、无复位
 *
 * 判据：IPC 持续 reject N 次后，batchCollecting 应仍为 true（= 卡死）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Collection.vue startBatchPolling 的轮询体提取版。
 * 与源码 :2545-2587 控制流逐行对应；catch 分支保持「空」——这是被测对象。
 */
function makeBatchPoller({ api, state, setIntervalImpl, clearIntervalImpl }) {
  const { batchTaskId, batchCollecting, batchError, batchProgress } = state
  let batchPollTimer = null

  function stopBatchPolling () {
    if (batchPollTimer) {
      clearIntervalImpl(batchPollTimer)
      batchPollTimer = null
    }
    // 源码 :2598 另有一处 batchCollecting = false
    batchCollecting.value = false
  }

  function startBatchPolling () {
    stopBatchPollingIfExists()
    function stopBatchPollingIfExists () {
      if (batchPollTimer) { clearIntervalImpl(batchPollTimer); batchPollTimer = null }
    }
    batchPollTimer = setIntervalImpl(async () => {
      if (!batchTaskId.value) return
      if (!api || !api.aggregationTaskStatus) return
      try {
        const res = await api.aggregationTaskStatus(batchTaskId.value)
        const data = res && res.data ? res.data : res
        const status = data.status || res.status
        const total = data.total || 0
        const completed = data.completed !== undefined ? data.completed : data.done || 0

        if (status === 'completed' || status === 'success') {
          batchProgress.value = 100
          batchCollecting.value = false          // ← 源码 :2559
          stopBatchPolling()
        } else if (status === 'failed' || status === 'error') {
          batchError.value = data.message || 'failed'
          batchCollecting.value = false          // ← 源码 :2576
          stopBatchPolling()
        } else {
          if (total > 0) batchProgress.value = Math.round((completed / total) * 100)
        }
      } catch (e) {
        // 源码 :2584-2586 —— 空分支：既不计数、也不超时、也不提示、也不复位
      }
    }, 2000)
  }

  return { startBatchPolling, stopBatchPolling, isRunning: () => batchPollTimer !== null }
}

describe('P0-3 实证：批量轮询异常分支导致 UI 永久卡死', () => {
  let state
  let tickers
  let now

  beforeEach(() => {
    state = {
      batchTaskId: ref('task-1'),
      batchCollecting: ref(true),
      batchError: ref(''),
      batchProgress: ref(0),
    }
    tickers = []
    now = 0
  })
  afterEach(() => vi.useRealTimers())

  it('锚点断言：源码 catch 分支确实为空，且赋值点分布与本提取版一致', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/views/Collection.vue'),
      'utf8',
    )
    // 1) catch 分支为空（只有注释，无计数/超时/提示/复位）
    const catchBlock = src.slice(src.indexOf('} catch (e) {', src.indexOf('batchPollTimer = setInterval')))
      .slice(0, 200)
    expect(catchBlock).toMatch(/catch \(e\) \{\s*\/\/[^\n]*\n\s*\}/)
    expect(catchBlock).not.toMatch(/batchCollecting\.value = false/)
    expect(catchBlock).not.toMatch(/consecutive|failCount|timeout|retryCount/i)

    // 2) 轮询体内 batchCollecting = false 只有两处（completed / failed 终态）
    const pollBody = src.slice(src.indexOf('batchPollTimer = setInterval'), src.indexOf('function stopBatchPolling'))
    const resets = pollBody.match(/batchCollecting\.value = false/g) || []
    expect(resets).toHaveLength(2)

    // 3) 全文 batchCollecting 赋值点共 7 处，异常 catch 不在其中
    const allAssignments = (src.match(/batchCollecting\.value =/g) || []).length
    expect(allAssignments).toBe(7)
  })

  it('基线：任务正常完成 → batchCollecting 应复位为 false', async () => {
    const api = { aggregationTaskStatus: vi.fn(async () => ({ data: { status: 'completed', total: 1, completed: 1, items: [] } })) }
    const p = makeBatchPoller({ api, state, setIntervalImpl: (fn) => { tickers.push(fn); return 1 }, clearIntervalImpl: () => {} })
    p.startBatchPolling()
    await tickers[0]()
    console.log(`[基线] batchCollecting = ${state.batchCollecting.value} | batchError = "${state.batchError.value}"`)
    expect(state.batchCollecting.value).toBe(false)
  })

  it('实证：IPC 持续 reject → batchCollecting 永为 true（UI 卡死）', async () => {
    const api = { aggregationTaskStatus: vi.fn(async () => { throw new Error('主进程未就绪 / 任务记录丢失') }) }
    // 真实 setInterval 语义：只注册 1 个周期回调，被反复调用
    const p = makeBatchPoller({ api, state, setIntervalImpl: (fn) => { tickers.push(fn); return 1 }, clearIntervalImpl: () => {} })
    p.startBatchPolling()
    expect(tickers).toHaveLength(1)
    const tick = tickers[0]

    // 连续 20 轮轮询全部失败（相当于 40 秒无响应）
    for (let i = 0; i < 20; i++) {
      await tick()
    }

    console.log(`[实证] 失败轮次 = 20（约 40 秒）`)
    console.log(`[实证] api 实际被调 = ${api.aggregationTaskStatus.mock.calls.length} 次`)
    console.log(`[实证] batchCollecting = ${state.batchCollecting.value}`)
    console.log(`[实证] batchError = "${state.batchError.value}"（空 = 用户看不到任何提示）`)
    console.log(`[实证] 轮询是否仍在运行 = ${p.isRunning()}`)

    if (state.batchCollecting.value === true) {
      console.log('[实证] 结论 ❌ 卡死坐实：20 轮失败后 batchCollecting 仍为 true，发起按钮永久禁用，用户无任何提示')
    } else {
      console.log('[实证] 结论 ✅ 已被复位，未复现卡死')
    }

    // 判据
    expect(api.aggregationTaskStatus.mock.calls.length).toBe(20)
    expect(state.batchCollecting.value).toBe(true)   // ← 缺陷坐实
    expect(state.batchError.value).toBe('')           // ← 无提示
    expect(p.isRunning()).toBe(true)                  // ← 轮询永不停
  })

  it('反证：失败计数 + 超时上限存在时，状态应能被正确复位', async () => {
    // 模拟「修复版」：连续失败 3 次即复位并提示
    let consecutiveFailures = 0
    const state2 = {
      batchTaskId: ref('task-1'),
      batchCollecting: ref(true),
      batchError: ref(''),
      batchProgress: ref(0),
    }
    const api = { aggregationTaskStatus: vi.fn(async () => { throw new Error('fail') }) }
    const MAX = 3
    for (let i = 0; i < 20; i++) {
      try {
        await api.aggregationTaskStatus('task-1')
        consecutiveFailures = 0
      } catch (e) {
        consecutiveFailures += 1
        if (consecutiveFailures >= MAX) {
          state2.batchError.value = `连续 ${MAX} 次查询失败，已停止轮询`
          state2.batchCollecting.value = false
          break
        }
      }
    }
    console.log(`[反证-修复] 连续失败 ${consecutiveFailures} 次后 batchCollecting = ${state2.batchCollecting.value}`)
    console.log(`[反证-修复] 提示 = "${state2.batchError.value}"`)
    expect(consecutiveFailures).toBe(3)
    expect(state2.batchCollecting.value).toBe(false)
    expect(state2.batchError.value).not.toBe('')
  })
})
