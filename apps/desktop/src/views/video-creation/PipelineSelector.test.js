import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import i18n from '@/i18n'

import PipelineSelector from './PipelineSelector.vue'

const PIPELINES = [
  { name: 'story2video-compose', category: 'generated', stageCount: 7, available: true, estimatedCost: 'medium' },
  { name: 'talking-head', category: 'talking_head', stageCount: 4, available: true, estimatedCost: 'low' },
  { name: 'framework-smoke', category: 'custom', stageCount: 2, available: false, estimatedCost: 'low' },
  { name: 'not-in-assets-yet', category: 'generated', stageCount: 3, available: true, estimatedCost: 'low' },
]

function mountSelector (overrides = {}) {
  return mount(PipelineSelector, {
    props: { pipelines: PIPELINES, ...overrides },
    global: { plugins: [i18n] },
  })
}

describe('PipelineSelector 静态卡片背景（方案 B）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    window.electronAPI = {}
  })

  it('内置静态资源命中的卡片渲染背景层（aria-hidden），未命中卡渐变兜底', () => {
    const wrapper = mountSelector()
    const bg = wrapper.find('[data-testid="pipeline-card-bg"]')
    expect(bg.exists()).toBe(true)
    expect(bg.attributes('aria-hidden')).toBe('true')
    expect(bg.find('img').exists()).toBe(true)
    // 未收录背景资源的流水线不渲染背景层
    const cards = wrapper.findAll('.pipeline-card')
    expect(cards).toHaveLength(4)
    expect(wrapper.find('[data-pipeline-id="not-in-assets-yet"] .card-bg').exists()).toBe(false)
    expect(wrapper.find('[data-pipeline-id="not-in-assets-yet"].has-bg').exists()).toBe(false)
  })

  it('has-bg 类仅出现在有背景的卡片上（未收录资源流水线渐变兜底）', () => {
    const wrapper = mountSelector()
    const withBg = wrapper.find('[data-pipeline-id="talking-head"]')
    expect(withBg.classes()).toContain('has-bg')
    const withoutBg = wrapper.find('[data-pipeline-id="not-in-assets-yet"]')
    expect(withoutBg.classes()).not.toContain('has-bg')
  })

  it('无 IPC/无 API 也能渲染（无任何网络请求逻辑）', () => {
    const wrapper = mountSelector()
    expect(wrapper.find('[data-testid="pipeline-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="pipeline-bg-generating"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="pipeline-bg-hint"]').exists()).toBe(false)
  })

  it('卡片保留 role=button / tabindex / aria-label 与键盘选择', async () => {
    const wrapper = mountSelector()
    const first = wrapper.find('.pipeline-card')
    expect(first.attributes('role')).toBe('button')
    expect(first.attributes('tabindex')).toBe('0')
    expect(first.attributes('aria-label')).toBeTruthy()
    await first.trigger('keydown.enter')
    expect(wrapper.emitted('select')).toBeTruthy()
  })

  it('加载/错误状态不受影响', () => {
    const loading = mountSelector({ loading: true })
    expect(loading.find('[data-testid="pipeline-selector-loading"]').exists()).toBe(true)
    const err = mountSelector({ loading: false, error: '加载失败' })
    expect(err.find('.error-state').exists()).toBe(true)
  })

  // ── 带文案进入场景（rewrite-to-video-entry 2026-09-13）：非文案型流水线灰显不可选 ──

  it('textOnly 模式下非文案型流水线灰显并带悬浮提示，点击/回车不触发 select', async () => {
    const wrapper = mountSelector({ textOnly: true })
    // framework-smoke 不在文案型白名单 → 灰显
    const ineligible = wrapper.find('[data-pipeline-id="framework-smoke"]')
    expect(ineligible.classes()).toContain('is-text-ineligible')
    expect(ineligible.attributes('title')).toBe('该流水线类型不适用')
    await ineligible.trigger('click')
    expect(wrapper.emitted('select')).toBeFalsy()
    await ineligible.trigger('keydown.enter')
    expect(wrapper.emitted('select')).toBeFalsy()
  })

  it('textOnly 模式下文案型流水线正常可选', async () => {
    const wrapper = mountSelector({ textOnly: true })
    // story2video-compose 在白名单 → 不灰显、可点击
    const eligible = wrapper.find('[data-pipeline-id="story2video-compose"]')
    expect(eligible.classes()).not.toContain('is-text-ineligible')
    expect(eligible.attributes('title')).toBeUndefined()
    await eligible.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
  })

  it('默认（非 textOnly）模式所有流水线均可点击，无灰显', async () => {
    const wrapper = mountSelector()
    const smoke = wrapper.find('[data-pipeline-id="framework-smoke"]')
    expect(smoke.classes()).not.toContain('is-text-ineligible')
    await smoke.trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
  })
})
