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

  it('显示两类发布类型（视频/图文文章）和数据驱动的平台数量', () => {
    const wrapper = mount(PublishTypeDialog, { props: { visible: true, platforms }, global: { plugins: [i18n] } })

    expect(wrapper.get('.publish-type-dialog').attributes('role')).toBe('dialog')
    expect(wrapper.get('[data-testid="publish-type-dialog-title"]').text()).toBe('选择发布类型')
    expect(wrapper.findAll('.publish-type-card')).toHaveLength(2)
    expect(wrapper.get('[data-testid="publish-type-card-video"]').text()).toContain('支持平台 (2)')
    expect(wrapper.get('[data-testid="publish-type-card-article"]').text()).toContain('支持平台 (4)')
    // 合并后的入口不再有独立的图文/公众号卡片
    expect(wrapper.find('[data-testid="publish-type-card-image"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="publish-type-card-wechat"]').exists()).toBe(false)
  })

  it('图文文章入口的平台集合是原 image 与 article 的并集', () => {
    const allPlatforms = [
      { id: 'douyin', label: '抖音' },
      { id: 'xiaohongshu', label: '小红书' },
      { id: 'weibo', label: '微博' },
      { id: 'zhihu', label: '知乎' },
      { id: 'toutiao', label: '今日头条' },
      { id: 'baijiahao', label: '百家号' },
      { id: 'wechat_mp', label: '微信公众号' },
      { id: 'instagram', label: 'Instagram' },
      { id: 'facebook', label: 'Facebook' },
      { id: 'bilibili', label: 'B站' },
      { id: 'twitter', label: 'Twitter' },
    ]
    const wrapper = mount(PublishTypeDialog, { props: { visible: true, platforms: allPlatforms }, global: { plugins: [i18n] } })
    // 并集（去重后 11 个）：douyin/xiaohongshu/weibo/zhihu/toutiao/baijiahao/wechat_mp/instagram/facebook/bilibili/twitter
    expect(wrapper.get('[data-testid="publish-type-card-article"]').text()).toContain('支持平台 (11)')
  })

  it('选择卡片只发出类型，不直接改写路由或 IPC', async () => {
    const wrapper = mount(PublishTypeDialog, { props: { visible: true, platforms }, global: { plugins: [i18n] } })

    await wrapper.get('[data-testid="publish-type-card-article"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['article']])
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('关闭按钮和遮罩层发出 close 事件', async () => {
    const wrapper = mount(PublishTypeDialog, { props: { visible: true, platforms }, global: { plugins: [i18n] } })

    await wrapper.get('.publish-type-close').trigger('click')
    await wrapper.get('[data-testid="publish-type-dialog"]').trigger('click.self')

    expect(wrapper.emitted('close')).toHaveLength(2)
  })
})
