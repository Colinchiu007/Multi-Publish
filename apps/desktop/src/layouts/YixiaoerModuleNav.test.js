import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const routeState = vi.hoisted(() => ({ path: '/accounts', query: {} }))

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
}))

import YixiaoerModuleNav from './YixiaoerModuleNav.vue'

let wrapper

function mountNav (path, query = {}) {
  routeState.path = path
  routeState.query = query
  wrapper = mount(YixiaoerModuleNav, {
    global: {
      stubs: {
        RouterLink: {
          props: { to: { type: [String, Object], default: '' } },
          computed: {
            href () {
              if (typeof this.to === 'string') return this.to
              const params = new URLSearchParams(this.to.query || {}).toString()
              return `${this.to.path}${params ? `?${params}` : ''}`
            },
          },
          template: '<a :href="href" v-bind="$attrs"><slot /></a>',
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

describe('YixiaoerModuleNav', () => {
  it('renders account tabs and marks the current account route active', () => {
    const nav = mountNav('/accounts')

    expect(nav.findAll('[role="tab"]')).toHaveLength(4)
    expect(nav.text()).toContain('账号管理')
    expect(nav.text()).toContain('分组管理')
    expect(nav.text()).toContain('分享链接')
    expect(nav.text()).toContain('收藏分组')
    expect(nav.get('[data-testid="yixiaoer-tab-accounts"]').classes()).toContain('active')
    expect(nav.get('[data-testid="yixiaoer-tab-accounts"]').attributes('aria-current')).toBe('page')
    expect(nav.get('[data-testid="yixiaoer-tab-groups"]').attributes('href')).toBe('/accounts?tab=groups')
  })

  it('uses the account query tab for secondary account navigation', () => {
    const nav = mountNav('/accounts', { tab: 'favorites' })

    expect(nav.get('[data-testid="yixiaoer-tab-favorites"]').classes()).toContain('active')
    expect(nav.get('[data-testid="yixiaoer-tab-accounts"]').classes()).not.toContain('active')
  })

  it('renders publish tabs with route-aware active state', () => {
    const nav = mountNav('/publish/history')

    expect(nav.findAll('[role="tab"]')).toHaveLength(2)
    expect(nav.text()).not.toContain('新建发布')
    expect(nav.text()).toContain('发布记录')
    expect(nav.text()).toContain('草稿箱')
    expect(nav.get('[data-testid="yixiaoer-tab-publish-history"]').classes()).toContain('active')
    expect(nav.get('[data-testid="yixiaoer-tab-drafts"]').classes()).not.toContain('active')

    nav.unmount()
    wrapper = mountNav('/publish', { tab: 'drafts' })
    expect(wrapper.get('[data-testid="yixiaoer-tab-drafts"]').classes()).toContain('active')

    wrapper.unmount()
    wrapper = mountNav('/publish')
    expect(wrapper.get('[data-testid="yixiaoer-tab-publish-history"]').classes()).not.toContain('active')
  })

  it('keeps tool placeholders inert', async () => {
    const nav = mountNav('/accounts')
    const tools = nav.findAll('.yixiaoer-tool-button')

    expect(tools).toHaveLength(4)
    for (const tool of tools) await tool.trigger('click')
    expect(nav.emitted('openSettings')).toBeUndefined()
    expect(nav.emitted('navigate')).toBeUndefined()
  })
})
