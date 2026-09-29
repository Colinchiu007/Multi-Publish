import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PublishVisibilitySelect from './PublishVisibilitySelect.vue'

// P1-5 语义级可见性通用控件：只暴露语义档位（公开/好友/私密/跟随默认），
// 平台取值映射真源在注册表 semanticValues（由主进程 resolver 消费，本组件不持有映射表）。
describe('PublishVisibilitySelect', () => {
  const mountWith = (props = {}) => mount(PublishVisibilitySelect, {
    props: { modelValue: '', platforms: ['youtube', 'tiktok'], ...props },
  })

  it('无支持平台时整块不渲染（零打扰）', () => {
    const wrapper = mountWith({ platforms: [] })
    expect(wrapper.find('[data-testid="publish-visibility"]').exists()).toBe(false)
  })

  it('渲染四个语义档位且默认选中「跟随各平台默认」', () => {
    const wrapper = mountWith()
    const select = wrapper.get('[data-testid="publish-visibility-select"]')
    const values = wrapper.findAll('option').map(option => option.element.value)
    expect(values).toEqual(['', 'public', 'friends', 'private'])
    expect(select.element.value).toBe('')
  })

  it('档位标签为语义文案（不暴露平台取值）', () => {
    const text = mountWith().text()
    expect(text).toContain('公开')
    expect(text).toContain('好友可见')
    expect(text).toContain('仅自己可见')
    expect(text).toContain('跟随各平台默认')
    // 平台原始取值绝不出现在通用区（用户不应理解 PUBLICS/PUBLIC/unlisted 等平台值）
    expect(text).not.toContain('PUBLIC')
    expect(text).not.toContain('unlisted')
  })

  it('选择档位只上报事件（不自行改写映射）', async () => {
    const wrapper = mountWith()
    await wrapper.get('[data-testid="publish-visibility-select"]').setValue('friends')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['friends'])
  })

  it('支持平台数徽标按注入清单显示', () => {
    expect(mountWith({ platforms: ['youtube', 'tiktok', 'douyin'] }).text()).toContain('3 个所选平台支持')
  })

  it('hint 注入了不支持提示时覆盖通用说明', () => {
    const hint = '快手 不支持该档位，将保持默认'
    const wrapper = mountWith({ modelValue: 'friends', hint })
    expect(wrapper.get('[data-testid="publish-visibility-hint"]').text()).toBe(hint)
  })

  it('无 hint 时显示通用说明（提示可到差异化面板细调）', () => {
    const wrapper = mountWith()
    expect(wrapper.get('[data-testid="publish-visibility-hint"]').text()).toContain('平台差异化内容')
  })
})
