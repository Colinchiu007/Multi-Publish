import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import AccountManagementCard from './AccountManagementCard.vue'

const account = {
  id: 'account-1',
  platform: 'zhihu',
  status: 'active',
  account_name: '知乎测试账号',
}

function mountCard (props = {}) {
  return mount(AccountManagementCard, {
    props: {
      account,
      platformLabel: '知乎',
      platformIcon: '知',
      ...props,
    },
  })
}

describe('AccountManagementCard', () => {
  it('选择框提供账号名称并上抛选择和收藏事件', async () => {
    const wrapper = mountCard()
    const checkbox = wrapper.get('[data-testid="select-account-1"]')

    expect(checkbox.attributes('aria-label')).toBe('选择 知乎测试账号')
    await checkbox.setValue(true)
    await wrapper.get('[data-testid="favorite-account-1"]').trigger('click')

    expect(wrapper.emitted('toggle-select')).toEqual([['account-1']])
    expect(wrapper.emitted('toggle-favorite')).toEqual([['account-1']])
  })

  it('所有账号命令上抛原始账号对象', async () => {
    const wrapper = mountCard()

    await wrapper.get('[data-testid="set-default-account-1"]').trigger('click')
    await wrapper.get('[data-testid="open-account-1"]').trigger('click')
    await wrapper.get('[data-testid="check-account-1"]').trigger('click')
    await wrapper.get('[data-testid="delete-account-1"]').trigger('click')

    expect(wrapper.emitted('set-default')).toEqual([[account]])
    expect(wrapper.emitted('open')).toEqual([[account]])
    expect(wrapper.emitted('check')).toEqual([[account]])
    expect(wrapper.emitted('remove')).toEqual([[account]])
  })

  it('只在名称非空且发生变化时上抛重命名', async () => {
    const wrapper = mountCard()
    await wrapper.get('.account-name-button').trigger('click')
    await nextTick()
    await wrapper.get('.account-name-input').setValue('  新名称  ')
    await wrapper.get('.account-name-input').trigger('blur')

    expect(wrapper.emitted('rename')).toEqual([[account, '新名称']])

    await wrapper.get('.account-name-button').trigger('click')
    await nextTick()
    await wrapper.get('.account-name-input').setValue('   ')
    await wrapper.get('.account-name-input').trigger('blur')
    expect(wrapper.emitted('rename')).toHaveLength(1)
  })
})
