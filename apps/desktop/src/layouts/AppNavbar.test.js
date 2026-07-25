import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import fs from 'fs'
import path from 'path'

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/' }),
}))

vi.mock('@/composables/useIdentity', () => ({ useIdentity: () => ({ status: 'unauthenticated', isAuthenticated: false, subject: null, loading: false, error: null, user: null, displayName: 'Guest' }) }))

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

  it('主导航保持单行弹性布局，窄屏时允许横向滚动', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../styles/cohere-design-system.css'),
      'utf8',
    )

    expect(css).toMatch(/\.cohere-topnav \.nav-primary\s*\{[^}]*display:\s*flex;/s)
    expect(css).toMatch(/\.cohere-topnav \.nav-primary\s*\{[^}]*overflow-x:\s*auto;/s)
  })
})
