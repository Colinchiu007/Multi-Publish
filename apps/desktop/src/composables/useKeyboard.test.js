// @ts-check
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

import { useKeyboard } from './useKeyboard'

function mountKeyboard(handlers = {}) {
  let keyboard
  const wrapper = mount(defineComponent({
    setup() {
      keyboard = useKeyboard(handlers)
      return function () { return null }
    },
  }))

  return { wrapper, keyboard }
}

function dispatchKey(key, options = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  })
  window.dispatchEvent(event)
  return event
}

describe('useKeyboard', () => {
  let handlers
  const wrappers = []

  beforeEach(() => {
    handlers = {
      onSearch: vi.fn(),
      onNewPublish: vi.fn(),
      onSettings: vi.fn(),
      onEscape: vi.fn(),
      onNavigateNext: vi.fn(),
      onNavigatePrev: vi.fn(),
    }
  })

  afterEach(() => {
    while (wrappers.length > 0) wrappers.pop().unmount()
  })

  function createKeyboard(customHandlers = handlers) {
    const mounted = mountKeyboard(customHandlers)
    wrappers.push(mounted.wrapper)
    return mounted
  }

  it('公开返回 handleKeyDown 方法', () => {
    const { keyboard } = createKeyboard()

    expect(keyboard).toEqual({ handleKeyDown: expect.any(Function) })
  })

  it.each([
    ['Ctrl+K', 'k', { ctrlKey: true }, 'onSearch'],
    ['Cmd+K', 'k', { metaKey: true }, 'onSearch'],
    ['Ctrl+N', 'n', { ctrlKey: true }, 'onNewPublish'],
    ['Cmd+,', ',', { metaKey: true }, 'onSettings'],
    ['Ctrl+Shift+]', ']', { ctrlKey: true, shiftKey: true }, 'onNavigateNext'],
    ['Cmd+Shift+[', '[', { metaKey: true, shiftKey: true }, 'onNavigatePrev'],
  ])('%s 阻止浏览器默认行为并调用对应处理器', (_label, key, options, handlerName) => {
    createKeyboard()

    const event = dispatchKey(key, options)

    expect(event.defaultPrevented).toBe(true)
    expect(handlers[handlerName]).toHaveBeenCalledTimes(1)
    for (const [name, handler] of Object.entries(handlers)) {
      if (name !== handlerName) expect(handler).not.toHaveBeenCalled()
    }
  })

  it('Escape 调用关闭处理器且保留默认行为', () => {
    createKeyboard()

    const event = dispatchKey('Escape')

    expect(event.defaultPrevented).toBe(false)
    expect(handlers.onEscape).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['无修饰键的 K', 'k', {}],
    ['未注册的 Ctrl+X', 'x', { ctrlKey: true }],
    ['缺少 Meta/Ctrl 的 Shift+]', ']', { shiftKey: true }],
    ['不同大小写的 Ctrl+K', 'K', { ctrlKey: true }],
  ])('%s 不触发任何处理器', (_label, key, options) => {
    createKeyboard()

    const event = dispatchKey(key, options)

    expect(event.defaultPrevented).toBe(false)
    for (const handler of Object.values(handlers)) {
      expect(handler).not.toHaveBeenCalled()
    }
  })

  it('未提供可选处理器时所有已注册快捷键均不会抛错', () => {
    createKeyboard({})

    expect(() => {
      dispatchKey('k', { ctrlKey: true })
      dispatchKey('n', { metaKey: true })
      dispatchKey(',', { ctrlKey: true })
      dispatchKey(']', { ctrlKey: true, shiftKey: true })
      dispatchKey('[', { metaKey: true, shiftKey: true })
      dispatchKey('Escape')
    }).not.toThrow()
  })

  it('不传参数时使用空处理器集合', () => {
    const mounted = mountKeyboard()
    wrappers.push(mounted.wrapper)

    expect(() => mounted.keyboard.handleKeyDown(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true }),
    )).not.toThrow()
  })

  it('公开的 handleKeyDown 可直接处理事件', () => {
    const { keyboard } = createKeyboard()
    const event = new KeyboardEvent('keydown', {
      key: 'n',
      metaKey: true,
      cancelable: true,
    })

    keyboard.handleKeyDown(event)

    expect(event.defaultPrevented).toBe(true)
    expect(handlers.onNewPublish).toHaveBeenCalledTimes(1)
  })

  it('组件卸载后移除 window 键盘监听器', () => {
    const { wrapper } = createKeyboard()
    dispatchKey('k', { ctrlKey: true })
    expect(handlers.onSearch).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    dispatchKey('k', { ctrlKey: true })

    expect(handlers.onSearch).toHaveBeenCalledTimes(1)
  })
})
