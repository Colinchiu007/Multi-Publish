// @ts-check
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import i18n from '@/i18n'
import fs from 'node:fs'
import path from 'node:path'

const mockElMessage = vi.hoisted(() => vi.fn())

const storeStateRaw = vi.hoisted(() => ({
  sessions: [],
  panelVisible: false,
  panelMinimized: false,
  firstHideToastShown: false,
  retrying: false,
  hasRunning: false,
  aggregate: { total: 0, done: 0, succeeded: 0, failed: 0 },
  init: vi.fn(),
  minimizePanel: vi.fn(),
  expandPanel: vi.fn(),
  consumeFirstHideToast: vi.fn(() => false),
  retryFailed: vi.fn(async () => ({ ok: 0, fail: 0 })),
  clearFinished: vi.fn(),
  sessionFailedCount: vi.fn(() => 0),
}))

vi.mock('@/stores/publishProgress', async () => {
  const { reactive } = await import('vue')
  // reactive 包装：组件内模板/computed 才能跟踪测试对原始对象的属性变更
  const reactiveStore = reactive(storeStateRaw)
  return { usePublishProgressStore: () => reactiveStore }
})

vi.mock('element-plus', () => ({
  ElMessage: (...args) => mockElMessage(...args),
}))

import PublishProgressPanel from './PublishProgressPanel.vue'
import { usePublishProgressStore } from '@/stores/publishProgress'

function makeSession(overrides = {}) {
  return {
    id: 's-1',
    batchId: null,
    title: '测试文章标题',
    createdAt: Date.now(),
    status: 'running',
    finishedAt: null,
    tasks: {},
    taskOrder: [],
    log: [],
    ...overrides,
  }
}

function makeTask(overrides = {}) {
  return {
    taskId: 't-1',
    platform: 'douyin',
    phase: 'progress',
    stageKey: 'upload',
    stage: 'uploading video...',
    percent: 40,
    result: null,
    error: null,
    remainingWait: null,
    retriesLeft: null,
    startedAt: Date.now(),
    endedAt: null,
    lastEventAt: Date.now(),
    ...overrides,
  }
}

function mountPanel() {
  // 不在此强制 locale：en 用例需要先切 locale 再挂载（afterEach 统一回 zh）
  return mount(PublishProgressPanel, { global: { plugins: [i18n] } })
}

function body() {
  return document.body
}

