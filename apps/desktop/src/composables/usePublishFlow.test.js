// @ts-check
/**
 * usePublishFlow.test.js — 单篇发布流程 composable 测试（Phase 4.3 TDD）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

const {
  mockPublishBatch,
  mockOnProgress,
  mockSensitiveCheck,
  mockOfflineStatus,
  mockOfflineAddToCache,
  mockSchedulerCreate,
  mockSchedulerCancel,
  mockCancelTask,
  mockShowNotification,
  mockStoreGetSetting,
  mockElMessage,
  mockElMessageBox,
} = vi.hoisted(function () {
  return {
    mockPublishBatch: vi.fn(),
    mockOnProgress: vi.fn(function () { return vi.fn() }),
    mockSensitiveCheck: vi.fn(),
    mockOfflineStatus: vi.fn(),
    mockOfflineAddToCache: vi.fn(),
    mockSchedulerCreate: vi.fn(),
    mockSchedulerCancel: vi.fn(),
    mockCancelTask: vi.fn(),
    mockShowNotification: vi.fn(),
    mockStoreGetSetting: vi.fn(),
    mockElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    mockElMessageBox: { confirm: vi.fn() },
  }
})

vi.mock('@/api/publisher', function () {
  return {
    publishBatch: mockPublishBatch,
    onProgress: mockOnProgress,
    sensitiveCheck: mockSensitiveCheck,
    offlineStatus: mockOfflineStatus,
    offlineAddToCache: mockOfflineAddToCache,
    schedulerCreate: mockSchedulerCreate,
    schedulerCancel: mockSchedulerCancel,
    cancelTask: mockCancelTask,
    showNotification: mockShowNotification,
    storeGetSetting: mockStoreGetSetting,
    batchCreate: vi.fn(),
  }
})

vi.mock('element-plus', function () {
  return {
    ElMessage: mockElMessage,
    ElMessageBox: mockElMessageBox,
  }
})

import { reactive, ref } from 'vue'
import { usePublishFlow } from '../composables/usePublishFlow'

describe('usePublishFlow — composable setup', () => {
  let article
  let selectedPlatforms
  let selectedAccounts
  let precheckEnabled

  beforeEach(() => {
    vi.clearAllMocks()
    article = reactive({ title: '', content: '', author: '', cover_url: '', video_path: '', publishTime: '' })
    selectedPlatforms = { value: ['wechat_mp'] }
    selectedAccounts = { value: { wechat_mp: 'acc1' } }
    precheckEnabled = { value: false }

    // 默认成功响应
    mockOnProgress.mockReturnValue(function () {})
    mockSensitiveCheck.mockResolvedValue({ code: 0, data: { words: [] } })
    mockOfflineStatus.mockResolvedValue({ code: 0, data: { offline: false } })
    mockOfflineAddToCache.mockResolvedValue({ code: 0 })
    mockPublishBatch.mockResolvedValue({ code: 0, data: { taskIds: ['t1'] }, message: 'ok' })
    mockSchedulerCreate.mockResolvedValue({ code: 0, data: { id: 'schedule-1' } })
    mockSchedulerCancel.mockResolvedValue({ code: 0, data: true })
    mockCancelTask.mockResolvedValue({ code: 0, data: true })
    mockShowNotification.mockResolvedValue({ code: 0 })
    mockElMessageBox.confirm.mockResolvedValue(undefined)
  })

  function createFlow() {
    return usePublishFlow({
      article,
      selectedPlatforms,
      selectedAccounts,
      precheckEnabled,
    })
  }

  it('返回响应式状态和方法', () => {
    const r = createFlow()
    expect(r.publishing).toBeDefined()
    expect(r.progress).toBeDefined()
    expect(r.result).toBeDefined()
    expect(r.copied).toBeDefined()
    expect(typeof r.handlePublish).toBe('function')
    expect(typeof r.copyUrl).toBe('function')
    expect(typeof r.addProgress).toBe('function')
    expect(typeof r.cancelPublish).toBe('function')
    expect(typeof r.retryPublish).toBe('function')
  })

  it('初始状态', () => {
    const r = createFlow()
    expect(r.publishing.value).toBe(false)
    expect(r.progress.value).toEqual([])
    expect(r.result.value).toBeNull()
    expect(r.copied.value).toBe(false)
  })

  // ─── handlePublish 验证 ───────────────────
  it('handlePublish 缺标题时警告', async () => {
    const r = createFlow()
    await r.handlePublish()
    expect(mockElMessage.warning).toHaveBeenCalledWith('请输入文章标题')
  })

  it('handlePublish 缺正文时警告', async () => {
    const r = createFlow()
    article.title = '有标题'
    await r.handlePublish()
    expect(mockElMessage.warning).toHaveBeenCalledWith('请输入正文内容')
  })

  it('handlePublish 成功发布', async () => {
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    await nextTick()
    expect(mockPublishBatch).toHaveBeenCalled()
    expect(r.result.value.success).toBe(true)
  })

  it('handlePublish API 失败时设置 result.success=false', async () => {
    mockPublishBatch.mockResolvedValueOnce({ code: 1, message: 'API 错误' })
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    await nextTick()
    expect(r.result.value.success).toBe(false)
    expect(r.result.value.message).toBe('API 错误')
  })

  it('handlePublish publishBatch 抛错时记录错误', async () => {
    mockPublishBatch.mockRejectedValueOnce(new Error('network error'))
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    await nextTick()
    expect(r.result.value.success).toBe(false)
    expect(r.result.value.message).toBe('network error')
  })

  // ─── 离线检测 ───────────────────────────
  it('离线时缓存任务并警告', async () => {
    mockOfflineStatus.mockResolvedValueOnce({ code: 0, data: { offline: true } })
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    await nextTick()
    expect(mockOfflineAddToCache).toHaveBeenCalled()
    expect(mockElMessage.warning).toHaveBeenCalledWith('网络已断开，任务已缓存')
    expect(r.publishing.value).toBe(false)
  })

  it('离线时不调用 publishBatch', async () => {
    mockOfflineStatus.mockResolvedValueOnce({ code: 0, data: { offline: true } })
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    await nextTick()
    expect(mockPublishBatch).not.toHaveBeenCalled()
  })

  it('离线缓存返回业务失败时进入错误路径并显示后端消息', async () => {
    mockOfflineStatus.mockResolvedValueOnce({ code: 0, data: { offline: true } })
    mockOfflineAddToCache.mockResolvedValueOnce({ code: -1, message: '缓存写入失败' })
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'

    await r.handlePublish()
    await nextTick()

    expect(r.result.value).toEqual({ success: false, message: '缓存写入失败' })
    expect(r.progress.value.at(-1)).toMatchObject({ type: 'danger' })
    expect(r.progress.value.at(-1).text).toContain('缓存写入失败')
    expect(mockElMessage.warning).not.toHaveBeenCalledWith('网络已断开，任务已缓存')
    expect(mockPublishBatch).not.toHaveBeenCalled()
  })

  // ─── 敏感词预检 ───────────────────────────
  it('敏感词检测发现敏感词时弹确认框', async () => {
    mockSensitiveCheck.mockResolvedValueOnce({ code: 0, data: { words: ['badword'] } })
    mockSensitiveCheck.mockResolvedValueOnce({ code: 0, data: { words: [] } })
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    expect(mockElMessageBox.confirm).toHaveBeenCalled()
  })

  it('敏感词检测用户取消时不发布', async () => {
    mockSensitiveCheck.mockResolvedValueOnce({ code: 0, data: { words: ['badword'] } })
    mockSensitiveCheck.mockResolvedValueOnce({ code: 0, data: { words: [] } })
    mockElMessageBox.confirm.mockRejectedValueOnce(new Error('cancel'))
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    expect(mockPublishBatch).not.toHaveBeenCalled()
  })

  it('敏感词检测用户确认时继续发布', async () => {
    mockSensitiveCheck.mockResolvedValueOnce({ code: 0, data: { words: ['badword'] } })
    mockSensitiveCheck.mockResolvedValueOnce({ code: 0, data: { words: [] } })
    mockElMessageBox.confirm.mockResolvedValueOnce(undefined)
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    await nextTick()
    expect(mockPublishBatch).toHaveBeenCalled()
  })

  // ─── Markdown 检测 ─────────────────────────
  it('Markdown 标题内容传 contentFormat=markdown', async () => {
    const r = createFlow()
    article.title = 'Markdown Test'
    article.content = '# Heading\n\n**bold** text and [link](https://example.com)'
    await r.handlePublish()
    expect(mockPublishBatch).toHaveBeenCalled()
    const data = mockPublishBatch.mock.calls[0][1]
    expect(data.contentFormat).toBe('markdown')
  })

  it('非 Markdown 内容传 contentFormat=html', async () => {
    const r = createFlow()
    article.title = 'Plain'
    article.content = 'Just plain text'
    await r.handlePublish()
    const data = mockPublishBatch.mock.calls[0][1]
    expect(data.contentFormat).toBe('html')
  })

  // ─── targets 构建 ─────────────────────────
  it('targets 从 selectedPlatforms + selectedAccounts 构建', async () => {
    selectedPlatforms.value = ['wechat_mp', 'zhihu']
    selectedAccounts.value = { wechat_mp: 'acc1', zhihu: 'acc2' }
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    const targets = mockPublishBatch.mock.calls[0][0]
    expect(targets).toEqual([
      { platform: 'wechat_mp', accountId: 'acc1' },
      { platform: 'zhihu', accountId: 'acc2' },
    ])
  })

  it('targets accountId 缺失时为 null', async () => {
    selectedPlatforms.value = ['wechat_mp']
    selectedAccounts.value = {}
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    const targets = mockPublishBatch.mock.calls[0][0]
    expect(targets).toEqual([{ platform: 'wechat_mp', accountId: null }])
  })

  it('同一平台多个账号会展开成多个发布目标', async () => {
    selectedAccounts.value = { wechat_mp: ['acc1', 'acc2'] }
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'

    await r.handlePublish()

    expect(mockPublishBatch.mock.calls[0][0]).toEqual([
      { platform: 'wechat_mp', accountId: 'acc1' },
      { platform: 'wechat_mp', accountId: 'acc2' },
    ])
  })

  it('有合法发布时间时为每个目标创建持久化定时任务', async () => {
    article.title = '定时文章'
    article.content = '正文'
    article.publishTime = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    selectedAccounts.value = { wechat_mp: ['acc1', 'acc2'] }
    const r = createFlow()

    await r.handlePublish()

    expect(mockSchedulerCreate).toHaveBeenCalledTimes(2)
    expect(mockPublishBatch).not.toHaveBeenCalled()
    expect(mockSchedulerCreate.mock.calls[0][0]).toMatchObject({
      platform: 'wechat_mp',
      publishTime: article.publishTime,
      article: expect.objectContaining({ accountId: 'acc1' }),
    })
    expect(r.result.value.success).toBe(true)
  })

  it('非法定时发布时间会在 IPC 前阻止提交', async () => {
    article.title = '定时文章'
    article.content = '正文'
    article.publishTime = 'not-a-date'
    const r = createFlow()

    await r.handlePublish()

    expect(mockSchedulerCreate).not.toHaveBeenCalled()
    expect(mockPublishBatch).not.toHaveBeenCalled()
    expect(r.result.value).toMatchObject({ success: false })
    expect(r.progress.value.at(-1).text).toContain('定时发布时间无效')
  })

  it('取消活动任务并支持失败后重试', async () => {
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    await r.cancelPublish()
    expect(mockCancelTask).toHaveBeenCalledWith('t1')

    mockPublishBatch.mockResolvedValueOnce({ code: 1, message: '首次失败' })
    await r.handlePublish()
    await r.retryPublish()
    expect(mockPublishBatch).toHaveBeenCalledTimes(3)
  })

  // ─── addProgress ──────────────────────────
  it('addProgress 追加进度条目', () => {
    const r = createFlow()
    expect(r.progress.value).toHaveLength(0)
    r.addProgress('test message', 'success')
    expect(r.progress.value).toHaveLength(1)
    expect(r.progress.value[0].text).toBe('test message')
    expect(r.progress.value[0].type).toBe('success')
    expect(r.progress.value[0].time).toBeTruthy()
  })

  it('addProgress 默认 type=primary', () => {
    const r = createFlow()
    r.addProgress('default')
    expect(r.progress.value[0].type).toBe('primary')
  })

  // ─── copyUrl ──────────────────────────────
  it('copyUrl 调用 clipboard.writeText', async () => {
    const clip = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: clip }, writable: true, configurable: true })
    const r = createFlow()
    await r.copyUrl('https://x.com/a')
    expect(clip).toHaveBeenCalledWith('https://x.com/a')
    expect(r.copied.value).toBe(true)
  })

  it('copyUrl 失败时使用 fallback', async () => {
    const clip = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: clip }, writable: true, configurable: true })
    const exec = vi.fn()
    document.execCommand = exec
    const r = createFlow()
    await r.copyUrl('https://x.com/b')
    expect(exec).toHaveBeenCalledWith('copy')
    expect(r.copied.value).toBe(true)
  })

  // ─── publishing 状态 ──────────────────────
  it('handlePublish 成功后 publishing=false', async () => {
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    expect(r.publishing.value).toBe(false)
  })

  it('handlePublish 失败后 publishing=false', async () => {
    mockPublishBatch.mockRejectedValueOnce(new Error('fail'))
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    expect(r.publishing.value).toBe(false)
  })

  // ─── precheckEnabled 透传 ───────────────
  it('data.precheck 从 precheckEnabled.value 读取', async () => {
    precheckEnabled.value = true
    const r = createFlow()
    article.title = 'Test'
    article.content = 'Content'
    await r.handlePublish()
    const data = mockPublishBatch.mock.calls[0][1]
    expect(data.precheck).toBe(true)
  })

  // ─── 核心流程边界与资源清理 ───────────────
  it('空白标题会在任何预检或发布调用前被拦截', async () => {
    const r = createFlow()
    article.title = '   '
    article.content = '正文'

    await r.handlePublish()

    expect(mockElMessage.warning).toHaveBeenCalledWith('请输入文章标题')
    expect(mockSensitiveCheck).not.toHaveBeenCalled()
    expect(mockOfflineStatus).not.toHaveBeenCalled()
    expect(mockPublishBatch).not.toHaveBeenCalled()
  })

  it('空白正文会在任何预检或发布调用前被拦截', async () => {
    const r = createFlow()
    article.title = '标题'
    article.content = '\n  \t'

    await r.handlePublish()

    expect(mockElMessage.warning).toHaveBeenCalledWith('请输入正文内容')
    expect(mockSensitiveCheck).not.toHaveBeenCalled()
    expect(mockOfflineStatus).not.toHaveBeenCalled()
    expect(mockPublishBatch).not.toHaveBeenCalled()
  })

  it('未选择发布平台时在预检前拦截', async () => {
    selectedPlatforms.value = []
    const r = createFlow()
    article.title = '标题'
    article.content = '正文'

    await r.handlePublish()

    expect(mockElMessage.warning).toHaveBeenCalledWith('请选择至少一个发布平台')
    expect(mockSensitiveCheck).not.toHaveBeenCalled()
    expect(mockOfflineStatus).not.toHaveBeenCalled()
    expect(mockPublishBatch).not.toHaveBeenCalled()
    expect(r.publishing.value).toBe(false)
  })

  it('敏感词接口缺少 data 时按无敏感词处理', async () => {
    mockSensitiveCheck.mockResolvedValue({ code: 0 })
    const r = createFlow()
    article.title = '标题'
    article.content = '正文'

    await expect(r.handlePublish()).resolves.toBeUndefined()

    expect(mockElMessageBox.confirm).not.toHaveBeenCalled()
    expect(mockPublishBatch).toHaveBeenCalledTimes(1)
  })

  it('离线接口返回空对象时继续在线发布', async () => {
    mockOfflineStatus.mockResolvedValueOnce({})
    const r = createFlow()
    article.title = '标题'
    article.content = '正文'

    await expect(r.handlePublish()).resolves.toBeUndefined()

    expect(mockOfflineAddToCache).not.toHaveBeenCalled()
    expect(mockPublishBatch).toHaveBeenCalledTimes(1)
  })

  it('发布接口返回空对象时生成可展示的失败结果', async () => {
    mockPublishBatch.mockResolvedValueOnce({})
    const r = createFlow()
    article.title = '标题'
    article.content = '正文'

    await expect(r.handlePublish()).resolves.toBeUndefined()

    expect(r.result.value).toEqual({ success: false, message: '发布失败' })
    expect(r.progress.value.at(-1).text).toContain('发布失败')
    expect(r.progress.value.at(-1)).toMatchObject({ type: 'danger' })
    expect(r.publishing.value).toBe(false)
  })

  it('发布成功后只释放一次进度订阅', async () => {
    const unsubscribe = vi.fn()
    mockOnProgress.mockReturnValueOnce(unsubscribe)
    const r = createFlow()
    article.title = '标题'
    article.content = '正文'

    await r.handlePublish()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('发布抛错后仍只释放一次进度订阅', async () => {
    const unsubscribe = vi.fn()
    mockOnProgress.mockReturnValueOnce(unsubscribe)
    mockPublishBatch.mockRejectedValueOnce(new Error('IPC 不可用'))
    const r = createFlow()
    article.title = '标题'
    article.content = '正文'

    await r.handlePublish()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(r.result.value).toEqual({ success: false, message: 'IPC 不可用' })
  })

  it('只透传有实际差异内容的平台覆盖项', async () => {
    const diffEdits = {
      wechat_mp: { title: '微信标题', content: '' },
      zhihu: { title: '', content: '' },
      douyin: null,
    }
    const r = usePublishFlow({
      article,
      selectedPlatforms,
      selectedAccounts,
      precheckEnabled,
      diffEdits,
    })
    article.title = '标题'
    article.content = '正文'

    await r.handlePublish()

    expect(mockPublishBatch.mock.calls[0][1].platformOverrides).toEqual({
      wechat_mp: { title: '微信标题', content: '' },
    })
  })

  it('在线发布时传入 IPC 的响应式载荷可结构化克隆', async () => {
    selectedPlatforms = ref(['wechat_mp'])
    selectedAccounts = ref({ wechat_mp: 'acc1' })
    const diffEdits = reactive({
      wechat_mp: { title: '微信标题', content: '微信正文' },
    })
    mockPublishBatch.mockImplementationOnce(async function (targets, data) {
      expect(function () { structuredClone(targets) }).not.toThrow()
      expect(function () { structuredClone(data) }).not.toThrow()
      return { code: 0, data: { taskIds: ['t1'] }, message: 'ok' }
    })
    const r = usePublishFlow({
      article,
      selectedPlatforms,
      selectedAccounts,
      precheckEnabled,
      diffEdits,
    })
    article.title = '标题'
    article.content = '正文'

    await r.handlePublish()

    expect(mockPublishBatch).toHaveBeenCalledTimes(1)
  })

  it('离线缓存时传入 IPC 的响应式载荷可结构化克隆', async () => {
    selectedPlatforms = ref(['wechat_mp'])
    selectedAccounts = ref({ wechat_mp: 'acc1' })
    mockOfflineStatus.mockResolvedValueOnce({ code: 0, data: { offline: true } })
    mockOfflineAddToCache.mockImplementationOnce(async function (payload) {
      expect(function () { structuredClone(payload) }).not.toThrow()
      return { code: 0 }
    })
    const r = createFlow()
    article.title = '标题'
    article.content = '正文'

    await r.handlePublish()

    expect(mockOfflineAddToCache).toHaveBeenCalledTimes(1)
    expect(mockPublishBatch).not.toHaveBeenCalled()
  })

  it.each([
    ['标题敏感词检查', function () {
      mockSensitiveCheck.mockRejectedValueOnce(new Error('标题检查失败'))
    }, '标题检查失败'],
    ['正文敏感词检查', function () {
      mockSensitiveCheck
        .mockResolvedValueOnce({ code: 0, data: { words: [] } })
        .mockRejectedValueOnce(new Error('正文检查失败'))
    }, '正文检查失败'],
    ['离线状态检查', function () {
      mockOfflineStatus.mockRejectedValueOnce(new Error('离线检查失败'))
    }, '离线检查失败'],
    ['离线缓存', function () {
      mockOfflineStatus.mockResolvedValueOnce({ code: 0, data: { offline: true } })
      mockOfflineAddToCache.mockRejectedValueOnce(new Error('缓存失败'))
    }, '缓存失败'],
  ])('%s 异常时生成稳定失败结果且不向调用方抛错', async (_name, configure, message) => {
    configure()
    const r = createFlow()
    article.title = '标题'
    article.content = '正文'

    await expect(r.handlePublish()).resolves.toBeUndefined()

    expect(r.result.value).toEqual({ success: false, message })
    expect(r.progress.value.at(-1)).toMatchObject({ type: 'danger' })
    expect(r.publishing.value).toBe(false)
    expect(mockPublishBatch).not.toHaveBeenCalled()
  })
})
