import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'

const {
  mockDraftSave,
  mockDraftList,
  mockDraftDelete,
  mockMessage,
} = vi.hoisted(() => ({
  mockDraftSave: vi.fn(),
  mockDraftList: vi.fn(),
  mockDraftDelete: vi.fn(),
  mockMessage: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/api/publisher', () => ({
  draftSave: mockDraftSave,
  draftList: mockDraftList,
  draftDelete: mockDraftDelete,
}))

vi.mock('element-plus', () => ({ ElMessage: mockMessage }))

import { usePublishDrafts } from './usePublishDrafts'

describe('usePublishDrafts', () => {
  let article
  let selectedPlatforms
  let selectedAccounts
  let platformOverrides

  beforeEach(() => {
    vi.clearAllMocks()
    article = reactive({
      title: '标题',
      content: '正文',
      author: '作者',
      cover_url: 'https://img.test/cover.jpg',
      video_path: 'D:/video.mp4',
      publishTime: '2026-07-21T10:00',
    })
    selectedPlatforms = ref(['wechat_mp'])
    selectedAccounts = ref({ wechat_mp: ['wx-1', 'wx-2'] })
    platformOverrides = reactive({ wechat_mp: { title: '微信标题', content: '' } })
    mockDraftSave.mockResolvedValue({ code: 0 })
    mockDraftList.mockResolvedValue({ code: 0, data: [] })
    mockDraftDelete.mockResolvedValue({ code: 0 })
  })

  function createDrafts () {
    return usePublishDrafts({ article, selectedPlatforms, selectedAccounts, platformOverrides })
  }

  it('保存完整文章、账号、平台和差异内容的纯 JSON 快照', async () => {
    const drafts = createDrafts()

    await drafts.saveDraft()

    expect(mockDraftSave).toHaveBeenCalledTimes(1)
    const payload = mockDraftSave.mock.calls[0][0]
    expect(payload).toMatchObject({
      title: '标题',
      content: '正文',
      author: '作者',
      cover_url: 'https://img.test/cover.jpg',
      video_path: 'D:/video.mp4',
      publishTime: '2026-07-21T10:00',
      platforms: ['wechat_mp'],
      accounts: { wechat_mp: ['wx-1', 'wx-2'] },
      platformOverrides: { wechat_mp: { title: '微信标题', content: '' } },
    })
    expect(() => structuredClone(payload)).not.toThrow()
  })

  it('加载草稿时替换而不是叠加账号与差异内容', async () => {
    const drafts = createDrafts()
    platformOverrides.zhihu = { title: '残留标题', content: '' }
    selectedAccounts.value.zhihu = ['zh-1']
    drafts.drafts.value = [{
      id: 'draft-1',
      title: '新标题',
      content: '新正文',
      platforms: ['wechat_mp'],
      accounts: { wechat_mp: ['wx-3'] },
      platformOverrides: { wechat_mp: { title: '新微信标题', content: '' } },
    }]

    await drafts.loadDraft('draft-1')

    expect(article.title).toBe('新标题')
    expect(selectedAccounts.value).toEqual({ wechat_mp: ['wx-3'] })
    expect(platformOverrides).toEqual({ wechat_mp: { title: '新微信标题', content: '' } })
  })

  it('草稿 API 失败时显示错误且不抛出未处理异常', async () => {
    mockDraftList.mockRejectedValueOnce(new Error('读取失败'))
    mockDraftSave.mockResolvedValueOnce({ code: -1, message: '保存失败' })
    const drafts = createDrafts()

    await expect(drafts.loadDrafts()).resolves.toEqual([])
    await expect(drafts.saveDraft()).resolves.toBe(false)

    expect(mockMessage.error).toHaveBeenCalledWith('读取失败')
    expect(mockMessage.error).toHaveBeenCalledWith('保存失败')
  })

  it('空草稿不提交', async () => {
    article.title = ' '
    article.content = ''
    const drafts = createDrafts()

    await drafts.saveDraft()

    expect(mockDraftSave).not.toHaveBeenCalled()
    expect(mockMessage.warning).toHaveBeenCalledWith('标题和内容不能都为空')
  })
})
