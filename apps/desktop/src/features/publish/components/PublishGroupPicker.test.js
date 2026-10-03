import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PublishGroupPicker from './PublishGroupPicker.vue'
import i18n from '@/i18n'

const items = [
  { id: 'g1', name: '国内主力', applicable: 2, total: 3 },
  { id: 'g2', name: '视频号', applicable: 0, total: 0 },
]

describe('PublishGroupPicker（发布页按组添加）', () => {
  it('有组才渲染；无组整块不出现（视觉中性 + 不给死控件，§九 L5）', () => {
    const empty = mount(PublishGroupPicker, { props: { items: [] } })
    expect(empty.find('[data-testid="publish-group-picker"]').exists()).toBe(false)

    const wrapper = mount(PublishGroupPicker, { props: { items } })
    expect(wrapper.get('[data-testid="publish-group-picker"]').attributes('role')).toBe('group')
    // 断言 i18n 键解析结果，不断言 locale 字面量（文案调整会让字面量假红）
    expect(wrapper.get('[data-testid="publish-group-picker"]').attributes('aria-label'))
      .toBe(i18n.global.t('publishPage.groupPicker.label'))
    expect(wrapper.findAll('.group-picker__chip')).toHaveLength(2)
  })

  it('chip 显示「可添加/成员」两个数，两者不等时必须都露出来', () => {
    const wrapper = mount(PublishGroupPicker, { props: { items } })
    expect(wrapper.get('[data-testid="group-apply-count-g1"]').text()).toBe('2/3')
    expect(wrapper.get('[data-testid="group-apply-count-g2"]').text()).toBe('0/0')
  })

  it('可添加为 0 的组仍渲染且可点，只是带 is-empty 形态（不得伪装成按钮坏了）', () => {
    const wrapper = mount(PublishGroupPicker, { props: { items, disabled: false } })
    const chip = wrapper.get('[data-testid="group-apply-g2"]')
    expect(chip.classes()).toContain('is-empty')
    expect(chip.attributes('disabled')).toBeUndefined()
  })

  it('点击只上报组 id，选择集由上层写（组件不碰 store）', async () => {
    const wrapper = mount(PublishGroupPicker, { props: { items } })
    await wrapper.get('[data-testid="group-apply-g1"]').trigger('click')
    expect(wrapper.emitted('apply-group')).toEqual([['g1']])
  })

  it('disabled 时按钮禁用且不产出事件（发布进行中不得改选中集，§三 第 8 行）', async () => {
    const wrapper = mount(PublishGroupPicker, { props: { items, disabled: true } })
    const chip = wrapper.get('[data-testid="group-apply-g1"]')
    expect(chip.attributes('disabled')).toBeDefined()
    await chip.trigger('click')
    expect(wrapper.emitted('apply-group')).toBeUndefined()
  })

  it('每个 chip 的可访问名称带组名', () => {
    const wrapper = mount(PublishGroupPicker, { props: { items } })
    expect(wrapper.get('[data-testid="group-apply-g1"]').attributes('aria-label'))
      .toBe(i18n.global.t('publishPage.groupPicker.applyAria', { name: '国内主力' }))
  })

  // QM-6 前端轴 F5：组名是用户自由输入（≤40 字符），可以带 vue-i18n 的**元字符**。
  // 消息源里的 `@:key` 是链接语法、`{x}` 是插值 —— 必须证明"值里的这些字符只当文本"，
  // 否则一个名叫 `@:xxx` 的组会把用户看到的文案变成另一个键的解析结果。
  it('组名里的 vue-i18n 元字符只当文本，不被二次解析（F5）', () => {
    const hostile = [
      'test{name}',
      '@:publishPage.groupPicker.label',
      '100% {name} 与 {0}',
      '含反斜杠 \\{ x \\} 与 ${j}',
    ]
    for (const name of hostile) {
      const text = i18n.global.t('publishPage.groupPicker.applyAria', { name })
      // 断言"原样包含"而不是"等于某个拼好的串"：后者会把文案改动的假红引进来
      expect(text, `组名 ${JSON.stringify(name)} 被插值管线改写了`).toContain(name)
      const added = i18n.global.t('publishPage.groupPicker.added', { name, added: 2, platformText: '' })
      expect(added).toContain(name)
      const nothing = i18n.global.t('publishPage.groupPicker.nothingToAdd', { name })
      expect(nothing).toContain(name)
    }
  })
})
