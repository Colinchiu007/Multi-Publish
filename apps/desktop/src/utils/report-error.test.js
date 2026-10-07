import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { reportError } from './report-error'

describe('reportError 渲染进程错误上报', () => {
  const originalLog = console.error
  const originalApi = globalThis.window?.electronAPI
  let calls

  beforeEach(() => {
    calls = []
    console.error = (...args) => { calls.push(args) }
    globalThis.window = { electronAPI: undefined }
  })

  afterEach(() => {
    console.error = originalLog
    if (originalApi === undefined) delete globalThis.window.electronAPI
    else globalThis.window.electronAPI = originalApi
  })

  it('有 electronAPI.logError 时上报主进程且不再写控制台', () => {
    const logError = vi.fn()
    globalThis.window.electronAPI = { logError }
    reportError('加载失败', new Error('boom'))
    expect(logError).toHaveBeenCalledWith('加载失败: boom')
    expect(calls.length).toBe(0)
  })

  it('无 electronAPI 时回退 console.error 且不抛错', () => {
    expect(() => reportError('加载失败', new Error('boom'))).not.toThrow()
    expect(calls.length).toBeGreaterThan(0)
  })

  it('错误对象无 message 时仅上报前缀文案', () => {
    const logError = vi.fn()
    globalThis.window.electronAPI = { logError }
    reportError('刷新失败', undefined)
    expect(logError).toHaveBeenCalledWith('刷新失败')
  })

  // ── 以下三条锁 M-5：logError 是 IPC invoke，返回 Promise ──────────────────
  // try/catch 只能兜**同步**抛错；异步拒绝会逃出去变成 unhandledrejection。
  // 而 `:16` 的早退 return 又让这种失败永远走不到 console 兜底 ——
  // 结果是错误既没进主进程日志、也没进控制台，彻底丢失。
  it('logError 返回的 Promise 拒绝时必须回退 console.error', async () => {
    const logError = vi.fn().mockRejectedValue(new Error('IPC 断了'))
    globalThis.window.electronAPI = { logError }
    reportError('加载失败', new Error('boom'))
    // 让拒绝的 Promise 完成其微任务队列
    await Promise.resolve()
    await Promise.resolve()
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0][0]).toBe('加载失败')
  })

  it('logError 异步拒绝不得逃成 unhandledrejection', async () => {
    const rejections = []
    const onRej = (e) => { rejections.push(e); e.preventDefault?.() }
    process.on('unhandledRejection', onRej)
    try {
      globalThis.window.electronAPI = { logError: vi.fn().mockRejectedValue(new Error('IPC 断了')) }
      reportError('加载失败', new Error('boom'))
      // 多让几轮微任务，确保拒绝已被处理
      for (let i = 0; i < 5; i++) await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))
    } finally {
      process.off('unhandledRejection', onRej)
    }
    expect(rejections).toEqual([])
  })

  it('logError 正常 resolve 时不得写 console（不得把成功路径也回退成噪音）', async () => {
    const logError = vi.fn().mockResolvedValue(undefined)
    globalThis.window.electronAPI = { logError }
    reportError('加载失败', new Error('boom'))
    await Promise.resolve()
    expect(calls.length).toBe(0)
  })
})
