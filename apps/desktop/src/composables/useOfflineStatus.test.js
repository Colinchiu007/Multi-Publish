// @ts-check
/**
 * useOfflineStatus.test.js — 离线状态 composable 测试（Phase 4.1 TDD）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useOfflineStatus } from '../composables/useOfflineStatus'

describe('useOfflineStatus — composable setup', () => {
  let originalElectronAPI

  beforeEach(() => {
    originalElectronAPI = window.electronAPI
    vi.clearAllMocks()
  })

  afterEach(() => {
    window.electronAPI = originalElectronAPI
  })

  it('返回响应式状态和方法', () => {
    window.electronAPI = {}
    const r = useOfflineStatus()
    expect(r.isOffline).toBeDefined()
    expect(r.cachedTaskCount).toBeDefined()
    expect(typeof r.init).toBe('function')
  })

  it('初始 isOffline=false, cachedTaskCount=0', () => {
    window.electronAPI = {}
    const r = useOfflineStatus()
    expect(r.isOffline.value).toBe(false)
    expect(r.cachedTaskCount.value).toBe(0)
  })

  it('init 无 electronAPI 时不抛错', () => {
    window.electronAPI = undefined
    const r = useOfflineStatus()
    expect(function () { r.init() }).not.toThrow()
  })

  it('init 无 offlineStatus 方法时不抛错', () => {
    window.electronAPI = {}
    const r = useOfflineStatus()
    expect(function () { r.init() }).not.toThrow()
  })

  it('init 调用 offlineStatus 并更新状态（offline=true）', async () => {
    const offlineStatus = vi.fn(function () {
      return Promise.resolve({ code: 0, data: { offline: true, cachedCount: 3 } })
    })
    window.electronAPI = { offlineStatus }
    const r = useOfflineStatus()
    await r.init()
    expect(offlineStatus).toHaveBeenCalledTimes(1)
    expect(r.isOffline.value).toBe(true)
    expect(r.cachedTaskCount.value).toBe(3)
  })

  it('init 调用 offlineStatus 并更新状态（offline=false）', async () => {
    const offlineStatus = vi.fn(function () {
      return Promise.resolve({ code: 0, data: { offline: false, cachedCount: 0 } })
    })
    window.electronAPI = { offlineStatus }
    const r = useOfflineStatus()
    await r.init()
    expect(r.isOffline.value).toBe(false)
    expect(r.cachedTaskCount.value).toBe(0)
  })

  it('init code!=0 时不更新状态', async () => {
    const offlineStatus = vi.fn(function () {
      return Promise.resolve({ code: 1, data: {} })
    })
    window.electronAPI = { offlineStatus }
    const r = useOfflineStatus()
    r.isOffline.value = true
    r.cachedTaskCount.value = 5
    await r.init()
    expect(r.isOffline.value).toBe(true)
    expect(r.cachedTaskCount.value).toBe(5)
  })

  it('init 注册 onOfflineRestored 监听', () => {
    const offlineStatus = vi.fn(function () { return Promise.resolve({ code: 0, data: {} }) })
    const onOfflineRestored = vi.fn()
    window.electronAPI = { offlineStatus, onOfflineRestored }
    const r = useOfflineStatus()
    r.init()
    expect(onOfflineRestored).toHaveBeenCalledTimes(1)
  })

  it('onOfflineRestored 回调设置 isOffline=false + cachedTaskCount', () => {
    const offlineStatus = vi.fn(function () { return Promise.resolve({ code: 0, data: {} }) })
    const onOfflineRestored = vi.fn()
    window.electronAPI = { offlineStatus, onOfflineRestored }
    const r = useOfflineStatus()
    r.init()
    r.isOffline.value = true
    r.cachedTaskCount.value = 5
    const cb = onOfflineRestored.mock.calls[0][0]
    cb({ cachedCount: 2 })
    expect(r.isOffline.value).toBe(false)
    expect(r.cachedTaskCount.value).toBe(2)
  })

  it('onOfflineRestored 回调无 cachedCount 时设为 0', () => {
    const offlineStatus = vi.fn(function () { return Promise.resolve({ code: 0, data: {} }) })
    const onOfflineRestored = vi.fn()
    window.electronAPI = { offlineStatus, onOfflineRestored }
    const r = useOfflineStatus()
    r.init()
    const cb = onOfflineRestored.mock.calls[0][0]
    cb({})
    expect(r.cachedTaskCount.value).toBe(0)
  })

  it('init 抛错时不崩溃', () => {
    const offlineStatus = vi.fn(function () { throw new Error('fail') })
    window.electronAPI = { offlineStatus }
    const r = useOfflineStatus()
    expect(function () { r.init() }).not.toThrow()
  })
})
