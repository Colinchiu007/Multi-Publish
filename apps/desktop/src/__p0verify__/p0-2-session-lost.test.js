/**
 * P0-2 实证验证：任务重试换 taskId → 结果卡永不更新
 *
 * 被测链路（真实实现）：
 *   stores/publishProgress.js:276-297      _retryOne  —— 删旧 taskId、写入新 taskId
 *   composables/usePublishFlow.js:116-122  activeSession —— 按 activeTaskIds 反查 session
 *   composables/usePublishFlow.js:125-147  watch —— 终态时写 result（用户可见结果卡）
 *
 * 判据设计说明：activeSession 是内部 computed、未导出，用户看不到它。
 * 用户真正看到的是 `result`（页面结果卡）。因此本验证观察 **result 是否被更新**，
 * 而非内部 computed 的值 —— 这比原报告的判据更贴近用户影响。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

let retryResult = { code: 0, data: { taskId: 'task-NEW' } }
vi.mock('@/api/publisher', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    retryTask: vi.fn(async () => retryResult),
    publishBatch: vi.fn(async () => ({ code: 0, data: { taskIds: ['task-OLD'] } })),
  }
})

vi.mock('@/composables/useLoginGate', () => ({
  useLoginGate: () => ({ ensureLogin: vi.fn(async () => true) }),
}))

import { usePublishProgressStore } from '@/stores/publishProgress'
import { usePublishFlow } from '@/composables/usePublishFlow'

function makeFlow() {
  return usePublishFlow({
    article: ref({ title: '标题', content: '正文'.repeat(40), images: [], image_files: [] }),
    selectedPlatforms: ref(['wechat_mp']),
    selectedAccounts: ref({ wechat_mp: ['acc-1'] }),
    precheckEnabled: ref(false),
  })
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('P0-2 实证：重试换 taskId 后结果卡永不更新', () => {
  let store
  let flow

  beforeEach(() => {
    setActivePinia(createPinia())
    retryResult = { code: 0, data: { taskId: 'task-NEW' } }
    vi.clearAllMocks()
    store = usePublishProgressStore()
    flow = makeFlow()
  })

  it('基线：无重试时，终态应驱动 result 更新（结果卡正常工作）', async () => {
    const session = store.registerSession({ taskIds: ['task-OLD'], platforms: ['wechat_mp'] })
    flow.activeTaskIds.value = ['task-OLD']
    expect(flow.result.value).toBeNull()

    // 模拟任务成功 → 会话终态 done
    session.tasks['task-OLD'].phase = 'success'
    session.tasks['task-OLD'].result = { url: 'https://example.com/post/1' }
    session.status = 'done'
    await tick(); await tick()

    console.log(`[基线] session.tasks 键 = ${JSON.stringify(Object.keys(session.tasks))}`)
    console.log(`[基线] result = ${JSON.stringify(flow.result.value)}`)
    // 基线必须成立，否则后续「结果卡不更新」无意义
    expect(flow.result.value).not.toBeNull()
    expect(flow.result.value.success).toBe(true)
  })

  it('重试后：会话仍能到达 done，但 result 是否更新？', async () => {
    const session = store.registerSession({ taskIds: ['task-OLD'], platforms: ['wechat_mp'] })
    flow.activeTaskIds.value = ['task-OLD']

    // 任务先失败
    session.tasks['task-OLD'].phase = 'failed'
    session.status = 'running'
    await tick()

    // 用户点重试 → store 换新 taskId
    const res = await store.retryFailed(session.id)
    await tick()
    console.log(`[重试] retryFailed 返回 = ${JSON.stringify(res)}`)
    console.log(`[重试后] session.tasks 键 = ${JSON.stringify(Object.keys(session.tasks))}`)
    console.log(`[重试后] flow.activeTaskIds = ${JSON.stringify(flow.activeTaskIds.value)}`)

    // 新任务成功 → 会话终态 done（store 侧完全正常）
    const newId = Object.keys(session.tasks)[0]
    session.tasks[newId].phase = 'success'
    session.tasks[newId].result = { url: 'https://example.com/post/2' }
    session.status = 'done'
    await tick(); await tick(); await tick()

    console.log(`[重试后] session.status = ${session.status}`)
    console.log(`[重试后] 新任务 phase = ${session.tasks[newId].phase}`)
    console.log(`[重试-终] result = ${JSON.stringify(flow.result.value)}`)

    if (flow.result.value === null) {
      console.log('[实证] 结论 ❌ 失联坐实：会话已 done 且新任务成功，但 result 仍为 null —— 页面结果卡永远停在旧状态')
    } else {
      console.log('[实证] 结论 ✅ result 被更新，未复现失联')
    }

    // 判据：会话确实到达终态
    expect(session.status).toBe('done')
    expect(Object.keys(session.tasks)).not.toContain('task-OLD')
    expect(Object.keys(session.tasks)).toContain('task-NEW')
  })

  it('反证：若消费侧 id 更新为新 id，result 应正常更新（证明修复方向有效）', async () => {
    const session = store.registerSession({ taskIds: ['task-OLD'], platforms: ['wechat_mp'] })
    flow.activeTaskIds.value = ['task-OLD']
    session.tasks['task-OLD'].phase = 'failed'
    session.status = 'running'
    await tick()

    await store.retryFailed(session.id)
    await tick()
    flow.result.value = null  // 重置以观察

    // 模拟修复：消费侧把 id 更新为新 id
    flow.activeTaskIds.value = ['task-NEW']
    await tick()

    // 走 store 真实事件入口让 status 由 _recomputeSessionStatus 流转
    // （签名见 publishProgress.js: platform + phase 必填，非法事件会被丢弃）
    store.handleProgressEvent({
      taskId: 'task-NEW',
      platform: 'wechat_mp',
      phase: 'success',
      result: { url: 'https://example.com/post/3' },
    })
    await tick(); await tick(); await tick()

    console.log(`[反证-修复] session.status = ${session.status}`)
    console.log(`[反证-修复] activeTaskIds 改为新 id 后 result = ${JSON.stringify(flow.result.value)}`)
    expect(session.status).toBe('done')
    expect(flow.result.value).not.toBeNull()
    expect(flow.result.value.success).toBe(true)
  })
})
