// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// mock element-plus（ElMessage 等）
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

const pushSpy = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy }),
  useRoute: () => ({ query: {} }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key, params) => key + (params ? ':' + JSON.stringify(params) : '') }),
}))

vi.mock('@/api/hot-topics', () => ({
  hotTopicsFetch: vi.fn(),
  hotTopicsGetCache: vi.fn(),
}))

vi.mock('@/api/publisher', () => ({
  aiRewrite: vi.fn(),
  draftSave: vi.fn(),
}))

vi.mock('@/composables/useNotify', () => ({
  useNotify: () => ({
    notifySuccess: vi.fn(),
    notifyError: vi.fn(),
    notifyInfo: vi.fn(),
  }),
}))

import HotTopics from './HotTopics.vue'
import { hotTopicsFetch } from '@/api/hot-topics'
import { aiRewrite, draftSave } from '@/api/publisher'

const mockTopics = [
  { id: 'zhihu:1', topic: 'AI大模型最新突破进展', channel: 'zhihu', category: 'tech', rank: 1, hotValue: 12000000, url: null, fetchedAt: '2026-09-11T00:00:00Z' },
  { id: 'toutiao:1', topic: 'A股大涨沪指重返3000点', channel: 'toutiao', category: 'finance', rank: 1, hotValue: 456789, url: null, fetchedAt: '2026-09-11T00:00:00Z' },
  { id: 'baidu:1', topic: '普通日常记录', channel: 'baidu', category: 'general', rank: 1, hotValue: null, url: null, fetchedAt: '2026-09-11T00:00:00Z' },
]

function mountPage() {
  return mount(HotTopics, {
    global: { stubs: { 'el-alert': true, 'el-select': true, 'el-option': true, 'el-progress': true, 'el-skeleton': true } },
  })
}

describe('HotTopics.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pushSpy.mockClear()
  })

  it('renders topic list after fetch', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: { zhihu: { ok: true } } } })
    const wrapper = mountPage()
    await flushPromises()
    const items = wrapper.findAll('[data-testid="hot-topic-item"]')
    expect(items).toHaveLength(3)
    expect(wrapper.text()).toContain('AI大模型最新突破进展')
  })

  it('shows empty state when no topics', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: [], fetchedAt: Date.now(), channelStats: {} } })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-testid="hot-topics-empty"]').exists()).toBe(true)
  })

  it('category filter narrows the list', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    const wrapper = mountPage()
    await flushPromises()
    // 点击「科技」chip（第 5 个：全部/综合/社会/财经/科技）
    const chips = wrapper.findAll('.category-chip')
    await chips[4].trigger('click')
    expect(wrapper.findAll('[data-testid="hot-topic-item"]')).toHaveLength(1)
  })

  it('checkbox toggle updates selection', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    const wrapper = mountPage()
    await flushPromises()
    const check = wrapper.find('[data-testid="hot-topic-check-zhihu:1"]')
    await check.setValue(true)
    expect(wrapper.text()).toContain('selectedCount')
  })

  it('single create-copy navigates to /rewrite with topic query', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.find('.item-create-btn').trigger('click')
    expect(pushSpy).toHaveBeenCalledWith('/rewrite?topic=' + encodeURIComponent('AI大模型最新突破进展'))
  })

  it('batch publish flow: rewrite all, save drafts, navigate', async () => {
    hotTopicsFetch.mockResolvedValue({ code: 0, data: { topics: mockTopics, fetchedAt: Date.now(), channelStats: {} } })
    aiRewrite.mockResolvedValue({ code: 0, data: { success: true, result: '改写后的文案内容' } })
    draftSave.mockResolvedValue({ code: 0 })
    const wrapper = mountPage()
    await flushPromises()
    // 全选 + 一键发布（teleport 弹窗挂到 document.body）
    const el = document.createElement('div')
    document.body.appendChild(el)
    const attached = mount(HotTopics, {
      attachTo: el,
      global: { stubs: { 'el-alert': true, 'el-select': true, 'el-option': true, 'el-progress': true, 'el-skeleton': true } },
    })
    await flushPromises()
    await attached.find('.select-all-label input').setValue(true)
    // 重新 mount 后 hotTopicsFetch 已被调用过，直接触发发布
    attached.vm.selectedIds = new Set(mockTopics.map(x => x.id))
    await attached.vm.$nextTick()
    const publishBtn = attached.findAll('.batch-actions button').find(b => b.text().includes('publishBtn'))
    await publishBtn.trigger('click')
    const articleBtn = document.body.querySelector('[data-testid="publish-dest-article"]')
    expect(articleBtn).toBeTruthy()
    articleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(aiRewrite).toHaveBeenCalledTimes(3)
    expect(draftSave).toHaveBeenCalledTimes(3)
    attached.unmount()
    el.remove()
  })
})