describe('PublishProgressPanel.vue — 全局进度面板（publish-progress-ux）', () => {
  let wrapper
  /** reactive 代理：挂载后的状态变更必须经代理（raw 直改不触发重渲染） */
  let store

  beforeEach(() => {
    document.body.innerHTML = ''
    mockElMessage.mockReset()
    store = usePublishProgressStore()
    storeStateRaw.sessions = []
    storeStateRaw.panelVisible = false
    storeStateRaw.panelMinimized = false
    storeStateRaw.hasRunning = false
    storeStateRaw.aggregate = { total: 0, done: 0, succeeded: 0, failed: 0 }
    storeStateRaw.consumeFirstHideToast.mockReset().mockReturnValue(false)
    storeStateRaw.retryFailed.mockReset().mockResolvedValue({ ok: 0, fail: 0 })
    storeStateRaw.sessionFailedCount.mockReset().mockReturnValue(0)
    storeStateRaw.minimizePanel.mockReset()
    storeStateRaw.expandPanel.mockReset()
    storeStateRaw.clearFinished.mockReset()
    storeStateRaw.init.mockReset()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    i18n.global.locale.value = 'zh'
  })

  it('setup 调用 store.init()（App 级订阅接线）', () => {
    wrapper = mountPanel()
    expect(storeStateRaw.init).toHaveBeenCalledTimes(1)
  })

  it('展开浮卡：标题/汇总/任务行（平台名+状态+阶段+百分比）渲染', async () => {
    storeStateRaw.panelVisible = true
    storeStateRaw.hasRunning = true
    storeStateRaw.aggregate = { total: 2, done: 1, succeeded: 1, failed: 0 }
    storeStateRaw.sessions = [makeSession({
      tasks: {
        't-1': makeTask(),
        't-2': makeTask({ taskId: 't-2', platform: 'zhihu', phase: 'success', stageKey: 'done', percent: 100, endedAt: Date.now() }),
      },
      taskOrder: ['t-1', 't-2'],
    })]
    wrapper = mountPanel()
    await nextTick()

    const card = body().querySelector('[data-testid="publish-progress-panel"]')
    expect(card).toBeTruthy()
    expect(card.textContent).toContain('发布进度')
    expect(card.textContent).toContain('已完成 1/2')
    const taskRows = card.querySelectorAll('[data-testid="publish-progress-task"]')
    expect(taskRows).toHaveLength(2)
    expect(taskRows[0].textContent).toContain('抖音')
    expect(taskRows[0].textContent).toContain('进行中')
    expect(taskRows[0].textContent).toContain('上传')
    expect(taskRows[0].textContent).toContain('40%')
    expect(taskRows[1].textContent).toContain('知乎')
    expect(taskRows[1].textContent).toContain('成功')
  })

  it('运行中显示常驻「请勿关闭应用」提示；无运行任务时不显示', async () => {
    storeStateRaw.panelVisible = true
    storeStateRaw.hasRunning = true
    storeStateRaw.sessions = [makeSession({ tasks: { 't-1': makeTask() }, taskOrder: ['t-1'] })]
    wrapper = mountPanel()
    await nextTick()
    let hint = body().querySelector('[data-testid="publish-progress-hint"]')
    expect(hint).toBeTruthy()
    expect(hint.textContent).toBe('发布后台进行中，请勿关闭应用')

    store.hasRunning = false
    store.sessions[0].status = 'done'
    await nextTick()
    hint = body().querySelector('[data-testid="publish-progress-hint"]')
    expect(hint).toBeNull()
  })

  it('最小化：调 minimizePanel；首次隐藏弹一次性 toast，二次不弹', async () => {
    storeStateRaw.panelVisible = true
    storeStateRaw.hasRunning = true
    storeStateRaw.sessions = [makeSession({ tasks: { 't-1': makeTask() }, taskOrder: ['t-1'] })]
    wrapper = mountPanel()
    await nextTick()

    storeStateRaw.consumeFirstHideToast.mockReturnValueOnce(true)
    const minimizeBtn = body().querySelector('[data-testid="publish-progress-minimize"]')
    expect(minimizeBtn).toBeTruthy()
    minimizeBtn.click()
    await nextTick()
    expect(storeStateRaw.minimizePanel).toHaveBeenCalledTimes(1)
    expect(storeStateRaw.consumeFirstHideToast).toHaveBeenCalledTimes(1)
    expect(mockElMessage).toHaveBeenCalledTimes(1)
    expect(mockElMessage.mock.calls[0][0]).toMatchObject({ message: '发布将在后台继续进行，请勿关闭应用软件' })

    // 二次最小化：consumeFirstHideToast 返回 false → 不再弹
    minimizeBtn.click()
    await nextTick()
    expect(mockElMessage).toHaveBeenCalledTimes(1)
  })

  it('胶囊态：渲染 pillRunning 汇总 + 勿关提示，点击恢复展开', async () => {
    storeStateRaw.panelMinimized = true
    storeStateRaw.hasRunning = true
    storeStateRaw.aggregate = { total: 3, done: 1, succeeded: 1, failed: 0 }
    wrapper = mountPanel()
    await nextTick()

    const pill = body().querySelector('[data-testid="publish-progress-pill"]')
    expect(pill).toBeTruthy()
    expect(pill.textContent).toContain('发布中 1/3')
    expect(pill.textContent).toContain('请勿关闭应用')
    expect(body().querySelector('[data-testid="publish-progress-panel"]')).toBeNull()

    pill.click()
    await nextTick()
    expect(storeStateRaw.expandPanel).toHaveBeenCalledTimes(1)
  })

  it('胶囊完成态：显示 pillDone + 失败计数', async () => {
    storeStateRaw.panelMinimized = true
    storeStateRaw.hasRunning = false
    storeStateRaw.aggregate = { total: 3, done: 3, succeeded: 2, failed: 1 }
    storeStateRaw.sessions = [makeSession({ status: 'done' })]
    wrapper = mountPanel()
    await nextTick()
    const pill = body().querySelector('[data-testid="publish-progress-pill"]')
    expect(pill.textContent).toContain('发布完成 3/3')
    expect(pill.textContent).toContain('1 个失败')
  })

  it('失败任务：错误行渲染 + 会话级「重试失败项」按钮触发 retryFailed', async () => {
    storeStateRaw.panelVisible = true
    storeStateRaw.hasRunning = false
    storeStateRaw.sessions = [makeSession({
      status: 'done',
      tasks: {
        't-1': makeTask({ phase: 'failed', stageKey: 'failed', percent: 100, error: '平台 Cookie 缺失（账号未登录）', endedAt: Date.now() }),
      },
      taskOrder: ['t-1'],
    })]
    storeStateRaw.sessionFailedCount.mockReturnValue(1)
    wrapper = mountPanel()
    await nextTick()

    const card = body().querySelector('[data-testid="publish-progress-panel"]')
    expect(card.textContent).toContain('平台 Cookie 缺失（账号未登录）')
    const retryBtn = card.querySelector('[data-testid="publish-progress-retry-failed"]')
    expect(retryBtn).toBeTruthy()
    expect(retryBtn.textContent).toContain('重试失败项（1）')
    retryBtn.click()
    await Promise.resolve()
    expect(storeStateRaw.retryFailed).toHaveBeenCalledWith('s-1')
  })

  it('运行中关闭按钮 disabled；完成后可点（清除已完成）', async () => {
    storeStateRaw.panelVisible = true
    storeStateRaw.hasRunning = true
    storeStateRaw.sessions = [makeSession({ tasks: { 't-1': makeTask() }, taskOrder: ['t-1'] })]
    wrapper = mountPanel()
    await nextTick()
    let closeBtn = body().querySelector('[data-testid="publish-progress-close"]')
    expect(closeBtn.hasAttribute('disabled')).toBe(true)

    store.hasRunning = false
    store.sessions[0].status = 'done'
    await nextTick()
    closeBtn = body().querySelector('[data-testid="publish-progress-close"]')
    expect(closeBtn.hasAttribute('disabled')).toBe(false)
    closeBtn.click()
    await nextTick()
    expect(storeStateRaw.clearFinished).toHaveBeenCalledTimes(1)
  })

  it('展开态无会话：显示空态文案', async () => {
    storeStateRaw.panelVisible = true
    storeStateRaw.sessions = []
    wrapper = mountPanel()
    await nextTick()
    const card = body().querySelector('[data-testid="publish-progress-panel"]')
    expect(card.textContent).toContain('暂无进行中的发布')
  })

  it('非模态负向锁：源码不得接入浮层互斥（PRD-OVERLAY-VIEW-SUSPENSION §6 口径）', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, 'PublishProgressPanel.vue'),
      'utf-8',
    )
    expect(source).not.toContain('suspendEmbeddedViewsForOverlay')
    expect(source).not.toContain('useEmbeddedViewSuspension')
  })

  it('英文 locale：胶囊与状态标签走 en 文案', async () => {
    i18n.global.locale.value = 'en'
    try {
      storeStateRaw.panelMinimized = true
      storeStateRaw.hasRunning = true
      storeStateRaw.aggregate = { total: 2, done: 1, succeeded: 1, failed: 0 }
      wrapper = mountPanel()
      await nextTick()
      const pill = body().querySelector('[data-testid="publish-progress-pill"]')
      expect(pill.textContent).toContain('Publishing 1/2')
      expect(pill.textContent).toContain('keep the app open')
    } finally {
      i18n.global.locale.value = 'zh'
    }
  })
})
