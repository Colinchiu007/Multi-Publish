import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Mock @/api/publisher
const storeListPublishHistoryMock = vi.fn()
const pipelineHistoryMock = vi.fn()
vi.mock('@/api/publisher', () => ({
  storeListPublishHistory: (...args) => storeListPublishHistoryMock(...args),
  pipelineHistory: (...args) => pipelineHistoryMock(...args),
}))

// Mock vue-router
const pushSpy = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy }),
}))

import CreateHistory from './CreateHistory.vue'

describe('CreateHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeListPublishHistoryMock.mockResolvedValue({ code: 0, data: { records: [] } })
    pipelineHistoryMock.mockResolvedValue({ code: 0, data: [] })
  })

  // ─── 渲染 ───
  it('渲染页面标题和说明', async () => {
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    await nextTick()
    expect(w.text()).toContain('创作历史')
    expect(w.text()).toContain('查看已渲染的视频和流水线运行记录')
  })

  it('默认显示渲染记录 tab', async () => {
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    await nextTick()
    expect(w.vm.tab).toBe('renders')
    // tab 按钮有 active class
    const tabs = w.findAll('.tab')
    expect(tabs[0].classes()).toContain('active')
    expect(tabs[1].classes()).not.toContain('active')
  })

  it('切换到流水线记录 tab', async () => {
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    await nextTick()
    await w.findAll('.tab')[1].trigger('click')
    expect(w.vm.tab).toBe('pipelines')
    expect(pipelineHistoryMock).toHaveBeenCalled()
  })

  // ─── 空状态 ───
  it('渲染记录为空时显示空状态', async () => {
    storeListPublishHistoryMock.mockResolvedValue({ code: 0, data: { records: [] } })
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(w.text()).toContain('暂无渲染记录')
  })

  it('流水线记录为空时显示空状态', async () => {
    pipelineHistoryMock.mockResolvedValue({ code: 0, data: [] })
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    await nextTick()
    await w.findAll('.tab')[1].trigger('click')
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(w.text()).toContain('暂无流水线运行记录')
  })

  // ─── 渲染记录列表 ───
  it('加载并显示渲染记录列表', async () => {
    storeListPublishHistoryMock.mockResolvedValue({
      code: 0,
      data: {
        records: [
          { composition: '视频1', outputPath: '/path/1.mp4', status: 'completed', completedAt: '2026-07-15T10:00:00Z' },
          { name: '视频2', outputPath: '/path/2.mp4', status: 'failed', createdAt: '2026-07-14T10:00:00Z' },
        ],
      },
    })
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    const cards = w.findAll('.render-card')
    expect(cards.length).toBe(2)
    expect(w.text()).toContain('视频1')
    expect(w.text()).toContain('视频2')
  })

  // ─── 流水线记录列表 ───
  it('加载并显示流水线记录列表', async () => {
    pipelineHistoryMock.mockResolvedValue({
      code: 0,
      data: [
        { pipelineName: 'story-to-video', status: 'completed', completedAt: '2026-07-15T10:00:00Z', stages: [{ name: 'script', status: 'completed' }, { name: 'audio', status: 'completed' }] },
      ],
    })
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    await nextTick()
    await w.findAll('.tab')[1].trigger('click')
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    const cards = w.findAll('.pipeline-card')
    expect(cards.length).toBe(1)
    expect(w.text()).toContain('Story To Video')
  })

  // ─── 辅助方法 ───
  it('statusLabel 返回正确的中文标签', () => {
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    expect(w.vm.statusLabel('completed')).toBe('已完成')
    expect(w.vm.statusLabel('running')).toBe('运行中')
    expect(w.vm.statusLabel('failed')).toBe('失败')
    expect(w.vm.statusLabel('cancelled')).toBe('已取消')
    expect(w.vm.statusLabel('paused')).toBe('已暂停')
    expect(w.vm.statusLabel(null)).toBe('已完成')
    expect(w.vm.statusLabel('unknown')).toBe('unknown')
  })

  it('stageClass 从对象提取 status', () => {
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    expect(w.vm.stageClass({ status: 'completed' })).toBe('completed')
    expect(w.vm.stageClass({ status: 'running' })).toBe('running')
    expect(w.vm.stageClass('raw-string')).toBe('')
    expect(w.vm.stageClass(null)).toBe('')
  })

  it('shortName 截断超长名称', () => {
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    expect(w.vm.shortName('short')).toBe('short')
    expect(w.vm.shortName('this-is-a-very-long-stage-name')).toBe('this-is-a-...')
    expect(w.vm.shortName('')).toBe('')
    expect(w.vm.shortName(null)).toBe('')
  })

  it('humanName 将连字符名称转为 Title Case', () => {
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    expect(w.vm.humanName('story-to-video')).toBe('Story To Video')
    expect(w.vm.humanName('script-generation')).toBe('Script Generation')
    expect(w.vm.humanName('')).toBe('')
    expect(w.vm.humanName(null)).toBe('')
  })

  it('formatTime 格式化 ISO 时间字符串', () => {
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    const result = w.vm.formatTime('2026-07-15T10:00:00Z')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    // 无效输入返回空
    expect(w.vm.formatTime(null)).toBe('')
    expect(w.vm.formatTime('')).toBe('')
  })

  // ─── 错误处理 ───
  it('loadRenders 异常时静默 fallback 不崩溃', async () => {
    storeListPublishHistoryMock.mockRejectedValue(new Error('network error'))
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(w.vm.renderLoading).toBe(false)
    expect(w.vm.renders).toEqual([])
  })

  it('loadPipelines 异常时静默 fallback 不崩溃', async () => {
    pipelineHistoryMock.mockRejectedValue(new Error('network error'))
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    await nextTick()
    await w.findAll('.tab')[1].trigger('click')
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(w.vm.pipelineLoading).toBe(false)
    expect(w.vm.pipelines).toEqual([])
  })

  // ─── 加载状态 ───
  it('初始化时 renderLoading 为 true', () => {
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    expect(w.vm.renderLoading).toBe(true)
  })

  it('loadRenders 完成后 renderLoading 为 false', async () => {
    const w = mount(CreateHistory, { global: { stubs: { UiButton: true } } })
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(w.vm.renderLoading).toBe(false)
  })
})
