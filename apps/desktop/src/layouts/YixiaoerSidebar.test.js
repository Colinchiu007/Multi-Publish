import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const routeState = vi.hoisted(() => ({ path: '/accounts' }))
const push = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push }),
}))

vi.mock('@/stores/identity', () => ({
  useIdentityStore: () => ({
    user: { name: '测试用户', username: 'testuser' },
    displayName: '测试用户',
  }),
}))

vi.mock('@/stores/license', () => ({
  useLicenseStore: () => ({
    isPro: false,
    isTrial: false,
    isFree: true,
  }),
}))

import YixiaoerSidebar from './YixiaoerSidebar.vue'

let wrapper

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  push.mockReset()
})

function mountSidebar (path = '/accounts') {
  routeState.path = path
  wrapper = mount(YixiaoerSidebar, {
    global: {
      stubs: {
        RouterLink: {
          props: { to: { type: [String, Object], default: '' } },
          computed: {
            href () {
              return typeof this.to === 'string' ? this.to : this.to.path
            },
          },
          template: '<a :href="href" v-bind="$attrs"><slot /></a>',
        },
      },
    },
  })
  return wrapper
}

describe('YixiaoerSidebar', () => {
  it('renders the account route active with dynamic user info from stores', () => {
    const sidebar = mountSidebar('/accounts')

    expect(sidebar.text()).toContain('测试用户')
    expect(sidebar.text()).toContain('免费版')
    expect(sidebar.text()).toContain('主页')
    expect(sidebar.text()).toContain('发布')
    expect(sidebar.text()).toContain('账号')
    expect(sidebar.text()).toContain('私信评论')
    expect(sidebar.text()).toContain('视频创作')
    expect(sidebar.text()).toContain('采集')
    expect(sidebar.text()).toContain('发布日历')
    expect(sidebar.text()).toContain('监控')
    expect(sidebar.get('[data-testid="yixiaoer-primary-accounts"]').classes()).toContain('active')
  })

  it('opens the more menu and exposes secondary navigation', async () => {
    const sidebar = mountSidebar('/accounts')

    await sidebar.get('[data-testid="yixiaoer-primary-more"]').trigger('click')

    expect(sidebar.get('[role="menu"]').text()).toContain('素材库')
    expect(sidebar.get('[data-testid="yixiaoer-primary-more"]').attributes('aria-expanded')).toBe('true')
  })

  it('settings button emits open-settings event', async () => {
    const sidebar = mountSidebar('/accounts')

    await sidebar.get('[aria-label="设置"]').trigger('click')

    expect(sidebar.emitted('open-settings')).toBeTruthy()
  })

  it('routes the add button to the publish editor', async () => {
    const sidebar = mountSidebar('/accounts')

    await sidebar.get('[data-testid="yixiaoer-sidebar"]').find('button[aria-label="新建发布"]').trigger('click')

    expect(push).toHaveBeenCalledWith('/publish')
  })
})
