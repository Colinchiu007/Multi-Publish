import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import AccountManagementCard from './AccountManagementCard.vue'
import i18n from '../../../i18n'

const account = {
  id: 'account-1',
  platform: 'zhihu',
  status: 'active',
  account_name: '知乎测试账号',
}

function mountCard (props = {}) {
  return mount(AccountManagementCard, {
    global: { plugins: [i18n] },
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

  it('活动账号显示已登录状态徽章和稳定选择器', () => {
    const wrapper = mountCard()
    const status = wrapper.get('[data-testid="account-status-account-1"]')

    expect(wrapper.get('[data-testid="account-card-account-1"]').exists()).toBe(true)
    expect(status.text()).toBe('已登录')
    expect(status.attributes('role')).toBe('status')
    expect(status.attributes('aria-label')).toBe('账号登录状态：已登录')
    expect(status.classes()).toContain('online')
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

    expect(wrapper.text()).toContain('已过期')
    await wrapper.get('[data-testid="relogin-account-1"]').trigger('click')

    expect(wrapper.emitted('relogin')).toEqual([[expiredAccount]])
  })

  it('未知状态保持诚实提示并继续提供重新登录动作', async () => {
    const unknownAccount = { ...account, status: 'unknown' }
    const wrapper = mountCard({ account: unknownAccount })
    const status = wrapper.get('[data-testid="account-status-account-1"]')

    expect(status.text()).toBe('暂无检查记录')
    expect(status.classes()).toContain('unknown')
    expect(wrapper.find('[data-testid="verify-account-1"]').exists()).toBe(false)
    await wrapper.get('[data-testid="relogin-account-1"]').trigger('click')
    expect(wrapper.emitted('relogin')).toEqual([[unknownAccount]])
  })

  it('异常状态显示异常徽章并在非法检查时间后回退失败原因', () => {
    const failedAccount = {
      ...account,
      status: 'error',
      checked_at: 'not-a-date',
      status_reason: 'Cookie 已过期',
    }
    const wrapper = mountCard({ account: failedAccount })
    const status = wrapper.get('[data-testid="account-status-account-1"]')

    expect(status.text()).toBe('异常')
    expect(status.classes()).toContain('error')
    expect(wrapper.get('[data-testid="account-check-account-1"]').text()).toBe('异常：Cookie 已过期')
  })

  it('有检查时间或失败原因时展示真实字段', () => {
    const wrapper = mountCard({
      account: {
        ...account,
        checked_at: '2026-08-04T08:00:00.000Z',
        login_check_error: 'Cookie 已过期',
      },
    })

    expect(wrapper.get('[data-testid="account-check-account-1"]').text()).toContain('最近检查')
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

  it('归属徽章按蚁小二契约分色：负责人蓝、运营人灰、代理紫', () => {
    const wrapper = mountCard()

    const ownerBadge = wrapper.get('[data-testid="account-owner-account-1"] span')
    const publisherBadge = wrapper.get('[data-testid="account-publisher-account-1"] span')
    const proxyBadge = wrapper.get('[data-testid="account-proxy-account-1"] span')

    expect(ownerBadge.classes()).toContain('assignee-owner')
    expect(publisherBadge.classes()).toContain('assignee-publisher')
    expect(proxyBadge.classes()).toContain('assignee-proxy')
    // 三类徽章各不相同，确保不是统一样式
    const kinds = new Set([ownerBadge.classes(), publisherBadge.classes(), proxyBadge.classes()]
      .flat()
      .filter(cls => cls.startsWith('assignee-') && cls !== 'assignee-badge'))
    expect(kinds.size).toBe(3)
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

  it('卡片空白区域可点击并上抛打开创作者中心', async () => {
    const wrapper = mountCard()

    await wrapper.get('.account-followers').trigger('click')
    await wrapper.get('.account-avatar').trigger('click')

    expect(wrapper.emitted('open-creator')).toEqual([[account], [account]])
    expect(wrapper.get('[data-testid="account-card-account-1"]').attributes('title')).toContain('创作者中心')
  })

  it('点击已有按钮、复选框和重命名入口不触发卡片级打开创作者中心', async () => {
    const wrapper = mountCard()

    await wrapper.get('[data-testid="creator-account-1"]').trigger('click')
    expect(wrapper.emitted('open-creator')).toEqual([[account]])

    await wrapper.get('[data-testid="delete-account-1"]').trigger('click')
    await wrapper.get('[data-testid="proxy-account-1"]').trigger('click')
    await wrapper.get('[data-testid="favorite-account-1"]').trigger('click')
    await wrapper.get('[data-testid="select-account-1"]').setValue(true)
    await wrapper.get('.account-name-button').trigger('click')

    expect(wrapper.emitted('open-creator')).toHaveLength(1)
    expect(wrapper.emitted('remove')).toEqual([[account]])
    expect(wrapper.emitted('configure-proxy')).toEqual([[account]])
    expect(wrapper.emitted('toggle-favorite')).toEqual([['account-1']])
    expect(wrapper.emitted('toggle-select')).toEqual([['account-1']])
  })

  it('重命名输入过程中点击输入框不会误打开创作者中心', async () => {
    const wrapper = mountCard()

    await wrapper.get('.account-name-button').trigger('click')
    await nextTick()
    await wrapper.get('.account-name-input').trigger('click')

    expect(wrapper.emitted('open-creator')).toBeUndefined()
  })
})
