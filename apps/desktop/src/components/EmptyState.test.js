import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('renders the required title', () => {
    const wrapper = mount(EmptyState, { props: { title: '暂无数据' } })
    expect(wrapper.find('.mp-empty-state__title').text()).toBe('暂无数据')
  })

  it('renders description only when provided', () => {
    const without = mount(EmptyState, { props: { title: 't' } })
    expect(without.find('.mp-empty-state__hint').exists()).toBe(false)
    const withDesc = mount(EmptyState, { props: { title: 't', description: 'hint' } })
    expect(withDesc.find('.mp-empty-state__hint').exists()).toBe(true)
    expect(withDesc.find('.mp-empty-state__hint').text()).toBe('hint')
  })

  it('renders the icon slot fallback', () => {
    const wrapper = mount(EmptyState, { props: { title: 't', icon: '🎬' } })
    expect(wrapper.find('.mp-empty-state__icon').text()).toContain('🎬')
  })

  it('emits action when the default action button is clicked', async () => {
    const wrapper = mount(EmptyState, { props: { title: 't', actionText: '重试' } })
    await wrapper.find('button.mp-empty-state__action').trigger('click')
    expect(wrapper.emitted('action')).toBeTruthy()
  })

  it('prefers the actions slot over the default button', () => {
    const wrapper = mount(EmptyState, {
      props: { title: 't', actionText: '忽略' },
      slots: { actions: '<a class="custom-action">slot</a>' }
    })
    expect(wrapper.find('button.mp-empty-state__action').exists()).toBe(false)
    expect(wrapper.find('.custom-action').exists()).toBe(true)
  })

  it('applies the compact modifier class', () => {
    const wrapper = mount(EmptyState, { props: { title: 't', compact: true } })
    expect(wrapper.find('.mp-empty-state--compact').exists()).toBe(true)
  })

  it('does not render the actions block without actionText or slot', () => {
    const wrapper = mount(EmptyState, { props: { title: 't' } })
    expect(wrapper.find('.mp-empty-state__actions').exists()).toBe(false)
  })
})
