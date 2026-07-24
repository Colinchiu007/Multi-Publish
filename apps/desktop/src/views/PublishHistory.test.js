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

describe('PublishHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    historyListMock.mockResolvedValue({
      code: 0,
      data: {
        total: 1,
        records: [{
          id: 'record-1',
          title: '已发布文章',
          platform: 'zhihu',
          status: 'success',
          timestamp: '2026-07-24T08:00:00.000Z',
        }],
      },
    })
    draftListMock.mockResolvedValue({
      code: 0,
      data: [{ id: 'draft-1', title: '待完成草稿', created_at: '2026-07-23T08:00:00.000Z' }],
    })
  })

  it('默认加载发布记录并展示平台和状态', async () => {
    const wrapper = mountView()
    await nextTick()
    await nextTick()

    expect(historyListMock).toHaveBeenCalledWith({ limit: 50 })
    expect(wrapper.text()).toContain('发布记录')
    expect(wrapper.text()).toContain('已发布文章')
    expect(wrapper.text()).toContain('知乎')
    expect(wrapper.text()).toContain('发布成功')
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
