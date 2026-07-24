import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import fs from 'node:fs'
import path from 'node:path'

const historyListMock = vi.fn()
const draftListMock = vi.fn()
const pushMock = vi.fn()

vi.mock('@/api/publisher', () => ({
  historyList: (...args) => historyListMock(...args),
  draftList: (...args) => draftListMock(...args),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import PublishHistory from './PublishHistory.vue'

function mountView () {
  return mount(PublishHistory)
}

async function flushHistory () {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('PublishHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    historyListMock.mockReset().mockResolvedValue({
      code: 0,
      data: {
        total: 1,
        records: [{
          id: 'record-1',
          title: '已发布文章',
          platform: 'zhihu',
          status: 'success',
          timestamp: '2026-07-24T08:00:00.000Z',
          publisher: '秋叔',
          contentType: 'video',
          publishMode: 'rpa',
          accountCount: 1,
          taskCount: 1,
          failedCount: 0,
          views: 120,
          comments: 4,
          likes: 8,
          favorites: 2,
          shares: 3,
        }],
      },
    })
    draftListMock.mockReset().mockResolvedValue({
      code: 0,
      data: [{ id: 'draft-1', title: '待完成草稿', created_at: '2026-07-23T08:00:00.000Z' }],
    })
  })

  it('默认加载发布记录并展示平台和状态', async () => {
    const wrapper = mountView()
    await nextTick()
    await nextTick()

    expect(historyListMock).toHaveBeenCalledWith({ limit: 50, offset: 0 })
    expect(wrapper.text()).toContain('发布记录')
    expect(wrapper.text()).toContain('已发布文章')
    expect(wrapper.text()).toContain('知乎')
    expect(wrapper.text()).toContain('发布成功')
  })

  it('提供蚁小二对齐的搜索、四类筛选、视图切换和导出工具', async () => {
    const wrapper = mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.get('[data-testid="history-search"]').attributes('placeholder')).toContain('搜索作品描述或任务标题')
    expect(wrapper.get('[data-testid="publisher-filter"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="content-type-filter"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="status-filter"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="publish-mode-filter"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="view-grid"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('[data-testid="view-list"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-testid="export-history"]').text()).toContain('导出')
  })

  it('发布记录标签提供面板关联、roving tabindex 和方向键切换', async () => {
    const wrapper = mountView()
    await nextTick()
    await nextTick()

    const recordsTab = wrapper.get('[data-testid="records-tab"]')
    const draftsTab = wrapper.get('[data-testid="drafts-tab"]')
    expect(recordsTab.attributes('aria-controls')).toBe('records-panel')
    expect(recordsTab.attributes('tabindex')).toBe('0')
    expect(draftsTab.attributes('aria-controls')).toBe('drafts-panel')
    expect(draftsTab.attributes('tabindex')).toBe('-1')

    await recordsTab.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(draftsTab.attributes('aria-selected')).toBe('true')
    expect(draftListMock).toHaveBeenCalledTimes(1)
  })

  it('展示服务端总数并使用 offset 加载剩余发布记录', async () => {
    historyListMock
      .mockResolvedValueOnce({
        code: 0,
        data: {
          total: 75,
          records: [{ id: 'page-1', title: '第一页', platform: 'zhihu', status: 'success' }],
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        data: {
          total: 75,
          records: [{ id: 'page-2', title: '第二页', platform: 'weibo', status: 'success' }],
        },
      })

    const wrapper = mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('75 条发布任务')
    expect(wrapper.findAll('.record-card')).toHaveLength(1)
    await wrapper.get('[data-testid="load-more-history"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(historyListMock).toHaveBeenNthCalledWith(2, { limit: 50, offset: 1 })
    expect(wrapper.findAll('.record-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('第二页')
  })

  it('列表展示发布人、内容属性和完整统计字段', async () => {
    const wrapper = mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('秋叔')
    expect(wrapper.text()).toContain('账号数')
    expect(wrapper.text()).toContain('任务数')
    expect(wrapper.text()).toContain('失败')
    expect(wrapper.text()).toContain('播放')
    expect(wrapper.text()).toContain('评论')
    expect(wrapper.text()).toContain('点赞')
    expect(wrapper.text()).toContain('收藏')
    expect(wrapper.text()).toContain('分享')
    expect(wrapper.text()).toContain('120')
  })

  it('搜索和状态筛选只保留匹配记录', async () => {
    historyListMock.mockResolvedValue({
      code: 0,
      data: {
        records: [
          { id: 'ok', title: '正常发布', platform: 'zhihu', status: 'success' },
          { id: 'failed', title: '需要重试', platform: 'weibo', status: 'failed' },
        ],
      },
    })
    const wrapper = mountView()
    await nextTick()
    await nextTick()

    await wrapper.get('[data-testid="history-search"]').setValue('重试')
    expect(wrapper.findAll('.record-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('需要重试')

    await wrapper.get('[data-testid="history-search"]').setValue('')
    await wrapper.get('[data-testid="status-filter"]').setValue('failed')
    expect(wrapper.findAll('.record-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('需要重试')
  })

  it('筛选时补取后续页，避免遗漏第 51 条以后的记录', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `first-${index}`,
      title: `第一页记录 ${index}`,
      platform: 'zhihu',
      status: 'success',
    }))
    historyListMock
      .mockResolvedValueOnce({ code: 0, data: { total: 51, records: firstPage } })
      .mockResolvedValueOnce({
        code: 0,
        data: {
          total: 51,
          records: [{ id: 'second-page-match', title: '第二页唯一待重试记录', platform: 'weibo', status: 'failed' }],
        },
      })

    const wrapper = mountView()
    await flushHistory()
    await wrapper.get('[data-testid="history-search"]').setValue('唯一待重试')
    await flushHistory()

    expect(historyListMock).toHaveBeenNthCalledWith(2, { limit: 50, offset: 50 })
    expect(wrapper.findAll('.record-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('第二页唯一待重试记录')

    await wrapper.get('[data-testid="history-search"]').setValue('')
    await wrapper.get('[data-testid="status-filter"]').setValue('failed')
    await flushHistory()
    expect(wrapper.findAll('.record-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('第二页唯一待重试记录')
  })

  it('筛选补页遇到重复响应时停止，避免无限请求和重复记录', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `repeat-${index}`,
      title: `重复页记录 ${index}`,
      platform: 'zhihu',
      status: 'success',
    }))
    historyListMock
      .mockResolvedValueOnce({ code: 0, data: { total: 100, records: firstPage } })
      .mockResolvedValue({ code: 0, data: { total: 100, records: firstPage } })

    const wrapper = mountView()
    await flushHistory()
    await wrapper.get('[data-testid="history-search"]').setValue('重复页')
    await flushHistory()

    expect(historyListMock).toHaveBeenCalledTimes(2)
    expect(historyListMock).toHaveBeenNthCalledWith(2, { limit: 50, offset: 50 })
    expect(wrapper.findAll('.record-card')).toHaveLength(50)
    expect(wrapper.find('[data-testid="load-more-history"]').exists()).toBe(false)
  })

  it('网格与列表视图使用稳定的显式模式类', async () => {
    const wrapper = mountView()
    await nextTick()
    await nextTick()

    await wrapper.get('[data-testid="view-grid"]').trigger('click')
    expect(wrapper.get('.record-list').classes()).toContain('grid-view')
    expect(wrapper.get('[data-testid="view-grid"]').attributes('aria-pressed')).toBe('true')
  })

  it('空记录时提供新建发布入口', async () => {
    historyListMock.mockResolvedValue({ code: 0, data: { total: 0, records: [] } })
    const wrapper = mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('暂无发布记录')
    await wrapper.get('[data-testid="new-publish"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/publish')
  })

  it('加载失败时显示错误并允许重试', async () => {
    historyListMock.mockRejectedValueOnce(new Error('history unavailable'))
    const wrapper = mountView()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('发布记录加载失败')
    expect(wrapper.text()).toContain('请检查服务连接后重试')
    expect(wrapper.text()).not.toContain('history unavailable')
    historyListMock.mockResolvedValue({ code: 0, data: { total: 0, records: [] } })
    await wrapper.get('[data-testid="retry-history"]').trigger('click')
    await nextTick()
    await nextTick()
    expect(historyListMock).toHaveBeenCalledTimes(2)
  })

  it('切换草稿箱后加载草稿，并进入编辑器继续编辑', async () => {
    const wrapper = mountView()
    await nextTick()
    await wrapper.get('[data-testid="drafts-tab"]').trigger('click')
    await nextTick()
    await nextTick()

    expect(draftListMock).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('待完成草稿')
    await wrapper.get('[data-testid="edit-draft-draft-1"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/publish?draft=draft-1')
  })

  it('新建发布按钮始终进入编辑器', async () => {
    const wrapper = mountView()
    await nextTick()
    await wrapper.get('[data-testid="new-publish"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/publish')
  })

  it('批量管理支持选择、全选和取消选择', async () => {
    const wrapper = mountView()
    await nextTick()
    await nextTick()

    await wrapper.get('[data-testid="start-selection"]').trigger('click')
    const checkboxes = wrapper.findAll('.record-selector input')
    expect(checkboxes).toHaveLength(1)

    await checkboxes[0].setValue(true)
    expect(wrapper.text()).toContain('已选择 1 项')

    const cancelAll = wrapper.findAll('button').find(button => button.text() === '取消全选')
    expect(cancelAll).toBeDefined()
    await cancelAll.trigger('click')
    expect(wrapper.text()).toContain('已选择 0 项')

    const cancelSelection = wrapper.findAll('button').find(button => button.text() === '取消选择')
    await cancelSelection.trigger('click')
    expect(wrapper.find('.record-selector').exists()).toBe(false)
  })

  it('移动端记录主体使用可收缩布局，批量复选框不会撑出卡片', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/PublishHistory.vue'), 'utf8')
    const mobileStyles = source.slice(source.indexOf('@media (max-width: 720px)'))
    const recordMainRule = mobileStyles.match(/\.record-main\s*\{([^}]+)\}/)?.[1] || ''

    expect(recordMainRule).toMatch(/width:\s*auto/)
    expect(recordMainRule).toMatch(/flex:\s*1\s+1\s+0/)
    expect(recordMainRule).not.toMatch(/calc\(/)
  })
})
