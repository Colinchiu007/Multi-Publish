// @ts-check
/**
 * M-1 回归锁：发布重入窗口（锁必须前置到第一个 await 之前）
 *
 * 缺陷（报告 M-1）：handlePublish 的守卫在 :283，但锁直到 :414 才置位，
 * 中间隔着 `await ensureLogin()`（弹确认框 + 走 OAuth，可达秒级到分钟级）。
 * 窗口内二次点击两次都通过守卫 → 两次真实 publishBatch。
 *
 * 装置照抄项目官方 usePublishFlow.test.js 的 setup 段落。三处关键差异
 * 是本文件能跑通的前提（前两版装置都栽在这里）：
 *   ① 整体替换 @/api/publisher，不用 importOriginal —— 否则 sensitiveCheck /
 *      offlineStatus 走真实实现并提前 return，基线根本到不了 publishBatch；
 *   ② 替换 @/stores/publishProgress 为 reactive store —— 否则 registerSession
 *      走真实 Pinia store；
 *   ③ selectedAccounts 用字符串形态（与官方一致），不是数组。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive, ref } from 'vue'

const {
  mockPublishBatch,
  mockOnProgress,
  mockSensitiveCheck,
  mockOfflineStatus,
  mockOfflineAddToCache,
  mockCancelTask,
  mockStoreGetSetting,
  mockStoreSetSetting,
  mockElMessage,
  mockElMessageBox,
  mockEnsureLogin,
  mockRegisterSession,
} = vi.hoisted(function () {
  return {
    mockPublishBatch: vi.fn(),
    mockOnProgress: vi.fn(function () { return vi.fn() }),
    mockSensitiveCheck: vi.fn(),
    mockOfflineStatus: vi.fn(),
    mockOfflineAddToCache: vi.fn(),
    mockCancelTask: vi.fn(),
    mockStoreGetSetting: vi.fn(),
    mockStoreSetSetting: vi.fn(),
    mockElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    mockElMessageBox: { confirm: vi.fn() },
    // 默认放行；重入用例会改成挂起
    mockEnsureLogin: vi.fn(async () => true),
    mockRegisterSession: vi.fn(),
  }
})

vi.mock('@/composables/useLoginGate', function () {
  return {
    useLoginGate: () => ({
      ensureLogin: mockEnsureLogin,
      requireLogin: vi.fn(async (fn) => fn()),
      openSignIn: vi.fn(async () => true),
    }),
  }
})

vi.mock('@/api/publisher', function () {
  return {
    publishBatch: mockPublishBatch,
    onProgress: mockOnProgress,
    sensitiveCheck: mockSensitiveCheck,
    offlineStatus: mockOfflineStatus,
    offlineAddToCache: mockOfflineAddToCache,
    schedulerCreate: vi.fn(),
    schedulerCancel: vi.fn(),
    cancelTask: mockCancelTask,
    showNotification: vi.fn(),
    storeGetSetting: mockStoreGetSetting,
    storeSetSetting: mockStoreSetSetting,
    batchCreate: vi.fn(),
  }
})

vi.mock('element-plus', function () {
  return { ElMessage: mockElMessage, ElMessageBox: mockElMessageBox }
})

vi.mock('@/stores/publishProgress', async () => {
  const { reactive } = await import('vue')
  const store = reactive({
    sessions: [],
    panelVisible: false,
    panelMinimized: false,
    registerSession: mockRegisterSession,
  })
  return { usePublishProgressStore: () => store }
})

import { usePublishFlow } from '@/composables/usePublishFlow'
import { usePublishProgressStore } from '@/stores/publishProgress'

const tick = () => new Promise((r) => setTimeout(r, 20))

/** 构造一个走完整单篇发布流程的 composable（形态对齐官方测试） */
function makeFlow () {
  const article = reactive({
    title: 'Test', content: 'Content', author: '', cover_url: '', video_path: '', publishTime: '',
  })
  return usePublishFlow({
    article,
    selectedPlatforms: ref(['wechat_mp']),
    selectedAccounts: ref({ wechat_mp: 'acc1' }),
    precheckEnabled: ref(false),
  })
}

describe('M-1 回归锁：发布重入窗口已关闭', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 装置要点（踩了四轮才调通，逐条都有代价）：
    // ① mockPublishBatch 需 message 字段；
    // ② storeGetSetting 返回 false（不是 {code:0,...}）；
    // ③ **sensitiveCheck / offlineStatus 必须喂返回值** —— 只声明 vi.fn() 不给实现时
    //    返回 undefined，代码读 .data 直接抛 "Cannot read properties of undefined"，
    //    流程在 publishBatch 之前静默退出，表现为「基线用例 mockCalls=0」；
    // ④ @/api/publisher 整体替换（不用 importOriginal）+ @/stores/publishProgress 换成
    //    reactive store，两者缺一则走真实实现。
    mockPublishBatch.mockResolvedValue({ code: 0, data: { taskIds: ['t1'] }, message: 'ok' })
    mockSensitiveCheck.mockResolvedValue({ code: 0, data: { words: [] } })
    mockOfflineStatus.mockResolvedValue({ code: 0, data: { offline: false } })
    mockEnsureLogin.mockResolvedValue(true)
    mockStoreGetSetting.mockResolvedValue(false)
    mockStoreSetSetting.mockResolvedValue({ code: 0, data: true })
    mockElMessageBox.confirm.mockResolvedValue(undefined)
    mockRegisterSession.mockReturnValue({ id: 's1', tasks: {}, taskOrder: [] })
    usePublishProgressStore().sessions = []
  })

  it('基线：单次调用应恰好发起 1 次发布', async () => {
    const flow = makeFlow()
    await flow.handlePublish()
    await tick()
    expect(mockPublishBatch).toHaveBeenCalledTimes(1)
    expect(flow.publishing.value).toBe(false)   // 锁已被 finally 复位
  })

  it('登录引导期间二次点击：第二次必须被守卫拦住', async () => {
    let resolveLogin
    mockEnsureLogin.mockImplementation(() => new Promise((r) => { resolveLogin = r }))
    const flow = makeFlow()

    // 第一次点击：进入 await ensureLogin 之前，锁必须已置位
    const p1 = flow.handlePublish()
    await tick()
    expect(flow.publishing.value).toBe(true)
    expect(mockEnsureLogin).toHaveBeenCalledTimes(1)

    // 第二次点击（用户在弹窗期间又点了一次）
    const p2 = flow.handlePublish()
    await tick()
    expect(mockEnsureLogin).toHaveBeenCalledTimes(1)   // 未穿过守卫

    // 用户完成登录
    resolveLogin(true)
    await Promise.allSettled([p1, p2])
    await tick()

    expect(mockPublishBatch).toHaveBeenCalledTimes(1)  // 只发起 1 次发布
    expect(flow.publishing.value).toBe(false)
  })

  it('用户在登录弹窗点取消：锁必须被 finally 复位（否则按钮永久禁用）', async () => {
    let resolveLogin
    mockEnsureLogin.mockImplementation(() => new Promise((r) => { resolveLogin = r }))
    const flow = makeFlow()

    const p = flow.handlePublish()
    await tick()
    expect(flow.publishing.value).toBe(true)

    resolveLogin(false)          // 用户取消
    await Promise.allSettled([p])
    await tick()

    expect(flow.publishing.value).toBe(false)
    expect(mockPublishBatch).not.toHaveBeenCalled()
  })
})
