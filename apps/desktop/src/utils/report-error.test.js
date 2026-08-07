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
})
