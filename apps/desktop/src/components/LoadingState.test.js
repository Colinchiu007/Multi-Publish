import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadingState from './LoadingState.vue'

describe('LoadingState', () => {
  it('renders the text when provided', () => {
    const wrapper = mount(LoadingState, { props: { text: '加载中' } })
    expect(wrapper.find('.mp-loading-state__text').text()).toBe('加载中')
  })

  it('does not render text node when text is empty', () => {
    const wrapper = mount(LoadingState)
    expect(wrapper.find('.mp-loading-state__text').exists()).toBe(false)
  })

  it('applies the variant modifier class', () => {
    const wrapper = mount(LoadingState, { props: { variant: 'overlay' } })
    expect(wrapper.find('.mp-loading-state--overlay').exists()).toBe(true)
  })

  it('applies the small size modifier class', () => {
    const wrapper = mount(LoadingState, { props: { size: 'small' } })
    expect(wrapper.find('.mp-loading-state--small').exists()).toBe(true)
  })

  it('exposes status role and polite aria-live by default', () => {
    const wrapper = mount(LoadingState)
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('aria-live')).toBe('polite')
  })

  it('renders slotted content', () => {
    const wrapper = mount(LoadingState, { slots: { default: '<span class="child">x</span>' } })
    expect(wrapper.find('.child').exists()).toBe(true)
  })
})
