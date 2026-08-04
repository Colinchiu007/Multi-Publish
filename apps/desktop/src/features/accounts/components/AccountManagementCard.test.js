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
      batchMode: true,
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

  it('活动账号展示验证、设置和删除命令', async () => {
    const wrapper = mountCard()

    await wrapper.get('[data-testid="verify-account-1"]').trigger('click')
    await wrapper.get('[data-testid="proxy-account-1"]').trigger('click')
    await wrapper.get('[data-testid="delete-account-1"]').trigger('click')

    expect(wrapper.emitted('check-login')).toEqual([[account]])
    expect(wrapper.emitted('configure-proxy')).toEqual([[account]])
    expect(wrapper.emitted('remove')).toEqual([[account]])
    expect(wrapper.find('[data-testid="relogin-account-1"]').exists()).toBe(false)
  })

  it('非批量模式隐藏账号选择框', () => {
    const wrapper = mountCard({ batchMode: false })

    expect(wrapper.find('[data-testid="select-account-1"]').exists()).toBe(false)
  })

  it('失效账号展示重新登录并上抛原始账号对象', async () => {
    const expiredAccount = { ...account, status: 'inactive' }
    const wrapper = mountCard({ account: expiredAccount })

    expect(wrapper.text()).toContain('已失效')
    await wrapper.get('[data-testid="relogin-account-1"]').trigger('click')

    expect(wrapper.emitted('relogin')).toEqual([[expiredAccount]])
  })

  it('按蚁小二卡片语义展示粉丝数、负责人、运营人和代理字段', () => {
    const wrapper = mountCard({
      account: {
        ...account,
        followers: 2048,
        owner: '团队甲',
        publisher: '秋叔',
        proxy: '127.0.0.1:7890',
      },
    })

    expect(wrapper.get('[data-testid="account-followers-account-1"]').text()).toContain('粉丝：2048')
    expect(wrapper.get('[data-testid="account-owner-account-1"]').text()).toContain('负责人')
    expect(wrapper.get('[data-testid="account-owner-account-1"]').text()).toContain('团队甲')
    expect(wrapper.get('[data-testid="account-publisher-account-1"]').text()).toContain('运营人')
    expect(wrapper.get('[data-testid="account-publisher-account-1"]').text()).toContain('秋叔')
    expect(wrapper.get('[data-testid="account-proxy-account-1"]').text()).toContain('127.0.0.1:7890')
  })

  it('缺少蚁小二归属字段时显示未设置而不是伪造数据', () => {
    const wrapper = mountCard()

    expect(wrapper.get('[data-testid="account-followers-account-1"]').text()).toContain('粉丝：暂无数据')
    expect(wrapper.get('[data-testid="account-owner-account-1"]').text()).toContain('未设置')
    expect(wrapper.get('[data-testid="account-publisher-account-1"]').text()).toContain('未设置')
    expect(wrapper.get('[data-testid="account-proxy-account-1"]').text()).toContain('未设置')
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
