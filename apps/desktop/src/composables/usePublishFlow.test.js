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

import { reactive } from 'vue'
import { usePublishFlow } from '../composables/usePublishFlow'

describe('usePublishFlow — composable setup', () => {
  let article
  let selectedPlatforms
  let selectedAccounts
  let precheckEnabled

  beforeEach(() => {
    vi.clearAllMocks()
    article = reactive({ title: '', content: '', author: '', cover_url: '', video_path: '' })
    selectedPlatforms = { value: ['wechat_mp'] }
    selectedAccounts = { value: { wechat_mp: 'acc1' } }
    precheckEnabled = { value: false }

    // 默认成功响应
    mockOnProgress.mockReturnValue(function () {})
    mockSensitiveCheck.mockResolvedValue({ code: 0, data: { words: [] } })
    mockOfflineStatus.mockResolvedValue({ code: 0, data: { offline: false } })
    mockOfflineAddToCache.mockResolvedValue({ code: 0 })
    mockPublishBatch.mockResolvedValue({ code: 0, data: { taskIds: ['t1'] }, message: 'ok' })
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
})
