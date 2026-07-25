import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlatformOverridePanel from './PlatformOverridePanel.vue'

describe('PlatformOverridePanel', () => {
  const platforms = [
    { id: 'wechat_mp', label: '微信公众号', titleMax: 64, contentMax: 20000 },
    { id: 'xiaohongshu', label: '小红书', titleMax: 20, contentMax: 1000 },
    { id: 'zhihu', label: '知乎', titleMax: 120, contentMax: 100000 },
    { id: 'douyin', label: '抖音', titleMax: 55, contentMax: 2200 },
  ]

  it('渲染已选平台并展示限制', () => {
    const wrapper = mount(PlatformOverridePanel, {
      props: {
        platforms,
        modelValue: { wechat_mp: { title: '微信标题', content: '' } },
      },
    })

    expect(wrapper.text()).toContain('微信公众号')
    expect(wrapper.text()).toContain('64')
    expect(wrapper.text()).toContain('小红书')
  })

  it('启用平台差异内容时发出不可变更新', async () => {
    const modelValue = {}
    const wrapper = mount(PlatformOverridePanel, { props: { platforms, modelValue } })

    await wrapper.get('[data-testid="override-toggle-wechat_mp"]').setValue(true)

    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual({
      wechat_mp: { title: '', content: '' },
    })
    expect(modelValue).toEqual({})
  })

  it('编辑字段时发出完整覆盖对象', async () => {
    const wrapper = mount(PlatformOverridePanel, {
      props: {
        platforms,
        modelValue: { wechat_mp: { title: '', content: '' } },
      },
    })

    await wrapper.get('[data-testid="override-title-wechat_mp"]').setValue('专属标题')

    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual({
      wechat_mp: { title: '专属标题', content: '' },
    })
  })

  it('启用知乎时带上蚁小二文章发布默认权限', async () => {
    const wrapper = mount(PlatformOverridePanel, { props: { platforms, modelValue: {} } })

    await wrapper.get('[data-testid="override-toggle-zhihu"]').setValue(true)

    expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual({
      zhihu: {
        title: '',
        content: '',
        commentPermission: 'anyone',
        declare: 0,
        topics: [],
        draft: false,
      },
    })
  })

  it('知乎创作声明使用证据化枚举并保持数值类型', async () => {
    const wrapper = mount(PlatformOverridePanel, {
      props: {
        platforms,
        modelValue: {
          zhihu: { title: '', content: '', commentPermission: 'anyone', declare: 0 },
        },
      },
    })

    expect(wrapper.get('[data-testid="override-comment-permission-zhihu"]').element.value).toBe('anyone')
    await wrapper.get('[data-testid="override-declare-zhihu"]').setValue('5')

    expect(wrapper.emitted('update:modelValue').at(-1)[0].zhihu).toMatchObject({
      commentPermission: 'anyone',
      declare: 5,
    })
  })

  it('知乎话题、草稿和公众号群发会产生受限的结构化选项', async () => {
    const wrapper = mount(PlatformOverridePanel, {
      props: {
        platforms,
        modelValue: {
          zhihu: { title: '', content: '', commentPermission: 'anyone', declare: 0, topics: [], draft: false },
          wechat_mp: { title: '', content: '', massSend: false },
          douyin: { title: '', content: '', draft: false },
        },
      },
    })

    await wrapper.get('[data-testid="override-topics-zhihu"]').setValue('AI, 人工智能，AI')
    await wrapper.setProps({ modelValue: wrapper.emitted('update:modelValue').at(-1)[0] })
    await wrapper.get('[data-testid="override-draft-zhihu"]').setValue(true)
    await wrapper.setProps({ modelValue: wrapper.emitted('update:modelValue').at(-1)[0] })
    await wrapper.get('[data-testid="override-mass-send-wechat_mp"]').setValue(true)
    await wrapper.setProps({ modelValue: wrapper.emitted('update:modelValue').at(-1)[0] })
    await wrapper.get('[data-testid="override-draft-douyin"]').setValue(true)

    const latest = wrapper.emitted('update:modelValue').at(-1)[0]
    expect(latest.zhihu.topics).toEqual(['AI', '人工智能'])
    expect(latest.zhihu.draft).toBe(true)
    expect(latest.wechat_mp.massSend).toBe(true)
    expect(latest.douyin.draft).toBe(true)
  })
})
