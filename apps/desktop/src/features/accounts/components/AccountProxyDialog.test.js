import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import AccountProxyDialog from './AccountProxyDialog.vue'

const mountOptions = {
  global: {
    stubs: {
      Teleport: { template: '<div><slot /></div>' },
      Transition: { template: '<div><slot /></div>' },
    },
  },
}

describe('AccountProxyDialog', () => {
  const account = {
    id: 'account-1',
    platform: 'wechat_mp',
    name: '公众号账号',
    proxy: { configured: true, type: 'http', hostMasked: '10.0.*.*', port: 8080 },
  }

  it('只展示脱敏状态，并将完整代理配置作为保存事件上抛', async () => {
    const wrapper = mount(AccountProxyDialog, {
      props: { visible: true, account },
      ...mountOptions,
    })

    expect(wrapper.text()).toContain('10.0.*.*:8080')
    expect(wrapper.text()).not.toContain('secret')
    await wrapper.get('[data-testid="proxy-host"] input').setValue('127.0.0.1')
    await wrapper.get('[data-testid="proxy-port"] input').setValue('1080')
    await wrapper.get('[data-testid="proxy-username"] input').setValue('account')
    await wrapper.get('[data-testid="proxy-password"] input').setValue('secret')
    await wrapper.get('[data-testid="proxy-save"]').trigger('click')

    expect(wrapper.emitted('save')?.[0]).toEqual([{
      host: '127.0.0.1',
      port: 1080,
      type: 'http',
      username: 'account',
      password: 'secret',
    }])
  })

  it('为已绑定账号提供清除代理命令', async () => {
    const wrapper = mount(AccountProxyDialog, {
      props: { visible: true, account },
      ...mountOptions,
    })

    await wrapper.get('[data-testid="proxy-clear"]').trigger('click')
    expect(wrapper.emitted('clear')?.[0]).toEqual([])
  })
})
