import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useDropdownBehavior } from './useDropdownBehavior'

const TestComponent = defineComponent({
  setup() {
    const behavior = useDropdownBehavior()
    return () => h('div', { ref: behavior.root, class: 'dropdown-root' }, [
      h('button', { ref: behavior.trigger, type: 'button', onClick: behavior.toggle }, '触发器'),
      behavior.open.value
        ? h('div', { ref: behavior.panel, class: 'dropdown-panel', onKeydown: behavior.handleMenuKeydown }, [
            h('button', { type: 'button', role: 'menuitem', onClick: behavior.close }, '菜单项一'),
            h('button', { type: 'button', role: 'menuitem', onClick: behavior.close }, '菜单项二'),
          ])
        : null,
    ])
  },
})

function mountBehavior() {
  const wrapper = mount(TestComponent, { attachTo: document.body })
  return wrapper
}

describe('useDropdownBehavior', () => {
  it('toggle 打开面板并聚焦首个菜单项', async () => {
    const wrapper = mountBehavior()
    expect(wrapper.find('.dropdown-panel').exists()).toBe(false)
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('.dropdown-panel').exists()).toBe(true)
    expect(document.activeElement).toBe(wrapper.findAll('[role="menuitem"]')[0].element)
    wrapper.unmount()
  })

  it('再次 toggle 关闭面板', async () => {
    const wrapper = mountBehavior()
    const trigger = wrapper.get('button')
    await trigger.trigger('click')
    expect(wrapper.find('.dropdown-panel').exists()).toBe(true)
    await trigger.trigger('click')
    expect(wrapper.find('.dropdown-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Esc 关闭面板并把焦点还给触发器', async () => {
    const wrapper = mountBehavior()
    await wrapper.get('button').trigger('click')
    await wrapper.get('.dropdown-panel').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.dropdown-panel').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('button').element)
    wrapper.unmount()
  })

  it('点击面板外部关闭面板', async () => {
    const wrapper = mountBehavior()
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('.dropdown-panel').exists()).toBe(true)
    document.body.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.dropdown-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('方向键在菜单项之间移动焦点', async () => {
    const wrapper = mountBehavior()
    await wrapper.get('button').trigger('click')
    const items = wrapper.findAll('[role="menuitem"]')
    await wrapper.get('.dropdown-panel').trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1].element)
    await wrapper.get('.dropdown-panel').trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0].element)
    await wrapper.get('.dropdown-panel').trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(items[1].element)
    wrapper.unmount()
  })
})