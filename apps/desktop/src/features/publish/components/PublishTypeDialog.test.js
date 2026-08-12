import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/i18n'
import PublishTypeDialog from './PublishTypeDialog.vue'

describe('PublishTypeDialog', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh'
  })

  const platforms = [
    { id: 'douyin', label: '抖音', icon: '🎵' },
    { id: 'wechat_mp', label: '微信公众号', icon: '💬' },
    { id: 'zhihu', label: '知乎', icon: '❓' },
    { id: 'bilibili', label: 'B站', icon: '📺' },
  ]

  it('显示蚁小二四类发布类型和数据驱动的平台数量', () => {
    const wrapper = mount(PublishTypeDialog, { props: { visible: true, platforms }, global: { plugins: [i18n] } })

    expect(wrapper.get('.publish-type-dialog').attributes('role')).toBe('dialog')
    expect(wrapper.get('[data-testid="publish-type-dialog-title"]').text()).toBe('选择发布类型')
    expect(wrapper.findAll('.publish-type-card')).toHaveLength(4)
    expect(wrapper.get('[data-testid="publish-type-card-video"]').text()).toContain('支持平台 (2)')
    expect(wrapper.get('[data-testid="publish-type-card-wechat"]').text()).toContain('支持平台 (1)')
  })

  it('选择卡片只发出类型，不直接改写路由或 IPC', async () => {
    const wrapper = mount(PublishTypeDialog, { props: { visible: true, platforms }, global: { plugins: [i18n] } })

    await wrapper.get('[data-testid="publish-type-card-image"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['image']])
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('关闭按钮和遮罩层发出 close 事件', async () => {
    const wrapper = mount(PublishTypeDialog, { props: { visible: true, platforms }, global: { plugins: [i18n] } })

    await wrapper.get('.publish-type-close').trigger('click')
    await wrapper.get('[data-testid="publish-type-dialog"]').trigger('click.self')

    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})
