import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import i18n from '@/i18n'

const mockFetchBackgrounds = vi.hoisted(() => vi.fn())

vi.mock('@/api/publisher', () => ({
  pipelineCardBackgrounds: (...args) => mockFetchBackgrounds(...args),
}))

import PipelineSelector from './PipelineSelector.vue'

const PIPELINES = [
  { name: 'story2video-compose', category: 'generated', stageCount: 7, available: true, estimatedCost: 'medium' },
  { name: 'talking-head', category: 'talking_head', stageCount: 4, available: true, estimatedCost: 'low' },
  { name: 'framework-smoke', category: 'custom', stageCount: 2, available: false, estimatedCost: 'low' },
]

function mountSelector (overrides = {}) {
  return mount(PipelineSelector, {
    props: { pipelines: PIPELINES, ...overrides },
    global: { plugins: [i18n] },
  })
}

describe('PipelineSelector 卡片背景', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    window.electronAPI = {}
    mockFetchBackgrounds.mockResolvedValue({
      code: 0,
      data: {
        available: true,
        provider: 'minimax-image',
        backgrounds: { 'story2video-compose': { url: 'http://127.0.0.1:1/pipeline-card-bg/aaa', status: 'generated' } },
        generated: ['story2video-compose'],
        cached: [],
        failed: [],
        skipped: [],
      },
    })
  })

  it('挂载时按流水线名称请求背景，成功卡渲染背景层（aria-hidden）', async () => {
    const wrapper = mountSelector()
    await flushPromises()
    expect(mockFetchBackgrounds).toHaveBeenCalledWith({ names: ['story2video-compose', 'talking-head', 'framework-smoke'], force: false })
    const bg = wrapper.find('[data-testid="pipeline-card-bg"]')
    expect(bg.exists()).toBe(true)
    expect(bg.attributes('aria-hidden')).toBe('true')
    expect(bg.find('img').attributes('src')).toBe('http://127.0.0.1:1/pipeline-card-bg/aaa')
    // 未生成背景的卡片不渲染背景层，保持渐变兜底
    expect(wrapper.findAll('[data-testid="pipeline-card-bg"]')).toHaveLength(1)
  })

  it('available:false 时显示一次性提示且不渲染背景层', async () => {
    mockFetchBackgrounds.mockResolvedValue({ code: 0, data: { available: false, provider: null, backgrounds: {}, generated: [], cached: [], failed: [], skipped: [] } })
    const wrapper = mountSelector()
    await flushPromises()
    expect(wrapper.find('[data-testid="pipeline-bg-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pipeline-card-bg"]').exists()).toBe(false)
  })

  it('部分失败时显示失败提示，成功卡仍渲染背景', async () => {
    mockFetchBackgrounds.mockResolvedValue({
      code: 0,
      data: {
        available: true,
        provider: 'minimax-image',
        backgrounds: {},
        generated: [],
        cached: [],
        failed: [{ name: 'talking-head', message: 'provider boom' }],
        skipped: [],
      },
    })
    const wrapper = mountSelector()
    await flushPromises()
    expect(wrapper.find('[data-testid="pipeline-bg-hint"]').exists()).toBe(true)
  })

  it('请求期间卡片进入加载态（shimmer class），完成后清除', async () => {
    let resolveRequest
    mockFetchBackgrounds.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve }))
    const wrapper = mountSelector()
    await flushPromises()
    const loadingCard = wrapper.find('.pipeline-card.is-bg-loading')
    expect(loadingCard.exists()).toBe(true)
    resolveRequest({ code: 0, data: { available: true, provider: 'x', backgrounds: {}, generated: [], cached: [], failed: [], skipped: [] } })
    await flushPromises()
    expect(wrapper.find('.pipeline-card.is-bg-loading').exists()).toBe(false)
  })

  it('IPC 失败（fallback code -1）时回退提示，卡片保持可用', async () => {
    mockFetchBackgrounds.mockResolvedValue({ code: -1, message: 'electronAPI not available' })
    const wrapper = mountSelector()
    await flushPromises()
    expect(wrapper.find('[data-testid="pipeline-bg-hint"]').exists()).toBe(true)
    expect(wrapper.findAll('.pipeline-card')).toHaveLength(3)
  })

  it('卡片保留 role=button / tabindex / aria-label 与键盘选择', async () => {
    const wrapper = mountSelector()
    await flushPromises()
    const first = wrapper.find('.pipeline-card')
    expect(first.attributes('role')).toBe('button')
    expect(first.attributes('tabindex')).toBe('0')
    expect(first.attributes('aria-label')).toBeTruthy()
    await first.trigger('keydown.enter')
    expect(wrapper.emitted('select')).toBeTruthy()
  })
})
