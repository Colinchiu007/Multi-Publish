/**
 * P0-1 实证验证（v2）：照抄项目官方 usePublishFlow.test.js 的装置
 *
 * 官方测试只用 vi.mock('@/api/publisher') 替换 IPC 层，其余全部走真实实现。
 * v1 我注入了 20+ 个依赖替身，导致基线用例（单次调用）也进不了发布体 ——
 * 那是装置缺陷，不是被测代码问题。v2 弃用注入。
 *
 * 判据：mock useLoginGate 让 ensureLogin 可挂起/放行，
 *      模拟用户在登录引导弹窗期间二次点击「发布」，
 *      看真实 publishBatch（API 层）被调用几次。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

// ── ensureLogin 控制：null=立即放行；数组=挂起并收集 resolve ──
let loginGateResolvers = null
let loginGateCalls = 0
vi.mock('@/composables/useLoginGate', () => ({
  useLoginGate: () => ({
    ensureLogin: vi.fn(() => {
      loginGateCalls += 1
      if (loginGateResolvers === null) return Promise.resolve(true)
      return new Promise((resolve) => { loginGateResolvers.push(resolve) })
    }),
  }),
}))

// ── 记录 API 层真实调用次数（重复提交的直接证据）──
const publishBatchCalls = []
vi.mock('@/api/publisher', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    publishBatch: vi.fn(async (...a) => {
      publishBatchCalls.push(a[0])
      return { code: 0, data: { taskIds: ['task-1'] } }
    }),
    cancelTask: vi.fn(async () => ({ code: 0 })),
    generateAiCover: vi.fn(async () => ({ code: 0, data: {} })),
  }
})

import { usePublishFlow } from '@/composables/usePublishFlow'

function makeFlow() {
  return usePublishFlow({
    article: reactive({ title: '测试标题', content: '正文内容'.repeat(40), images: [], image_files: [] }),
    selectedPlatforms: ref(['wechat_mp']),
    selectedAccounts: ref({ wechat_mp: ['acc-1'] }),
    precheckEnabled: ref(false),
  })
}

describe('P0-1 实证 v2：发布重入窗口（走真实依赖，仅 mock IPC 层）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    publishBatchCalls.length = 0
    loginGateCalls = 0
    loginGateResolvers = null
    vi.clearAllMocks()
  })

  it('基线：单次调用（无并发）应恰好发起 1 次发布', async () => {
    const flow = makeFlow()
    await flow.handlePublish()
    await new Promise((r) => setTimeout(r, 60))
    console.log(`[基线] publishBatch 调用次数 = ${publishBatchCalls.length}`)
    console.log(`[基线] ensureLogin 调用次数 = ${loginGateCalls}`)
    console.log(`[基线] publishing 终态 = ${flow.publishing.value}`)
    console.log(`[基线] progress = ${JSON.stringify(flow.progress.value)}`)
    // 这是重入判据的前提：单次调用必须真的发起发布
    expect(publishBatchCalls.length).toBe(1)
  })

  it('登录引导期间二次点击 → 是否重复发起发布', async () => {
    loginGateResolvers = []  // 挂起，模拟弹窗等待用户操作
    const flow = makeFlow()

    // 第一次点击
    const p1 = flow.handlePublish()
    await new Promise((r) => setTimeout(r, 10))
    console.log(`[重入] 第一次点击后: ensureLogin=${loginGateCalls}次 publishing=${flow.publishing.value}`)
    expect(flow.publishing.value).toBe(false)   // 窗口存在

    // 第二次点击（用户等不及，又点了一次）
    const p2 = flow.handlePublish()
    await new Promise((r) => setTimeout(r, 10))
    console.log(`[重入] 第二次点击后: ensureLogin=${loginGateCalls}次 publishing=${flow.publishing.value}`)

    // 用户完成登录 → 放行全部挂起的 ensureLogin
    const resolvers = loginGateResolvers.splice(0)
    resolvers.forEach((r) => r(true))
    await Promise.allSettled([p1, p2])
    await new Promise((r) => setTimeout(r, 80))

    console.log(`[重入-终] publishBatch 调用次数 = ${publishBatchCalls.length}`)
    console.log(`[重入-终] ensureLogin 调用次数 = ${loginGateCalls}`)

    if (publishBatchCalls.length >= 2) {
      console.log('[重入-终] ❌ 重复提交成立：一次登录引导放行了 2 次真实发布请求')
    } else if (publishBatchCalls.length === 1) {
      console.log('[重入-终] ✅ 第二次被守卫拦住，重入窗口已被有效关闭')
    } else {
      console.log('[重入-终] ⚠ 未发起任何发布，需进一步定位拦截点')
      console.log(`[重入-终] progress = ${JSON.stringify(flow.progress.value)}`)
    }

    expect(publishBatchCalls.length).toBeGreaterThanOrEqual(1)
  })
})
