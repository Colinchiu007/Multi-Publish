// @ts-check
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

import { useTheme } from './useTheme'

const THEME_KEY = 'ui:theme'

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createMatchMedia(initialMatches) {
  let matches = initialMatches
  const listeners = new Set()
  const mediaQuery = {
    media: '(prefers-color-scheme: dark)',
    get matches() { return matches },
    addEventListener: vi.fn((type, listener) => {
      if (type === 'change') listeners.add(listener)
    }),
    removeEventListener: vi.fn((type, listener) => {
      if (type === 'change') listeners.delete(listener)
    }),
    dispatch(matchesNext) {
      matches = matchesNext
      const event = { matches, media: this.media }
      for (const listener of listeners) listener(event)
    },
  }

  const matchMedia = vi.fn(() => mediaQuery)
  return { matchMedia, mediaQuery }
}

function mountTheme() {
  let themeApi
  const wrapper = mount(defineComponent({
    setup() {
      themeApi = useTheme()
      return function () { return null }
    },
  }))
  return { wrapper, themeApi }
}

describe('useTheme', () => {
  let originalElectronAPI
  let originalMatchMedia
  let media
  const wrappers = []

  beforeEach(() => {
    originalElectronAPI = window.electronAPI
    originalMatchMedia = window.matchMedia
    media = createMatchMedia(false)
    window.matchMedia = media.matchMedia
    window.electronAPI = undefined
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    while (wrappers.length > 0) wrappers.pop().unmount()
    window.electronAPI = originalElectronAPI
    window.matchMedia = originalMatchMedia
    document.documentElement.removeAttribute('data-theme')
  })

  function createTheme() {
    const mounted = mountTheme()
    wrappers.push(mounted.wrapper)
    return mounted
  }

  it('存储读取完成前保持明确的 Loading 状态', async () => {
    const pending = deferred()
    window.electronAPI = {
      storeGetSetting: vi.fn(() => pending.promise),
    }

    const { themeApi } = createTheme()

    expect(themeApi).toEqual({
      theme: expect.any(Object),
      toggle: expect.any(Function),
      isDark: expect.any(Object),
      loaded: expect.any(Object),
    })
    expect(themeApi.theme.value).toBe('light')
    expect(themeApi.isDark.value).toBe(false)
    expect(themeApi.loaded.value).toBe(false)
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)

    pending.resolve({ code: 0, data: 'dark' })
    await flushPromises()
  })

  it('持久化暗色偏好优先于系统亮色并同步 DOM', async () => {
    const storeGetSetting = vi.fn().mockResolvedValue({ code: 0, data: 'dark' })
    window.electronAPI = { storeGetSetting }

    const { themeApi } = createTheme()
    await flushPromises()

    expect(storeGetSetting).toHaveBeenCalledWith(THEME_KEY)
    expect(themeApi.loaded.value).toBe(true)
    expect(themeApi.theme.value).toBe('dark')
    expect(themeApi.isDark.value).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('持久化亮色偏好优先于系统暗色', async () => {
    media = createMatchMedia(true)
    window.matchMedia = media.matchMedia
    window.electronAPI = {
      storeGetSetting: vi.fn().mockResolvedValue({ code: 0, data: 'light' }),
    }

    const { themeApi } = createTheme()
    await flushPromises()

    expect(themeApi.theme.value).toBe('light')
    expect(themeApi.isDark.value).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it.each([
    ['Electron API 缺失', undefined],
    ['读取方法缺失', {}],
  ])('%s 时按系统暗色偏好初始化', async (_label, electronAPI) => {
    media = createMatchMedia(true)
    window.matchMedia = media.matchMedia
    window.electronAPI = electronAPI

    const { themeApi } = createTheme()
    await flushPromises()

    expect(themeApi.loaded.value).toBe(true)
    expect(themeApi.theme.value).toBe('dark')
    expect(themeApi.isDark.value).toBe(true)
  })

  it.each([
    ['非成功响应', { code: 1, data: 'dark' }],
    ['空偏好', { code: 0, data: '' }],
    ['空响应', null],
  ])('存储返回%s时回退到系统亮色', async (_label, response) => {
    window.electronAPI = {
      storeGetSetting: vi.fn().mockResolvedValue(response),
    }

    const { themeApi } = createTheme()
    await flushPromises()

    expect(themeApi.loaded.value).toBe(true)
    expect(themeApi.theme.value).toBe('light')
    expect(themeApi.isDark.value).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('读取持久化偏好失败时静默回退到系统主题', async () => {
    media = createMatchMedia(true)
    window.matchMedia = media.matchMedia
    window.electronAPI = {
      storeGetSetting: vi.fn().mockRejectedValue(new Error('存储不可用')),
    }

    const { themeApi } = createTheme()
    await flushPromises()

    expect(themeApi.loaded.value).toBe(true)
    expect(themeApi.theme.value).toBe('dark')
  })

  it('无用户偏好时跟随系统主题变化', async () => {
    const { themeApi } = createTheme()
    await flushPromises()

    media.mediaQuery.dispatch(true)
    await nextTick()
    expect(themeApi.theme.value).toBe('dark')
    expect(themeApi.isDark.value).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    media.mediaQuery.dispatch(false)
    await nextTick()
    expect(themeApi.theme.value).toBe('light')
    expect(themeApi.isDark.value).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('有用户偏好时忽略后续系统主题变化', async () => {
    window.electronAPI = {
      storeGetSetting: vi.fn().mockResolvedValue({ code: 0, data: 'light' }),
    }
    const { themeApi } = createTheme()
    await flushPromises()

    media.mediaQuery.dispatch(true)
    await nextTick()

    expect(themeApi.theme.value).toBe('light')
    expect(themeApi.isDark.value).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('toggle 从亮色切到暗色并持久化', async () => {
    const storeSetSetting = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = { storeSetSetting }
    const { themeApi } = createTheme()
    await flushPromises()

    themeApi.toggle()
    await flushPromises()

    expect(themeApi.theme.value).toBe('dark')
    expect(themeApi.isDark.value).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(storeSetSetting).toHaveBeenCalledWith(THEME_KEY, 'dark')
  })

  it('toggle 从暗色切到亮色并持久化', async () => {
    const storeSetSetting = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = {
      storeGetSetting: vi.fn().mockResolvedValue({ code: 0, data: 'dark' }),
      storeSetSetting,
    }
    const { themeApi } = createTheme()
    await flushPromises()

    themeApi.toggle()
    await flushPromises()

    expect(themeApi.theme.value).toBe('light')
    expect(themeApi.isDark.value).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(storeSetSetting).toHaveBeenCalledWith(THEME_KEY, 'light')
  })

  it.each([
    ['Electron API 缺失', undefined],
    ['写入方法缺失', {}],
  ])('toggle 在%s时仍完成本地切换', async (_label, electronAPI) => {
    window.electronAPI = electronAPI
    const { themeApi } = createTheme()
    await flushPromises()

    themeApi.toggle()
    await flushPromises()

    expect(themeApi.theme.value).toBe('dark')
    expect(themeApi.isDark.value).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('持久化失败时不回滚已生效的本地主题', async () => {
    const storeSetSetting = vi.fn().mockRejectedValue(new Error('写入失败'))
    window.electronAPI = { storeSetSetting }
    const { themeApi } = createTheme()
    await flushPromises()

    themeApi.toggle()
    await flushPromises()

    expect(themeApi.theme.value).toBe('dark')
    expect(themeApi.isDark.value).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('手动切换后不再被系统主题变化覆盖', async () => {
    window.electronAPI = { storeSetSetting: vi.fn().mockResolvedValue(undefined) }
    const { themeApi } = createTheme()
    await flushPromises()

    themeApi.toggle()
    await flushPromises()
    media.mediaQuery.dispatch(false)
    await nextTick()

    expect(themeApi.theme.value).toBe('dark')
    expect(themeApi.isDark.value).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('组件卸载后移除系统主题 change 监听器', async () => {
    const { wrapper } = createTheme()
    await flushPromises()
    const listener = media.mediaQuery.addEventListener.mock.calls[0][1]

    wrapper.unmount()

    expect(media.mediaQuery.removeEventListener).toHaveBeenCalledWith('change', listener)
  })

  it('异步读取偏好期间卸载后不再修改 DOM 或注册监听器', async () => {
    const pending = deferred()
    window.electronAPI = { storeGetSetting: vi.fn(() => pending.promise) }
    const { wrapper } = createTheme()

    wrapper.unmount()
    pending.resolve({ code: 0, data: 'dark' })
    await flushPromises()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(media.mediaQuery.addEventListener).not.toHaveBeenCalled()
  })
})
