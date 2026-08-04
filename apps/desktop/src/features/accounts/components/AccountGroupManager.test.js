import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AccountGroupManager from './AccountGroupManager.vue'

describe('AccountGroupManager', () => {
  const global = {
    stubs: {
      UiModal: { template: '<div><slot/><slot name="footer"/></div>', props: ['visible'] },
      UiButton: { template: '<button @click="$emit(\'click\')"><slot/></button>', emits: ['click'] },
    },
  }

  it('创建分组并编辑真实账号成员', async () => {
    const wrapper = mount(AccountGroupManager, {
      props: {
        visible: true,
        groups: [{ id: 'g1', name: '运营组', accountIds: ['a1'] }],
        accounts: [
          { id: 'a1', name: '主账号', platform: 'wechat_mp' },
          { id: 'a2', name: '备用账号', platform: 'wechat_mp' },
        ],
        platforms: [{ id: 'wechat_mp', label: '微信' }],
      },
      global,
    })

    await wrapper.get('[data-testid="new-group-name"]').setValue('视频组')
    await wrapper.get('[data-testid="create-group"]').trigger('click')
    await wrapper.get('[data-testid="group-g1-account-a2"]').setValue(true)

    expect(wrapper.emitted('create')?.[0]).toEqual(['视频组'])
    expect(wrapper.emitted('toggle-account')?.[0]).toEqual(['g1', 'a2'])
    expect(wrapper.text()).toContain('1 / 2 个账号')
  })

  it('重命名分组并更新平台筛选', async () => {
    const wrapper = mount(AccountGroupManager, {
      props: {
        visible: true,
        groups: [{ id: 'g1', name: '运营组', accountIds: ['a1'] }],
        accounts: [{ id: 'a1', name: '主账号', platform: 'wechat_mp' }],
        platforms: [{ id: 'wechat_mp', label: '微信' }],
      },
      global,
    })

    await wrapper.get('.rename-group-button').trigger('click')
    await wrapper.get('[data-testid="rename-group-g1"]').setValue('内容组')
    await wrapper.get('[data-testid="save-group-name"]').trigger('click')
    await wrapper.get('[data-testid="group-g1-platform"]').setValue('wechat_mp')
    await wrapper.get('[data-testid="group-g1-platform"]').trigger('change')

    expect(wrapper.emitted('rename')?.[0]).toEqual(['g1', '内容组'])
    expect(wrapper.emitted('set-platform')?.[0]).toEqual(['g1', 'wechat_mp'])
  })
})
