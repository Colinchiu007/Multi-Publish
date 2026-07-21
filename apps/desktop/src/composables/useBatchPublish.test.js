// @ts-check
/**
 * useBatchPublish.test.js — 批量发布 composable 测试（Phase 4.3 TDD）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'

const {
  mockBatchCreate,
  mockRetryTask,
  mockOnProgress,
  mockElMessage,
  mockElMessageBox,
} = vi.hoisted(function () {
  return {
    mockBatchCreate: vi.fn(),
    mockRetryTask: vi.fn(),
    mockOnProgress: vi.fn(function () { return vi.fn() }),
    mockElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
    mockElMessageBox: { confirm: vi.fn() },
  }
})

vi.mock('@/api/publisher', function () {
  return {
    batchCreate: mockBatchCreate,
    retryTask: mockRetryTask,
    onProgress: mockOnProgress,
    batchExecute: (...args) => window.electronAPI?.batchExecute?.(...args),
    batchSchedule: (...args) => window.electronAPI?.batchSchedule?.(...args),
    batchGet: (...args) => window.electronAPI?.batchGet?.(...args),
    onBatchProgress: (callback) => window.electronAPI?.onBatchProgress?.(callback),
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

function futurePublishTime (minutes = 10) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

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
      batchSchedule: vi.fn(function () { return Promise.resolve({ code: 0 }) }),
      batchExecute: vi.fn(function () { return Promise.resolve({ code: 0 }) }),
      onBatchProgress: vi.fn(function () { return vi.fn() }),
    }
  })

  afterEach(() => {
    vi.useRealTimers()
    window.electronAPI = originalElectronAPI
  })

  it('返回响应式状态和方法', () => {
    const r = useBatchPublish({ article, licenseStore })
    expect(r.batchMode).toBeDefined()
    expect(r.batchPublishing).toBeDefined()
    expect(r.articles).toBeDefined()
    expect(r.batchProgress).toBeDefined()
    expect(r.templateTargetIdx).toBeDefined()
    expect(r.showTemplatePicker).toBeDefined()
    expect(r.precheckEnabled).toBeDefined()
    expect(r.batchDone).toBeDefined()
    expect(r.batchFail).toBeDefined()
    expect(r.totalPlatformTasks).toBeDefined()
    expect(r.failedBatchTasks).toBeDefined()
    expect(r.retryingFailed).toBeDefined()
    expect(typeof r.addArticle).toBe('function')
    expect(typeof r.removeArticle).toBe('function')
    expect(typeof r.duplicateArticle).toBe('function')
    expect(typeof r.handleBatchPublish).toBe('function')
    expect(typeof r.retryFailedBatch).toBe('function')
    expect(typeof r.applyTemplate).toBe('function')
    expect(typeof r.checkBatchAccess).toBe('function')
    expect(typeof r.toggleBatchAccount).toBe('function')
    expect(typeof r.isBatchAccountSelected).toBe('function')
  })

  it('初始状态', () => {
    const r = useBatchPublish({ article, licenseStore })
    expect(r.batchMode.value).toBe(false)
    expect(r.batchPublishing.value).toBe(false)
    expect(r.articles.value).toEqual([])
    expect(r.batchProgress.value).toEqual([])
    expect(r.templateTargetIdx.value).toBe(-1)
    expect(r.showTemplatePicker.value).toBe(false)
    expect(r.precheckEnabled.value).toBe(false)
    expect(r.batchDone.value).toBe(0)
    expect(r.batchFail.value).toBe(0)
    expect(r.totalPlatformTasks.value).toBe(0)
    expect(r.failedBatchTasks.value).toEqual([])
    expect(r.retryingFailed.value).toBe(false)
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
    r.articles.value[0].publishTime = futurePublishTime()
    r.duplicateArticle(0)
    expect(r.articles.value[1].publishTime).toBe('')
  })

  it('批量文章账号选择支持多选和再次点击取消', () => {
    const r = useBatchPublish({ article, licenseStore })
    const item = { accounts: { wechat_mp: ['wx-a'] } }

    r.toggleBatchAccount(item, 'wechat_mp', 'wx-b')
    expect(item.accounts.wechat_mp).toEqual(['wx-a', 'wx-b'])
    expect(r.isBatchAccountSelected(item, 'wechat_mp', 'wx-b')).toBe(true)

    r.toggleBatchAccount(item, 'wechat_mp', 'wx-a')
    expect(item.accounts.wechat_mp).toEqual(['wx-b'])
    expect(r.isBatchAccountSelected(item, 'wechat_mp', 'wx-a')).toBe(false)
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

  it('totalPlatformTasks 按平台账号目标展开', () => {
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{
      platforms: ['wechat_mp', 'zhihu'],
      accounts: { wechat_mp: ['wx-a', 'wx-b'], zhihu: ['zh-a'] },
    }]
    expect(r.totalPlatformTasks.value).toBe(3)
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

  it('校验期间发生重入时只执行一次校验，并在结束后释放锁', async () => {
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '', content: '正文', platforms: ['wechat_mp'] }]
    let nestedPublish
    mockElMessage.warning.mockImplementationOnce(function () {
      expect(r.batchPublishing.value).toBe(true)
      nestedPublish = r.handleBatchPublish()
    })

    await r.handleBatchPublish()
    await nestedPublish

    expect(mockElMessage.warning).toHaveBeenCalledTimes(1)
    expect(mockBatchCreate).not.toHaveBeenCalled()
    expect(r.batchPublishing.value).toBe(false)
  })

  it('发布前展示任务数确认，取消后不创建批次', async () => {
    mockElMessageBox.confirm.mockRejectedValueOnce(new Error('cancel'))
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['wechat_mp', 'zhihu'] }]

    await r.handleBatchPublish()

    expect(mockElMessageBox.confirm).toHaveBeenCalledWith(
      '即将发布 1 篇内容，共 2 个平台账号任务。请确认各平台表单信息完整。',
      '确认批量发布',
      expect.objectContaining({ confirmButtonText: '确认发布', cancelButtonText: '取消' }),
    )
    expect(mockBatchCreate).not.toHaveBeenCalled()
    expect(r.batchPublishing.value).toBe(false)
  })

  it('从创建挂起到批次终态期间始终忽略重复发布', async () => {
    let resolveCreate
    let emitBatchProgress
    mockBatchCreate.mockImplementationOnce(function () {
      return new Promise(function (resolve) { resolveCreate = resolve })
    })
    window.electronAPI.onBatchProgress.mockImplementationOnce(function (callback) {
      emitBatchProgress = callback
      return vi.fn()
    })
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['wechat_mp'] }]

    const firstPublish = r.handleBatchPublish()
    expect(r.batchPublishing.value).toBe(true)
    const secondPublish = r.handleBatchPublish()
    await secondPublish

    expect(mockBatchCreate).toHaveBeenCalledTimes(1)
    expect(window.electronAPI.batchExecute).not.toHaveBeenCalled()

    resolveCreate({ code: 0, data: { id: 'batch1' } })
    await firstPublish

    expect(window.electronAPI.batchExecute).toHaveBeenCalledTimes(1)
    expect(r.batchPublishing.value).toBe(true)

    await r.handleBatchPublish()
    expect(mockBatchCreate).toHaveBeenCalledTimes(1)
    expect(window.electronAPI.batchExecute).toHaveBeenCalledTimes(1)

    emitBatchProgress({
      kind: 'batch-complete',
      batchId: 'batch1',
      total: 1,
      completed: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(r.batchPublishing.value).toBe(false)
  })

  it.each([
    {
      name: '创建业务失败',
      arrange: function () {
        mockBatchCreate.mockResolvedValueOnce({ code: 1, message: '创建失败' })
      },
    },
    {
      name: '执行业务失败',
      arrange: function () {
        mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
        window.electronAPI.batchExecute.mockResolvedValueOnce({ code: 1, message: '执行失败' })
      },
    },
    {
      name: '同步异常',
      arrange: function () {
        mockOnProgress.mockImplementationOnce(function () { throw new Error('同步异常') })
      },
    },
  ])('$name 后释放批量执行锁', async ({ arrange }) => {
    arrange()
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['wechat_mp'] }]

    await r.handleBatchPublish()

    expect(r.batchPublishing.value).toBe(false)
  })
  it('取消全局进度订阅抛错时不掩盖已提交批次并保持锁到终态', async () => {
    let emitBatchProgress
    mockOnProgress.mockReturnValueOnce(function () {
      throw new Error('取消订阅失败')
    })
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.onBatchProgress.mockImplementationOnce(function (callback) {
      emitBatchProgress = callback
      return vi.fn()
    })
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['wechat_mp'] }]

    await expect(r.handleBatchPublish()).resolves.toBeUndefined()

    expect(r.batchPublishing.value).toBe(true)
    emitBatchProgress({
      kind: 'batch-complete',
      batchId: 'batch1',
      total: 1,
      completed: 1,
      succeeded: 1,
      failed: 0,
    })

    expect(r.batchPublishing.value).toBe(false)
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

  it('批量文章引用已失效账号时在创建批次前阻止发布', async () => {
    const r = useBatchPublish({ article, licenseStore, isAccountAvailable: () => false })
    r.articles.value = [{
      title: '标题',
      content: '正文',
      platforms: ['wechat_mp'],
      accounts: { wechat_mp: ['deleted-account'] },
    }]

    await r.handleBatchPublish()

    expect(mockElMessage.warning).toHaveBeenCalledWith('批量文章中有账号已失效，请重新选择发布账号')
    expect(mockElMessageBox.confirm).not.toHaveBeenCalled()
    expect(mockBatchCreate).not.toHaveBeenCalled()
  })

  it('handleBatchPublish 成功创建批量任务（无定时）', async () => {
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.batchExecute.mockResolvedValueOnce({ code: 0 })
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
    window.electronAPI.batchSchedule.mockResolvedValueOnce({ code: 0 })
    const r = useBatchPublish({ article, licenseStore })
    r.batchMode.value = true
    await nextTick()
    r.articles.value[0].title = '标题'
    r.articles.value[0].content = '正文'
    r.articles.value[0].platforms = ['wechat_mp']
    r.articles.value[0].publishTime = futurePublishTime()
    await r.handleBatchPublish()
    expect(window.electronAPI.batchSchedule).toHaveBeenCalledWith('batch1')
  })

  it('排期接口返回业务失败时显示后端消息且不提示已排期', async () => {
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.batchSchedule.mockResolvedValueOnce({
      code: -1,
      message: '排期失败：任务不存在',
    })
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{
      title: '标题',
      content: '正文',
      platforms: ['wechat_mp'],
      publishTime: futurePublishTime(),
    }]

    await r.handleBatchPublish()

    expect(r.batchProgress.value.at(-1)).toMatchObject({ type: 'danger' })
    expect(r.batchProgress.value.at(-1).text).toContain('排期失败：任务不存在')
    expect(r.batchProgress.value.some(function (item) { return item.text.includes('已排期') })).toBe(false)
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

  it('空白标题会被拦截且不会创建批次', async () => {
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '  ', content: '正文', platforms: ['wechat_mp'] }]

    await r.handleBatchPublish()

    expect(mockElMessage.warning).toHaveBeenCalledWith('有文章缺少标题')
    expect(mockBatchCreate).not.toHaveBeenCalled()
    expect(mockOnProgress).not.toHaveBeenCalled()
  })

  it('空白正文会被拦截且不会创建批次', async () => {
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '\n  ', platforms: ['wechat_mp'] }]

    await r.handleBatchPublish()

    expect(mockElMessage.warning).toHaveBeenCalledWith('有文章缺少正文')
    expect(mockBatchCreate).not.toHaveBeenCalled()
    expect(mockOnProgress).not.toHaveBeenCalled()
  })

  it('创建批次时精确透传文章、排期和预检配置', async () => {
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    const r = useBatchPublish({ article, licenseStore })
    r.precheckEnabled.value = true
    const publishTime = futurePublishTime()
    r.articles.value = [{
      _key: 'ui-only',
      title: '标题',
      content: '正文',
      platforms: ['wechat_mp', 'zhihu'],
      publishTime,
    }]

    await r.handleBatchPublish()

    expect(mockBatchCreate).toHaveBeenCalledTimes(1)
    expect(mockBatchCreate.mock.calls[0][0].articles).toEqual([{
      title: '标题',
      content: '正文',
      platforms: ['wechat_mp', 'zhihu'],
      publishTime,
      precheck: true,
      author: '',
      cover_url: '',
      video_path: '',
    }])
    expect(window.electronAPI.batchSchedule).toHaveBeenCalledWith('batch1')
    expect(window.electronAPI.batchExecute).not.toHaveBeenCalled()
  })

  it('创建批次时透传多账号目标', async () => {
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{
      title: '标题',
      content: '正文',
      platforms: ['wechat_mp'],
      accounts: { wechat_mp: ['wx-a', 'wx-b'] },
      publishTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }]

    await r.handleBatchPublish()

    expect(mockBatchCreate.mock.calls[0][0].articles[0].platforms).toEqual([
      { platform: 'wechat_mp', accountId: 'wx-a' },
      { platform: 'wechat_mp', accountId: 'wx-b' },
    ])
  })

  it('创建批次时传入 IPC 的嵌套文章数据可结构化克隆', async () => {
    mockBatchCreate.mockImplementationOnce(async function (payload) {
      expect(function () { structuredClone(payload) }).not.toThrow()
      return { code: 0, data: { id: 'batch1' } }
    })
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{
      title: '标题',
      content: '正文',
      platforms: ['wechat_mp', 'zhihu'],
      publishTime: futurePublishTime(),
    }]

    await r.handleBatchPublish()

    expect(mockBatchCreate).toHaveBeenCalledTimes(1)
  })

  it('批次响应缺少 data 时记录失败并释放全局进度订阅', async () => {
    const unsubscribe = vi.fn()
    mockOnProgress.mockReturnValueOnce(unsubscribe)
    mockBatchCreate.mockResolvedValueOnce({ code: 0 })
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['wechat_mp'] }]

    await expect(r.handleBatchPublish()).resolves.toBeUndefined()

    expect(r.batchProgress.value.at(-1)).toMatchObject({ type: 'danger' })
    expect(r.batchProgress.value.at(-1).text).toContain('批量发布失败')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('Electron API 缺失时记录失败而不是向调用方抛错', async () => {
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI = undefined
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['wechat_mp'] }]

    await expect(r.handleBatchPublish()).resolves.toBeUndefined()

    expect(r.batchProgress.value.at(-1)).toMatchObject({ type: 'danger' })
    expect(r.batchProgress.value.at(-1).text).toContain('批量发布失败')
  })

  it('执行批次失败时记录错误并释放两个进度订阅', async () => {
    const unsubscribe = vi.fn()
    const unsubscribeBatch = vi.fn()
    mockOnProgress.mockReturnValueOnce(unsubscribe)
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.onBatchProgress.mockReturnValueOnce(unsubscribeBatch)
    window.electronAPI.batchExecute.mockRejectedValueOnce(new Error('执行失败'))
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['wechat_mp'] }]

    await r.handleBatchPublish()

    expect(r.batchProgress.value.at(-1)).toMatchObject({ type: 'danger' })
    expect(r.batchProgress.value.at(-1).text).toContain('执行失败')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribeBatch).toHaveBeenCalledTimes(1)
  })

  it('执行接口返回业务失败时显示后端消息、不提示提交成功并释放订阅', async () => {
    const unsubscribe = vi.fn()
    const unsubscribeBatch = vi.fn()
    mockOnProgress.mockReturnValueOnce(unsubscribe)
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.onBatchProgress.mockReturnValueOnce(unsubscribeBatch)
    window.electronAPI.batchExecute.mockResolvedValueOnce({
      code: 1,
      message: '执行失败：账号未登录',
    })
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['wechat_mp'] }]

    await r.handleBatchPublish()

    expect(r.batchProgress.value.at(-1)).toMatchObject({ type: 'danger' })
    expect(r.batchProgress.value.at(-1).text).toContain('执行失败：账号未登录')
    expect(r.batchProgress.value.some(function (item) { return item.text.includes('已提交发布') })).toBe(false)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(unsubscribeBatch).toHaveBeenCalledTimes(1)
  })

  it('批次进度同时映射成功和失败事件', async () => {
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.onBatchProgress.mockImplementationOnce(function (callback) {
      callback({ ok: true, platform: 'wechat_mp', title: '成功文章', message: '' })
      callback({ ok: false, platform: 'zhihu', title: '失败文章', message: '未登录' })
      return vi.fn()
    })
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['wechat_mp'] }]

    await r.handleBatchPublish()

    expect(r.batchDone.value).toBe(1)
    expect(r.batchFail.value).toBe(1)
    expect(r.batchProgress.value.some(function (p) { return p.text.includes('未登录') })).toBe(true)
  })

  it('批次提交后持续接收异步进度，并在部分失败时汇总后释放订阅', async () => {
    const unsubscribeBatch = vi.fn()
    let emitBatchProgress
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.onBatchProgress.mockImplementationOnce(function (callback) {
      emitBatchProgress = callback
      return unsubscribeBatch
    })
    window.electronAPI.batchExecute.mockResolvedValueOnce({ code: 0 })
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{
      title: '标题',
      content: '正文',
      platforms: ['wechat_mp', 'zhihu'],
    }]

    await r.handleBatchPublish()

    expect(unsubscribeBatch).not.toHaveBeenCalled()
    emitBatchProgress({ batchId: 'batch1', ok: true, platform: 'wechat_mp', title: '标题' })
    expect(unsubscribeBatch).not.toHaveBeenCalled()
    emitBatchProgress({ batchId: 'batch1', ok: false, platform: 'zhihu', title: '标题', message: '账号未登录' })

    expect(r.batchDone.value).toBe(1)
    expect(r.batchFail.value).toBe(1)
    expect(mockElMessage.warning).toHaveBeenCalledWith('批量发布完成：1 个成功，1 个失败')
    expect(unsubscribeBatch).toHaveBeenCalledTimes(1)
  })

  it('记录可重试的失败任务并重新加入发布队列', async () => {
    let emitBatchProgress
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.onBatchProgress.mockImplementationOnce(function (callback) {
      emitBatchProgress = callback
      return vi.fn()
    })
    window.electronAPI.batchExecute.mockResolvedValueOnce({ code: 0 })
    mockRetryTask.mockResolvedValueOnce({ code: 0, data: { taskId: 'retry-1', retryOf: 'failed-1' } })
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['zhihu'] }]

    await r.handleBatchPublish()
    emitBatchProgress({
      batchId: 'batch1',
      taskId: 'failed-1',
      ok: false,
      platform: 'zhihu',
      title: '标题',
      message: '账号未登录',
    })

    expect(r.failedBatchTasks.value).toEqual([{
      taskId: 'failed-1',
      platform: 'zhihu',
      title: '标题',
    }])

    await r.retryFailedBatch()

    expect(mockRetryTask).toHaveBeenCalledWith('failed-1')
    expect(r.failedBatchTasks.value).toEqual([])
    expect(mockElMessage.success).toHaveBeenCalledWith('已重新提交 1 个失败任务')
  })

  it('全部任务失败时显示明确错误汇总，并忽略其他批次事件', async () => {
    const unsubscribeBatch = vi.fn()
    let emitBatchProgress
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.onBatchProgress.mockImplementationOnce(function (callback) {
      emitBatchProgress = callback
      return unsubscribeBatch
    })
    window.electronAPI.batchExecute.mockResolvedValueOnce({ code: 0 })
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{
      title: '标题',
      content: '正文',
      platforms: ['wechat_mp', 'zhihu'],
    }]

    await r.handleBatchPublish()
    emitBatchProgress({ batchId: 'other-batch', ok: false, platform: 'wechat_mp', title: '其他任务', message: '失败' })
    expect(r.batchFail.value).toBe(0)

    emitBatchProgress({ batchId: 'batch1', ok: false, platform: 'wechat_mp', title: '标题', message: '超时' })
    emitBatchProgress({ batchId: 'batch1', ok: false, platform: 'zhihu', title: '标题', message: '账号未登录' })

    expect(r.batchDone.value).toBe(0)
    expect(r.batchFail.value).toBe(2)
    expect(mockElMessage.error).toHaveBeenCalledWith('批量发布失败：2 个任务全部失败')
    expect(unsubscribeBatch).toHaveBeenCalledTimes(1)
  })

  it('收到 batch-complete 后以批次终态计数汇总并立即释放监听', async () => {
    const unsubscribeBatch = vi.fn()
    let emitBatchProgress
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.onBatchProgress.mockImplementationOnce(function (callback) {
      emitBatchProgress = callback
      return unsubscribeBatch
    })
    window.electronAPI.batchExecute.mockResolvedValueOnce({
      code: 0,
      data: { batchId: 'batch1', total: 2, accepted: 1, failed: 1 },
    })
    window.electronAPI.batchGet = vi.fn()
    const r = useBatchPublish({ article, licenseStore })
    r.articles.value = [{
      title: '标题',
      content: '正文',
      platforms: ['wechat_mp', 'zhihu'],
    }]

    await r.handleBatchPublish()
    emitBatchProgress({
      kind: 'batch-complete',
      batchId: 'batch1',
      total: 2,
      accepted: 1,
      completed: 2,
      succeeded: 1,
      failed: 1,
    })

    expect(mockElMessage.warning).toHaveBeenCalledWith('批量发布完成：1 个成功，1 个失败')
    expect(unsubscribeBatch).toHaveBeenCalledTimes(1)
    expect(window.electronAPI.batchGet).not.toHaveBeenCalled()
  })

  it('batch-complete 事件丢失时通过有界状态轮询确认终态并释放监听', async () => {
    vi.useFakeTimers()
    const unsubscribeBatch = vi.fn()
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.onBatchProgress.mockReturnValueOnce(unsubscribeBatch)
    window.electronAPI.batchExecute.mockResolvedValueOnce({
      code: 0,
      data: { batchId: 'batch1', total: 2, accepted: 2, failed: 0 },
    })
    window.electronAPI.batchGet = vi.fn().mockResolvedValueOnce({
      code: 0,
      data: { id: 'batch1', status: 'done', total: 2, completed: 2, failed: 1 },
    })
    const r = useBatchPublish({
      article,
      licenseStore,
      batchStatusPollIntervalMs: 10,
      batchStatusPollMaxAttempts: 2,
    })
    r.articles.value = [{
      title: '标题',
      content: '正文',
      platforms: ['wechat_mp', 'zhihu'],
    }]

    await r.handleBatchPublish()
    expect(unsubscribeBatch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10)

    expect(window.electronAPI.batchGet).toHaveBeenCalledWith('batch1')
    expect(mockElMessage.warning).toHaveBeenCalledWith('批量发布完成：1 个成功，1 个失败')
    expect(unsubscribeBatch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('状态轮询达到边界仍无终态时提示超时并可靠取消监听', async () => {
    vi.useFakeTimers()
    const unsubscribeBatch = vi.fn()
    mockBatchCreate.mockResolvedValueOnce({ code: 0, data: { id: 'batch1' } })
    window.electronAPI.onBatchProgress.mockReturnValueOnce(unsubscribeBatch)
    window.electronAPI.batchExecute.mockResolvedValueOnce({
      code: 0,
      data: { batchId: 'batch1', total: 1, accepted: 1, failed: 0 },
    })
    window.electronAPI.batchGet = vi.fn().mockResolvedValue({
      code: 0,
      data: { id: 'batch1', status: 'running', total: 1, completed: 0, failed: 0 },
    })
    const r = useBatchPublish({
      article,
      licenseStore,
      batchStatusPollIntervalMs: 10,
      batchStatusPollMaxAttempts: 2,
    })
    r.articles.value = [{ title: '标题', content: '正文', platforms: ['wechat_mp'] }]

    await r.handleBatchPublish()
    await vi.advanceTimersByTimeAsync(20)

    expect(window.electronAPI.batchGet).toHaveBeenCalledTimes(2)
    expect(mockElMessage.error).toHaveBeenCalledWith('批量发布状态确认超时，请在任务记录中查看最终结果')
    expect(unsubscribeBatch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
