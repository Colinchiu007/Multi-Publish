import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PlatformAccountGroup from './PlatformAccountGroup.vue'

const group = {
  platform: 'wechat_mp',
  activeCount: 1,
  inactiveCount: 1,
  accounts: [
    { id: 'a1', platform: 'wechat_mp', name: '主账号', status: 'active', is_default: true },
    { id: 'a2', platform: 'wechat_mp', name: '备用账号', status: 'inactive' },
  ],
}

describe('PlatformAccountGroup', () => {
  it('渲染平台统计、账号状态和默认标记', () => {
    const wrapper = mount(PlatformAccountGroup, {
      props: { group, platformLabel: '微信公众号', platformIcon: '微' },
    })

    expect(wrapper.text()).toContain('微信公众号')
    expect(wrapper.text()).toContain('1 个有效')
    expect(wrapper.text()).toContain('1 个离线')
    expect(wrapper.text()).toContain('默认账号')
  })

  it('将选择、收藏和账号命令作为事件上抛', async () => {
    const wrapper = mount(PlatformAccountGroup, {
      props: {
        group,
        platformLabel: '微信公众号',
        platformIcon: '微',
        selectedIds: new Set(['a1']),
        favoriteIds: new Set(),
      },
    })

    await wrapper.get('[data-testid="select-a2"]').setValue(true)
    await wrapper.get('[data-testid="favorite-a2"]').trigger('click')
    await wrapper.get('[data-testid="check-a2"]').trigger('click')

    expect(wrapper.emitted('toggle-select')?.[0]).toEqual(['a2'])
    expect(wrapper.emitted('toggle-favorite')?.[0]).toEqual(['a2'])
    expect(wrapper.emitted('check')?.[0]).toEqual([group.accounts[1]])
  })

  it('上抛重命名、设为默认、打开和删除命令', async () => {
    const wrapper = mount(PlatformAccountGroup, {
      props: { group, platformLabel: '微信公众号', platformIcon: '微' },
    })
    const secondRow = wrapper.findAll('.account-row')[1]
    const nameInput = secondRow.get('.account-name-input')
    await nameInput.setValue('新名称')
    await nameInput.trigger('blur')
    const buttons = secondRow.findAll('.account-actions button')
    await buttons.find(button => button.text().includes('设为默认')).trigger('click')
    await buttons.find(button => button.text().includes('打开')).trigger('click')
    await buttons.find(button => button.text().includes('删除')).trigger('click')

    expect(wrapper.emitted('rename')?.[0]).toEqual([group.accounts[1], '新名称'])
    expect(wrapper.emitted('set-default')?.[0]).toEqual([group.accounts[1]])
    expect(wrapper.emitted('open')?.[0]).toEqual([group.accounts[1]])
    expect(wrapper.emitted('remove')?.[0]).toEqual([group.accounts[1]])
  })

  it('平台标题和状态摘要具有可访问名称', () => {
    const wrapper = mount(PlatformAccountGroup, {
      props: { group, platformLabel: '微信公众号', platformIcon: '微' },
    })
    const section = wrapper.get('.account-platform-group')
    const heading = wrapper.get('.platform-heading h2')

    expect(heading.attributes('id')).toBeDefined()
    expect(section.attributes('aria-labelledby')).toBe(heading.attributes('id'))
    expect(heading.attributes('id')).toContain('wechat_mp')
    expect(wrapper.get('.platform-summary').attributes('role')).toBe('status')
    expect(wrapper.get('.platform-summary').attributes('aria-label')).toContain('1 个有效')
  })
})
