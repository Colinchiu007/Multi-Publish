import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/' }),
}))

vi.mock('@/stores/license', () => ({
  useLicenseStore: () => ({ isPro: false }),
}))

import AppNavbar from './AppNavbar.vue'

let wrapper

function mountNavbar () {
  wrapper = mount(AppNavbar, {
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        UpgradeModal: {
          emits: ['close'],
          template: '<div class="upgrade-modal"><button class="close-upgrade" @click="$emit(\'close\')">关闭</button></div>',
        },
      },
    },
  })
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('AppNavbar 升级入口', () => {
  it('点击升级按钮后显示弹窗，关闭事件会移除弹窗', async () => {
    const navbar = mountNavbar()

    expect(navbar.find('.upgrade-modal').exists()).toBe(false)
    await navbar.get('.pro-btn').trigger('click')
    expect(navbar.find('.upgrade-modal').exists()).toBe(true)

    await navbar.get('.close-upgrade').trigger('click')
    expect(navbar.find('.upgrade-modal').exists()).toBe(false)
  })
})
