import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AccountLoginDialog from './AccountLoginDialog.vue'

describe('AccountLoginDialog', () => {
  const global = {
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
})
