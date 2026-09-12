import { describe, expect, it, vi } from 'vitest'

describe('services IPC', () => {
  it('聚合六个服务的运行状态并返回稳定结构', async () => {
    const registerServicesHandlers = require('./services')
    const handlers = {}
    const deps = {
      pythonBridge: { isRunning: vi.fn(() => true), currentPort: vi.fn(() => 8299) },
      splitterBridge: { healthCheck: vi.fn(async () => true), isRunning: true, port: 8002 },
      promptBridge: { healthCheck: vi.fn(async () => true), isRunning: true, port: 8013 },
      callbackServer: { server: { listening: true }, port: 16521 },
      story2videoMediaServer: { origin: 'http://127.0.0.1:54321' },
      alignerBridge: null,
    }
    registerServicesHandlers({ handle: (channel, handler) => { handlers[channel] = handler } }, deps)
    const event = { senderFrame: { url: 'app://localhost/index.html' } }

    const result = await handlers['services:get-status'](event)

    expect(result.code).toBe(0)
    expect(result.data.services).toHaveLength(6)
    expect(result.data.services.map((s) => s.key)).toEqual([
      'mainBackend', 'splitterEngine', 'promptEngine', 'callbackServer', 'mediaServer', 'alignerEngine',
    ])
    const main = result.data.services.find((s) => s.key === 'mainBackend')
    expect(main).toMatchObject({ status: 'running', port: 8299 })
    const aligner = result.data.services.find((s) => s.key === 'alignerEngine')
    expect(aligner).toMatchObject({ status: 'standby', port: 8004 })
  })

  it('服务异常时返回 stopped 而不是抛错', async () => {
    const registerServicesHandlers = require('./services')
    const handlers = {}
    const deps = {
      pythonBridge: { isRunning: vi.fn(() => false), currentPort: vi.fn(() => 8299) },
      splitterBridge: { healthCheck: vi.fn(async () => { throw new Error('ECONNREFUSED') }), port: 8002 },
      promptBridge: { healthCheck: vi.fn(async () => false), port: 8013 },
      callbackServer: { server: null, port: 16521 },
      story2videoMediaServer: { origin: '' },
      alignerBridge: null,
    }
    registerServicesHandlers({ handle: (channel, handler) => { handlers[channel] = handler } }, deps)
    const event = { senderFrame: { url: 'app://localhost/index.html' } }

    const result = await handlers['services:get-status'](event)

    expect(result.code).toBe(0)
    const byKey = Object.fromEntries(result.data.services.map((s) => [s.key, s.status]))
    expect(byKey).toEqual({
      mainBackend: 'stopped',
      splitterEngine: 'stopped',
      promptEngine: 'stopped',
      callbackServer: 'stopped',
      mediaServer: 'stopped',
      alignerEngine: 'standby',
    })
  })

  it('不可信 sender 不能查询服务状态', async () => {
    const registerServicesHandlers = require('./services')
    const handlers = {}
    registerServicesHandlers({ handle: (channel, handler) => { handlers[channel] = handler } }, {})
    const result = await handlers['services:get-status']({ senderFrame: { url: 'https://evil.example' } })
    expect(result).toMatchObject({ code: -3 })
  })
})
