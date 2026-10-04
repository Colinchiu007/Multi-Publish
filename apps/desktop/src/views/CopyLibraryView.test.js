import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import i18n from '@/i18n'

const mockPush = vi.fn()
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => ({ push: mockPush }), useRoute: () => ({ query: {} }) }
})

const mockNotifyWarning = vi.fn()
vi.mock('@/composables/useNotify', () => ({
  useNotify: () => ({ notifyWarning: mockNotifyWarning, notifyError: vi.fn(), notifySuccess: vi.fn(), notifyInfo: vi.fn() }),
}))

const story2videoGetProject = vi.fn()
vi.mock('@/api/publisher', () => ({
  storeGetSetting: vi.fn(async () => '[]'),
  story2videoGetProject: (...args) => story2videoGetProject(...args),
}))

vi.mock('@/composables/useCopyLibrarySources', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    useCopyLibrarySources: () => ({
      items: ref([
        { id: 'collect:c1', origin: 'collect', title: '采集标题', content: '采集正文内容', wordCount: 6, platform: 'xiaohongshu', sourceUrl: 'https://example.com/a', createdAt: '2026-10-01T00:00:00Z', metadata: {} },
        { id: 'rewrite:r1', origin: 'rewrite', title: '改写标题', content: '改写正文内容', wordCount: 6, platform: '', sourceUrl: '', createdAt: '2026-10-02T00:00:00Z', metadata: {} },
        { id: 'draft:d1', origin: 'draft', title: '草稿标题', content: '草稿正文内容', wordCount: 6, platform: '', sourceUrl: '', createdAt: '2026-10-03T00:00:00Z', metadata: {} },
        { id: 'video:v1', origin: 'video', title: '视频标题', content: '截断预览', wordCount: 800, platform: '', sourceUrl: '', createdAt: '2026-10-04T00:00:00Z', metadata: { videoProjectId: 'v1', truncated: true } },
      ]),
      loading: ref(false),
      loadAll: vi.fn(async () => []),
    }),
  }
})

import CopyLibraryView from './CopyLibraryView.vue'
import { takeCopyDetailHandoff, clearCopyDetailHandoff } from '@/utils/copy-detail-handoff'

async function mountView() {
  const w = mount(CopyLibraryView, { global: { plugins: [i18n] } })
  await flushPromises()
  return w
}

describe('CopyLibraryView — 文案库卡片点击进入文案详情（发布页）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCopyDetailHandoff()
  })

  it('卡片带 role=button 与 tabindex=0（可键盘访问）', async () => {
    const w = await mountView()
    const card = w.find('[data-testid="copy-library-item-collect:c1"]')
    expect(card.exists()).toBe(true)
    expect(card.attributes('role')).toBe('button')
    expect(card.attributes('tabindex')).toBe('0')
  })

  it('点击采集卡片 → 写入交接载荷并跳转发布页', async () => {
    const w = await mountView()
    await w.find('[data-testid="copy-library-item-collect:c1"]').trigger('click')
    const payload = takeCopyDetailHandoff()
    expect(payload).toMatchObject({ content: '采集正文内容', title: '采集标题', origin: 'collect', sourceId: 'c1', platform: 'xiaohongshu', sourceUrl: 'https://example.com/a' })
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ path: '/publish', query: expect.objectContaining({ from: 'copy-library' }) }))
  })

  it('点击改写卡片 → 载荷 origin=rewrite sourceId=r1', async () => {
    const w = await mountView()
    await w.find('[data-testid="copy-library-item-rewrite:r1"]').trigger('click')
    expect(takeCopyDetailHandoff()).toMatchObject({ origin: 'rewrite', sourceId: 'r1', content: '改写正文内容' })
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('点击草稿卡片 → 载荷 origin=draft sourceId=d1', async () => {
    const w = await mountView()
    await w.find('[data-testid="copy-library-item-draft:d1"]').trigger('click')
    expect(takeCopyDetailHandoff()).toMatchObject({ origin: 'draft', sourceId: 'd1' })
  })

  it('点击视频卡片 → 先拉全文（成功时载荷含全文）', async () => {
    story2videoGetProject.mockResolvedValue({ code: 0, data: { projectId: 'v1', sourceText: '字'.repeat(2000), title: '视频标题' } })
    const w = await mountView()
    await w.find('[data-testid="copy-library-item-video:v1"]').trigger('click')
    await flushPromises()
    const payload = takeCopyDetailHandoff()
    expect(payload.content).toHaveLength(2000)
    expect(payload.origin).toBe('video')
    expect(story2videoGetProject).toHaveBeenCalledWith('v1')
    expect(mockNotifyWarning).not.toHaveBeenCalled()
  })

  it('视频全文拉取失败 → 降级截断预览 + warning + 照常跳转', async () => {
    story2videoGetProject.mockResolvedValue({ code: -1, message: 'ipc down' })
    const w = await mountView()
    await w.find('[data-testid="copy-library-item-video:v1"]').trigger('click')
    await flushPromises()
    expect(takeCopyDetailHandoff()).toMatchObject({ content: '截断预览', origin: 'video', sourceId: 'v1' })
    expect(mockNotifyWarning).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('视频全文拉取抛异常 → 同样降级不阻塞', async () => {
    story2videoGetProject.mockRejectedValue(new Error('boom'))
    const w = await mountView()
    await w.find('[data-testid="copy-library-item-video:v1"]').trigger('click')
    await flushPromises()
    expect(takeCopyDetailHandoff()).toMatchObject({ content: '截断预览' })
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('键盘 Enter 触发与点击一致', async () => {
    const w = await mountView()
    await w.find('[data-testid="copy-library-item-draft:d1"]').trigger('keydown', { key: 'Enter' })
    expect(takeCopyDetailHandoff()).toMatchObject({ origin: 'draft' })
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('键盘空格触发与点击一致', async () => {
    const w = await mountView()
    await w.find('[data-testid="copy-library-item-draft:d1"]').trigger('keydown', { key: ' ' })
    expect(mockPush).toHaveBeenCalledTimes(1)
  })
})