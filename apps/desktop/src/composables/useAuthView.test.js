// @ts-check
/**
 * useAuthView.test.js — 登录视图 composable 测试（Phase 4.1 TDD）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuthView } from '../composables/useAuthView'

describe('useAuthView — composable setup', () => {
  let originalElectronAPI
  let onAuthViewOpened, onAuthViewClosed, onAuthCompleted, authClose

  beforeEach(() => {
    originalElectronAPI = window.electronAPI
    vi.clearAllMocks()
    onAuthViewOpened = vi.fn()
    onAuthViewClosed = vi.fn()
    onAuthCompleted = vi.fn()
    authClose = vi.fn()
  })

  afterEach(() => {
    window.electronAPI = originalElectronAPI
  })

  it('返回响应式状态和方法', () => {
    window.electronAPI = {}
    const r = useAuthView()
    expect(r.authViewVisible).toBeDefined()
    expect(typeof r.closeLogin).toBe('function')
    expect(typeof r.registerListeners).toBe('function')
  })

  it('初始 authViewVisible=false', () => {
    window.electronAPI = {}
    const r = useAuthView()
    expect(r.authViewVisible.value).toBe(false)
  })

  it('registerListeners 无 electronAPI 时不抛错', () => {
    window.electronAPI = undefined
    const r = useAuthView()
    expect(function () { r.registerListeners() }).not.toThrow()
  })

  it('registerListeners 注册 onAuthViewOpened / onAuthViewClosed / onAuthCompleted', () => {
    window.electronAPI = { onAuthViewOpened, onAuthViewClosed, onAuthCompleted }
    const r = useAuthView()
    r.registerListeners()
    expect(onAuthViewOpened).toHaveBeenCalledTimes(1)
    expect(onAuthViewClosed).toHaveBeenCalledTimes(1)
    expect(onAuthCompleted).toHaveBeenCalledTimes(1)
  })

  it('onAuthViewOpened 回调设置 authViewVisible=true', () => {
    window.electronAPI = { onAuthViewOpened, onAuthViewClosed, onAuthCompleted }
    const r = useAuthView()
    r.registerListeners()
    // 模拟触发回调
    const cb = onAuthViewOpened.mock.calls[0][0]
    cb()
    expect(r.authViewVisible.value).toBe(true)
  })

  it('onAuthViewClosed 回调设置 authViewVisible=false', () => {
    window.electronAPI = { onAuthViewOpened, onAuthViewClosed, onAuthCompleted }
    const r = useAuthView()
    r.registerListeners()
    r.authViewVisible.value = true
    const cb = onAuthViewClosed.mock.calls[0][0]
    cb()
    expect(r.authViewVisible.value).toBe(false)
  })

  it('onAuthCompleted 回调设置 authViewVisible=false', () => {
    window.electronAPI = { onAuthViewOpened, onAuthViewClosed, onAuthCompleted }
    const r = useAuthView()
    r.registerListeners()
    r.authViewVisible.value = true
    const cb = onAuthCompleted.mock.calls[0][0]
    cb()
    expect(r.authViewVisible.value).toBe(false)
  })

  it('closeLogin 调用 electronAPI.authClose 并设置 authViewVisible=false', () => {
    window.electronAPI = { authClose }
    const r = useAuthView()
    r.authViewVisible.value = true
    r.closeLogin()
    expect(authClose).toHaveBeenCalledTimes(1)
    expect(r.authViewVisible.value).toBe(false)
  })

  it('closeLogin 无 electronAPI 时仅设置 authViewVisible=false', () => {
    window.electronAPI = undefined
    const r = useAuthView()
    r.authViewVisible.value = true
    r.closeLogin()
    expect(r.authViewVisible.value).toBe(false)
  })

  it('closeLogin 无 authClose 方法时仅设置 authViewVisible=false', () => {
    window.electronAPI = {}
    const r = useAuthView()
    r.authViewVisible.value = true
    r.closeLogin()
    expect(r.authViewVisible.value).toBe(false)
  })
})
