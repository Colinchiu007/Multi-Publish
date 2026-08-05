import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import RouteLoadError from './RouteLoadError.vue'

describe('RouteLoadError', () => {
  it('renders recovery actions and emits retry/refresh', async () => {
    const wrapper = mount(RouteLoadError, {
      props: {
        message: '动态模块加载失败',
        details: '/create: Failed to fetch dynamically imported module',
      },
    })

    expect(wrapper.get('[data-testid="route-load-error"]').text()).toContain('动态模块加载失败')
    expect(wrapper.get('[data-testid="route-load-error"]').text()).toContain('Failed to fetch dynamically imported module')

    await wrapper.get('[data-testid="route-load-retry"]').trigger('click')
    await wrapper.get('[data-testid="route-load-refresh"]').trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

})
