// M-15 / CCG 评审 i5：CopyLibraryView 截断回归测试。
//
// 用 35 条 mock 文案（> 渲染上限 30）验证：初始渲染 30 条 + 提示出现、
// 点击「加载更多」后渲染全量 35 条且按钮消失。
//
//   pnpm exec vitest run src/views/copy-library-truncation.test.js

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import i18n from '@/i18n'

const manyItems = Array.from({ length: 35 }, (_, i) => ({
  id: `collect:c${i + 1}`,
  origin: 'collect',
  title: `文案标题 ${i + 1}`,
  content: `正文内容 ${i + 1}`,
  wordCount: 10,
  platform: 'xiaohongshu',
  sourceUrl: '',
  createdAt: '2026-10-08T00:00:00Z',
  metadata: {},
}))

const mockPush = vi.fn()
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => ({ push: mockPush }), useRoute: () => ({ query: {} }) }
})

vi.mock('@/composables/useNotify', () => ({
  useNotify: () => ({ notifyWarning: vi.fn(), notifyError: vi.fn(), notifySuccess: vi.fn(), notifyInfo: vi.fn() }),
}))

vi.mock('@/api/publisher', () => ({
  storeGetSetting: vi.fn(async () => '[]'),
  story2videoGetProject: vi.fn(),
}))

vi.mock('@/composables/useCopyLibrarySources', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    useCopyLibrarySources: () => ({
      items: ref(manyItems),
      loading: ref(false),
      loadAll: vi.fn(async () => []),
    }),
  }
})

import CopyLibraryView from './CopyLibraryView.vue'
import { clearCopyDetailHandoff } from '@/utils/copy-detail-handoff'

async function mountView() {
  const w = mount(CopyLibraryView, { global: { plugins: [i18n] } })
  await flushPromises()
  return w
}

describe('M-15 / i5：CopyLibraryView 文案列表渲染截断', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCopyDetailHandoff()
  })

  it('超过 30 条时只渲染前 30 条，并显示截断提示与加载更多', async () => {
    const w = await mountView()
    const rendered = w.findAll('[data-testid^="copy-library-item-"]').length
    expect(rendered, `应只渲染 30 条，实际 ${rendered}`).toBe(30)
    expect(
      w.find('[data-testid="load-more-copies"]').exists(),
      '有未渲染文案时必须出现「加载更多」按钮'
    ).toBe(true)
    expect(w.text()).toContain('共 35 条文案')
    w.unmount()
  })

  it('点击「加载更多」后渲染全量 35 条，按钮消失', async () => {
    const w = await mountView()
    await flushPromises()
    await w.find('[data-testid="load-more"]').trigger('click')
    await flushPromises()
    const rendered = w.findAll('[data-testid^="copy-library-item-"]').length
    expect(rendered, '加载后应渲染全量 35 条').toBe(35)
    expect(w.find('[data-testid="load-more-copies"]').exists(), '全部加载后按钮消失').toBe(false)
    w.unmount()
  })
})
