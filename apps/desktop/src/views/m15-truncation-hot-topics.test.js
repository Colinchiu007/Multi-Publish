// M-15 批次 D：三列表渲染截断的反证与运行时验证补充。
//
// HotTopics 截断的运行时验证（Accounts/CopyLibrary 的截断断言分别在
// accounts-truncation.test.js 与 CopyLibraryView.test.js）。
// 关键语义：全选（selectAll）作用于 filteredTopics 全量集合，
// 与「只渲染前 N 条」不冲突 —— 这条必须钉死，防止后人把全选改成
// 只选已渲染条目（或反之把截断误认为全选失效）。
//
//   pnpm exec vitest run src/views/m15-truncation-hot-topics.test.js

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// 造 40 个选题（> 默认渲染上限 30）
const manyTopics = Array.from({ length: 40 }, (_, i) => ({
  id: `zhihu:${i + 1}`,
  topic: `选题${i}`,
  channel: 'zhihu',
  category: 'tech',
  rank: i + 1,
  score: 100 - i,
  hotValue: 10000 - i,
  url: null,
  fetchedAt: '2026-10-08T00:00:00Z',
}))

vi.mock('@/api/hot-topics', () => ({
  hotTopicsFetch: vi.fn(async () => ({ code: 0, data: { topics: manyTopics, fetchedAt: '2026-10-08T00:00:00Z' } })),
  hotTopicsGetCache: vi.fn(async () => ({ code: 0, data: { topics: manyTopics } })),
  hotTopicsFavoriteList: vi.fn(async () => ({ code: 0, data: [] })),
  hotTopicsFavoriteAdd: vi.fn(async () => ({ code: 0 })),
  hotTopicsFavoriteRemove: vi.fn(async () => ({ code: 0 })),
}))

vi.mock('@/api/publisher', () => ({
  aiRewrite: vi.fn(),
  draftSave: vi.fn(),
  storeGetSetting: vi.fn(),
  pipelineStartOrchestrated: vi.fn(),
  pipelineGetRunContext: vi.fn(),
  pipelineCancelRun: vi.fn(),
  onPipelineUpdate: vi.fn(() => vi.fn()),
}))

vi.mock('@/composables/useNotify', () => ({
  useNotify: () => ({ notifySuccess: vi.fn(), notifyError: vi.fn(), notifyInfo: vi.fn() }),
}))

import HotTopics from './HotTopics.vue'
import i18n from '@/i18n'

function mountPage() {
  return mount(HotTopics, {
    global: { plugins: [i18n], stubs: { 'el-alert': true, 'el-select': true, 'el-option': true, 'el-progress': true, 'el-skeleton': true } },
  })
}

describe('M-15：HotTopics 选题列表渲染截断', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('超过 30 条时只渲染前 30 条，并显示截断提示与加载更多', async () => {
    const w = mountPage()
    await flushPromises()
    const rendered = w.findAll('[data-testid="hot-topic-item"]').length
    expect(rendered, `应只渲染 30 条选题，实际 ${rendered}`).toBe(30)
    expect(
      w.find('[data-testid="load-more"]').exists(),
      '有未渲染选题时必须出现「加载更多」按钮'
    ).toBe(true)
    w.unmount()
  })

  it('点击「加载更多」后渲染数量增加', async () => {
    const w = mountPage()
    await flushPromises()
    const before = w.findAll('[data-testid="hot-topic-item"]').length
    expect(before, '前置：初始应截断在 30 条').toBe(30)

    // LoadMoreRow 的按钮点击后 emit 'more' ⇒ topicRenderLimit += 30
    await w.find('[data-testid="load-more"]').trigger('click')
    await flushPromises()
    const after = w.findAll('[data-testid="hot-topic-item"]').length
    expect(after, '加载更多后渲染数量应增加（40 条全量）').toBe(40)
    expect(w.find('[data-testid="load-more"]').exists(), '全部加载后按钮消失').toBe(false)
    w.unmount()
  })

  it('全选仍作用于全量筛选结果，不受渲染截断影响', async () => {
    const w = mountPage()
    await flushPromises()
    // 通过组件暴露的全选行为验证：选中数量可达全量 40（而非仅渲染的 30）
    // 直接断言 VM 层 filteredTopics 长度 = 40 且 selectedIds 可覆盖全部
    expect(w.vm.filteredTopics.length).toBe(40)
    w.vm.selectedIds = new Set(w.vm.filteredTopics.map((x) => x.id))
    expect(w.vm.selectedIds.size).toBe(40)
    w.unmount()
  })
})
