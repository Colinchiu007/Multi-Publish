import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UiButton from './UiButton.vue'

describe('UiButton', () => {
  it('renders with default props', () => {
    const wrapper = mount(UiButton, { slots: { default: 'Click me' } })
    expect(wrapper.text()).toBe('Click me')
    expect(wrapper.attributes('disabled')).toBeUndefined()
    expect(wrapper.classes()).toContain('ui-btn-primary')
    expect(wrapper.classes()).toContain('ui-btn-md')
  })

  it('renders as button tag by default', () => {
    const wrapper = mount(UiButton)
    expect(wrapper.element.tagName).toBe('BUTTON')
  })

  it('renders as anchor when tag=a', () => {
    const wrapper = mount(UiButton, { props: { tag: 'a' } })
    expect(wrapper.element.tagName).toBe('A')
  })

  it('applies variant class', () => {
    const wrapper = mount(UiButton, { props: { variant: 'danger' } })
    expect(wrapper.classes()).toContain('ui-btn-danger')
  })

  it('applies size class', () => {
    const wrapper = mount(UiButton, { props: { size: 'lg' } })
    expect(wrapper.classes()).toContain('ui-btn-lg')
  })

  it('disables button', () => {
    const wrapper = mount(UiButton, { props: { disabled: true } })
    expect(wrapper.attributes('disabled')).toBeDefined()
  })

  it('emits click event', async () => {
    const wrapper = mount(UiButton)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})