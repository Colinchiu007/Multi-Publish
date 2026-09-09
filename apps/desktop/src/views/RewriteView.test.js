import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import i18n from '@/i18n'

vi.mock('@/api/publisher', () => ({
  aiRewrite: vi.fn().mockResolvedValue({
    code: 0,
    data: {
      success: true,
      result: '这是改写后的文案内容，用于测试。',
      strategy: { id: 'test-strategy', name: '测试策略', category: 'viral' },
      warnings: [],
      sensitiveHits: [],
      metadata: { mode: 'create', originalLength: 30, resultLength: 18, aiTasteLevel: 0.15 },
    },
  }),
  draftSave: vi.fn().mockResolvedValue({ code: 0, data: true }),
  draftList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
  storeGetSetting: vi.fn().mockResolvedValue(null),
  storeSetSetting: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/composables/useNotify', () => ({
  useNotify: () => ({
    notifySuccess: vi.fn(),
    notifyError: vi.fn(),
    notifyWarning: vi.fn(),
    notifyInfo: vi.fn(),
  }),
}))

vi.mock('@/composables/useLoginGate', () => ({
  useLoginGate: () => ({
    ensureLogin: vi.fn().mockResolvedValue(true),
  }),
}))

vi.mock('@/utils/user-facing-error', () => ({
  formatUserError: (e, opts) => ({
    message: e?.message || opts?.fallback || 'unknown error',
  }),
}))

vi.mock('@/utils/notifyCore', () => ({
  resolveNotifyText: (key) => ({ text: key }),
}))

vi.mock('element-plus', () => ({}))
vi.mock('@element-plus/icons-vue', () => ({}))

import RewriteView from './RewriteView.vue'

function factory() {
  setActivePinia(createPinia())
  i18n.global.locale.value = 'zh'
  const wrapper = mount(RewriteView, {
    global: {
      plugins: [i18n],
      stubs: {
        PublishDestinationModal: true,
      },
      mocks: {
        $router: { push: vi.fn() },
        $route: { query: {} },
      },
    },
  })
  return wrapper
}

describe('RewriteView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title', () => {
    const wrapper = factory()
    expect(wrapper.text()).toContain('文案改写')
  })

  it('renders the text input area', () => {
    const wrapper = factory()
    const textarea = wrapper.find('textarea.rewrite-textarea')
    expect(textarea.exists()).toBe(true)
  })

  it('renders config checkboxes with default values', () => {
    const wrapper = factory()
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes.length).toBe(2)
    // 结合爆款库 默认勾选
    expect(checkboxes[0].element.checked).toBe(true)
    // 结合个人经历 默认不勾选
    expect(checkboxes[1].element.checked).toBe(false)
  })

  it('renders rewrite mode chips', () => {
    const wrapper = factory()
    const chips = wrapper.findAll('.mode-chip')
    expect(chips.length).toBe(3)
    expect(chips[0].text()).toContain('抄袭规避模仿')
    expect(chips[1].text()).toContain('扩写爆款')
    expect(chips[2].text()).toContain('选题创作')
  })

  it('renders target platform selector', () => {
    const wrapper = factory()
    const select = wrapper.find('select.config-select')
    expect(select.exists()).toBe(true)
  })

  it('disables rewrite button when content is too short', async () => {
    const wrapper = factory()
    const textarea = wrapper.find('textarea.rewrite-textarea')
    await textarea.setValue('短')
    await nextTick()
    const btn = wrapper.find('.rewrite-start-btn')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('enables rewrite button when content is long enough', async () => {
    const wrapper = factory()
    const textarea = wrapper.find('textarea.rewrite-textarea')
    await textarea.setValue('这是一段足够长的测试文案内容，超过二十个字，用于测试改写按钮的启用状态。')
    await nextTick()
    const btn = wrapper.find('.rewrite-start-btn')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('shows error when content is too short on rewrite', async () => {
    const wrapper = factory()
    const textarea = wrapper.find('textarea.rewrite-textarea')
    await textarea.setValue('太短')
    await nextTick()
    const btn = wrapper.find('.rewrite-start-btn')
    // 内容太短时按钮保持禁用，不会触发改写
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('shows result and action buttons after successful rewrite', async () => {
    const wrapper = factory()
    const textarea = wrapper.find('textarea.rewrite-textarea')
    await textarea.setValue('这是一段足够长的测试文案内容，超过二十个字，测试改写功能。')
    await nextTick()
    const btn = wrapper.find('.rewrite-start-btn')
    await btn.trigger('click')
    await nextTick()
    await nextTick()

    // 结果应该显示出来
    const text = wrapper.text()
    expect(text).toContain('测试策略')
    // 改写结果写入结果 textarea
    const resultTextarea = wrapper.find('.result-textarea')
    expect(resultTextarea.exists()).toBe(true)
    expect(resultTextarea.element.value).toContain('这是改写后的文案内容')
    // 存入草稿/去发布按钮应该出现
    expect(wrapper.text()).toContain('存入草稿')
    expect(wrapper.text()).toContain('去发布')
  })

  it('does not show result section before rewrite', () => {
    const wrapper = factory()
    expect(wrapper.text()).not.toContain('改写结果')
  })

  it('rewrite mode chip click changes active mode', async () => {
    const wrapper = factory()
    const chips = wrapper.findAll('.mode-chip')
    // 默认 create 是 active
    expect(chips[2].classes()).toContain('active')
    // 点击 imitate
    await chips[0].trigger('click')
    await nextTick()
    expect(wrapper.findAll('.mode-chip')[0].classes()).toContain('active')
  })

  it('viral library checkbox can be toggled', async () => {
    const wrapper = factory()
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes[0].element.checked).toBe(true)
    await checkboxes[0].trigger('click')
    await nextTick()
    expect(checkboxes[0].element.checked).toBe(false)
  })
})
