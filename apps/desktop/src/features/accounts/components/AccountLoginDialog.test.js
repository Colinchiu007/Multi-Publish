import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import i18n from '@/i18n'
import AccountLoginDialog from './AccountLoginDialog.vue'

describe('AccountLoginDialog', () => {
  const global = {
    plugins: [i18n],
    stubs: {
      UiModal: { template: '<div><slot/><slot name="footer"/></div>', props: ['visible'] },
      UiSelect: {
        template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option value="wechat_mp">微信</option></select>',
        props: ['modelValue', 'options'],
        emits: ['update:modelValue'],
      },
      UiButton: { template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot/></button>', props: ['disabled'], emits: ['click'] },
    },
  }

  beforeEach(() => {
    i18n.global.locale.value = 'zh'
  })

  it('登录方式使用分段控制并提交当前模式', async () => {
    const wrapper = mount(AccountLoginDialog, {
      props: {
        visible: true,
        platforms: [{ id: 'wechat_mp', label: '微信' }],
        modelValue: 'wechat_mp',
        mode: 'browser',
      },
      global,
    })

    await wrapper.get('[data-testid="mode-qrcode"]').trigger('click')
    await wrapper.get('[data-testid="submit-login"]').trigger('click')

    expect(wrapper.emitted('update:mode')?.[0]).toEqual(['qrcode'])
    expect(wrapper.emitted('submit')?.[0]).toEqual([])
  })

  it('快手即使没有平台能力回退值也允许扫码入口和提交', async () => {
    const wrapper = mount(AccountLoginDialog, {
      props: {
        visible: true,
        platforms: [{ id: 'kuaishou', label: '快手' }],
        modelValue: 'kuaishou',
        mode: 'qrcode',
        qrAvailable: false,
      },
      global,
    })

    expect(wrapper.get('[data-testid="mode-qrcode"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="submit-login"]').attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-testid="submit-login"]').trigger('click')

    expect(wrapper.emitted('submit')?.[0]).toEqual([])
    expect(wrapper.find('.mode-notice').exists()).toBe(false)
  })

  it('非扫码平台在能力不可用时仍禁用二维码入口和提交', () => {
    const wrapper = mount(AccountLoginDialog, {
      props: {
        visible: true,
        platforms: [{ id: 'wechat_mp', label: '微信' }],
        modelValue: 'wechat_mp',
        mode: 'qrcode',
        qrAvailable: false,
      },
      global,
    })

    expect(wrapper.get('[data-testid="mode-qrcode"]').attributes('disabled')).toBe('')
    expect(wrapper.get('[data-testid="submit-login"]').attributes('disabled')).toBe('')
  })

  it('登录文案跟随当前语言切换', () => {
    i18n.global.locale.value = 'en'
    const wrapper = mount(AccountLoginDialog, {
      props: {
        visible: true,
        platforms: [{ id: 'wechat_mp', label: 'WeChat' }],
        modelValue: 'wechat_mp',
        mode: 'browser',
      },
      global,
    })

    expect(wrapper.text()).toContain('Login method')
    expect(wrapper.get('[data-testid="mode-browser"]').text()).toContain('Browser login')
    expect(wrapper.get('[data-testid="submit-login"]').text()).toContain('Open login page')
  })
})
