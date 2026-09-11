// @ts-check
/**
 * 装配冒烟测试：ipc-handlers/index.js → hot-topics.js 的 require 调用链。
 * 回归背景：hot-topics.js 曾导出 { registerHandlers } 对象而非函数，
 * index.js 直接调用 require('./hot-topics')(ipcMain, deps) 抛 TypeError，
 * 导致其后 9 个模块 IPC 注册全部中断（测试全绿但启动即崩）。
 */
import { describe, it, expect, vi } from 'vitest'

describe('ipc-handlers assembly: hot-topics', () => {
  it('index.js requires hot-topics as a callable function', async () => {
    const mod = await import('./hot-topics.js')
    expect(typeof mod.default === 'function' || typeof mod === 'function').toBe(true)
  })

  it('registerHandlers warns and skips when hotTopicsService missing (does not break other modules)', async () => {
    const register = (await import('./hot-topics.js')).default || (await import('./hot-topics.js'))
    const fakeIpc = { handle: vi.fn() }
    const warned = []
    register(fakeIpc, { log: { warn: (m) => warned.push(m) } })
    expect(fakeIpc.handle).not.toHaveBeenCalled()
    expect(warned.some(m => String(m).includes('hotTopicsService'))).toBe(true)
  })

  it('registerHandlers registers both channels when service present', async () => {
    const register = (await import('./hot-topics.js')).default || (await import('./hot-topics.js'))
    const fakeIpc = { handle: vi.fn() }
    const fakeService = { fetchTopics: vi.fn(), getCache: vi.fn() }
    register(fakeIpc, { hotTopicsService: fakeService })
    const channels = fakeIpc.handle.mock.calls.map(c => c[0])
    expect(channels).toContain('hot-topics:fetch')
    expect(channels).toContain('hot-topics:get-cache')
  })
})
