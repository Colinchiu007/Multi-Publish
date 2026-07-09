// @ts-check
/**
 * useBatchPublish.test.js — 批量发布 composable 测试（Phase 4.3 TDD）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

const {
  mockBatchCreate,
  mockOnProgress,
  mockElMessage,
  mockElMessageBox,
} = vi.hoisted(function () {
  return {
    mockBatchCreate: vi.fn(),
    mockOnProgress: vi.fn(function () { return vi.fn() }),
    mockElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    mockElMessageBox: { confirm: vi.fn() },
  }
})

vi.mock('@/api/publisher', function () {
  return {
    batchCreate: mockBatchCreate,
    onProgress: mockOnProgress,
    // 其他 API 不用，但需要导出避免 import 错误
    publishBatch: vi.fn(),
    sensitiveCheck: vi.fn(),
    storeGetSetting: vi.fn(),
    offlineStatus: vi.fn(),
    offlineAddToCache: vi.fn(),
  }
})

vi.mock('element-plus', function () {
  return {
    ElMessage: mockElMessage,
    ElMessageBox: mockElMessageBox,
  }
})

import { reactive } from 'vue'
import { useBatchPublish } from '../composables/useBatchPublish'

describe('useBatchPublish — composable setup', () => {
  let originalElectronAPI
  let article
  let licenseStore

  beforeEach(() => {
    originalElectronAPI = window.electronAPI
    vi.clearAllMocks()
    article = reactive({ title: '', content: '' })
    licenseStore = { isPro: true }
    window.electronAPI = {
      batchSchedule: vi.fn(function () { return Promise.resolve() }),
      batchExecute: vi.fn(function () { return Promise.resolve() }),
      onBatchProgress: vi.fn(function () { return vi.fn() }),
    }
  })

  afterEach(() => {
    window.electronAPI = originalElectronAPI
  })

  it('返回响应式状态和方法', () => {
    const r = useBatchPublish({ article, licenseStore })
    expect(r.batchMode).toBeDefined()
    expect(r.articles).toBeDefined()
    expect(r.batchProgress).toBeDefined()
    expect(r.templateTargetIdx).toBeDefined()
    expect(r.showTemplatePicker).toBeDefined()
    expect(r.precheckEnabled).toBeDefined()
    expect(r.batchDone).toBeDefined()
    expect(r.batchFail).toBeDefined()
    expect(r.totalPlatformTasks).toBeDefined()
    expect(typeof r.addArticle).toBe('function')
    expect(typeof r.removeArticle).toBe('function')
    expect(typeof r.duplicateArticle).toBe('function')
    expect(typeof r.handleBatchPublish).toBe('function')
    expect(typeof r.applyTemplate).toBe('function')
    expect(typeof r.checkBatchAccess).toBe('function')
  })

  it('初始状态', () => {
    const r = useBatchPublish({ article, licenseStore })
    expect(r.batchMode.value).toBe(false)
    expect(r.articles.value).toEqual([])
    expect(r.batchProgress.value).toEqual([])
    expect(r.templateTargetIdx.value).toBe(-1)
    expect(r.showTemplatePicker.value).toBe(false)
    expect(r.precheckEnabled.value).toBe(false)
    expect(r.batchDone.value).toBe(0)
    expect(r.batchFail.value).toBe(0)
    expect(r.totalPlatformTasks.value).toBe(0)
  })

  // ─── addArticle / removeArticle / duplicateArticle ────
  it('addArticle 添加空文章', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.addArticle()
    expect(r.articles.value).toHaveLength(1)
    expect(r.articles.value[0].title).toBe('')
    expect(r.articles.value[0].content).toBe('')
    expect(r.articles.value[0].platforms).toEqual([])
    expect(r.articles.value[0]._key).toBeTruthy()
  })

  it('addArticle 多次添加生成不同 _key', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.addArticle()
    r.addArticle()
    expect(r.articles.value).toHaveLength(2)
    expect(r.articles.value[0]._key).not.toBe(r.articles.value[1]._key)
  })

  it('removeArticle 按索引删除', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.addArticle()
    r.addArticle()
    r.removeArticle(0)
    expect(r.articles.value).toHaveLength(1)
  })

  it('removeArticle 越界不报错', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.addArticle()
    expect(function () { r.removeArticle(999) }).not.toThrow()
    expect(r.articles.value).toHaveLength(1)
  })

  it('duplicateArticle 复制文章', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.addArticle()
    r.articles.value[0].title = '原标题'
    r.duplicateArticle(0)
    expect(r.articles.value).toHaveLength(2)
    expect(r.articles.value[1].title).toBe('原标题 (复制)')
    expect(r.articles.value[1]._key).not.toBe(r.articles.value[0]._key)
  })

  it('duplicateArticle publishTime 清空', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.addArticle()
    r.articles.value[0].publishTime = '2026-01-01T10:00'
    r.duplicateArticle(0)
    expect(r.articles.value[1].publishTime).toBe('')
  })

  // ─── batchDone / batchFail / totalPlatformTasks ────
  it('batchDone 统计成功数量', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.batchProgress.value = [
      { type: 'success' }, { type: 'danger' }, { type: 'success' },
    ]
    expect(r.batchDone.value).toBe(2)
  })

  it('batchFail 统计失败数量', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.batchProgress.value = [
      { type: 'success' }, { type: 'danger' }, { type: 'danger' },
    ]
    expect(r.batchFail.value).toBe(2)
  })

  it('totalPlatformTasks 统计所有文章平台数', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [
      { platforms: ['wx', 'zhihu'] },
      { platforms: ['douyin'] },
    ]
    expect(r.totalPlatformTasks.value).toBe(3)
  })

  it('totalPlatformTasks 无 platforms 视为 0', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{}, { platforms: ['wx'] }]
    expect(r.totalPlatformTasks.value).toBe(1)
  })

  // ─── applyTemplate ────────────────────────────
  it('applyTemplate 单篇模式（batchMode=false）填充 article', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.applyTemplate({ title: 'T', content: 'C' })
    expect(article.title).toBe('T')
    expect(article.content).toBe('C')
  })

  it('applyTemplate 批量模式填充指定文章', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    r.addArticle()
    r.templateTargetIdx.value = 0
    r.applyTemplate({ title: '批量T', content: '批量C' })
    expect(r.articles.value[0].title).toBe('批量T')
    expect(r.articles.value[0].content).toBe('批量C')
  })

  it('applyTemplate 批量模式关闭模板选择器', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.showTemplatePicker.value = true
    r.applyTemplate({ title: 'T', content: 'C' })
    expect(r.showTemplatePicker.value).toBe(false)
  })

  // ─── checkBatchAccess ────────────────────────
  it('checkBatchAccess 非 Pro 用户禁止批量模式', () => {
    licenseStore.isPro = false
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    r.checkBatchAccess()
    expect(r.batchMode.value).toBe(false)
  })

  it('checkBatchAccess Pro 用户允许批量模式', () => {
    licenseStore.isPro = true
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    r.checkBatchAccess()
    expect(r.batchMode.value).toBe(true)
  })

  it('checkBatchAccess batchMode=false 时不检查', () => {
    licenseStore.isPro = false
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = false
    r.checkBatchAccess()
    expect(r.batchMode.value).toBe(false)
  })

  // ─── watch batchMode ─────────────────────────
  it('batchMode 切换为 true 时自动 addArticle（articles 为空）', async () => {
    const r = useBatchPublish({ article, licenseStore })
    expect(r.articles.value).toHaveLength(0)
    r.batchMode.value = true
    await nextTick()
    expect(r.articles.value).toHaveLength(1)
  })

  it('batchMode 切换为 true 时 articles 非空不自动添加', async () => {
    const r = useBatchPublish({ article, licenseStore })
    r.addArticle()
    r.batchMode.value = true
    await nextTick()
    expect(r.articles.value).toHaveLength(1)
  })

  // ─── handleBatchPublish ──────────────────────
  it('handleBatchPublish 文章缺标题时警告', async () => {
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    await nextTick()
    r.addArticle()
    // 文章无标题
    await r.handleBatchPublish()
    expect(mockElMessage.warning).toHaveBeenCalled()
  })

  it('handleBatchPublish 文章缺正文时警告', async () => {
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    await nextTick()
    r.addArticle()
    r.articles.value[0].title = '有标题'
    await r.handleBatchPublish()
    expect(mockElMessage.warning).toHaveBeenCalled()
  })

  it('handleBatchPublish 文章缺平台时警告', async () => {
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    await nextTick()
    r.addArticle()
    r.articles.value[0].title = '标题'
    r.articles.value[0].content = '正文'
    await r.handleBatchPublish()
    expect(mockElMessage.warning).toHaveBeenCalled()
  })

  it('handleBatchPublish 成功创建批量任务（无定时）', async () => {
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.batchExecute.mockResolvedValueOnce(undefined)
    window.electronAPI.onBatchProgress.mockReturnValueOnce(function () {})
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    await nextTick()
    // watch batchMode=true 已自动 addArticle
    r.articles.value[0].title = '标题'
    r.articles.value[0].content = '正文'
    r.articles.value[0].platforms = ['wechat_mp']
    await r.handleBatchPublish()
    expect(mockBatchCreate).toHaveBeenCalledTimes(1)
    expect(window.electronAPI.batchExecute).toHaveBeenCalledWith('batch1')
    expect(r.batchProgress.value.length).toBeGreaterThan(0)
  })

  it('handleBatchPublish 有定时时调用 batchSchedule', async () => {
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.batchSchedule.mockResolvedValueOnce(undefined)
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    await nextTick()
    r.articles.value[0].title = '标题'
    r.articles.value[0].content = '正文'
    r.articles.value[0].platforms = ['wechat_mp']
    r.articles.value[0].publishTime = '2026-01-01T10:00'
    await r.handleBatchPublish()
    expect(window.electronAPI.batchSchedule).toHaveBeenCalledWith('batch1')
  })

  it('handleBatchPublish batchCreate 失败时记录错误', async () => {
    mockBatchCreate.mockResolvedValueOnce({ code: 1, message: '创建失败' })
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    await nextTick()
    r.articles.value[0].title = '标题'
    r.articles.value[0].content = '正文'
    r.articles.value[0].platforms = ['wechat_mp']
    await r.handleBatchPublish()
    expect(r.batchProgress.value.some(function (p) { return p.type === 'danger' })).toBe(true)
  })

  it('handleBatchPublish batchCreate 抛错时记录错误', async () => {
    mockBatchCreate.mockRejectedValueOnce(new Error('网络错误'))
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    await nextTick()
    r.articles.value[0].title = '标题'
    r.articles.value[0].content = '正文'
    r.articles.value[0].platforms = ['wechat_mp']
    await r.handleBatchPublish()
    expect(r.batchProgress.value.some(function (p) { return p.type === 'danger' })).toBe(true)
  })
})
