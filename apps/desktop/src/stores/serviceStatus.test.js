import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mockServicesGetStatus = vi.hoisted(() => vi.fn())

vi.mock('@/api/services', () => ({
  servicesGetStatus: (...args) => mockServicesGetStatus(...args),
}))

describe('serviceStatus store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    mockServicesGetStatus.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refresh 归一化服务列表并标记 loaded', async () => {
    mockServicesGetStatus.mockResolvedValue({
      code: 0,
      data: {
        services: [
          { key: 'mainBackend', name: '主服务', status: 'running', port: 8299 },
          { key: 'splitterEngine', name: '分句引擎', status: 'stopped', port: 8002 },
          { key: 'alignerEngine', name: '对齐引擎', status: 'standby', port: 8004 },
        ],
      },
    })
    const { useServiceStatusStore } = await import('./serviceStatus')
    const store = useServiceStatusStore()

    await expect(store.refresh()).resolves.toBe(true)

    expect(store.loaded).toBe(true)
    expect(store.unavailable).toBe(false)
    expect(store.services).toHaveLength(3)
    expect(store.services[0]).toMatchObject({ key: 'mainBackend', status: 'running', port: 8299 })
    expect(store.runningCount).toBe(1)
    expect(store.allRunning).toBe(false)
  })

  it('非法状态值归一为 stopped，非法 port 归一为 0', async () => {
    mockServicesGetStatus.mockResolvedValue({
      code: 0,
      data: { services: [{ key: 'x', name: 'X', status: 'exploded', port: 'abc' }] },
    })
    const { useServiceStatusStore } = await import('./serviceStatus')
    const store = useServiceStatusStore()

    await store.refresh()

    expect(store.services[0]).toMatchObject({ key: 'x', status: 'stopped', port: 0 })
  })

  it('IPC 不可用时标记 unavailable 且不抛错', async () => {
    mockServicesGetStatus.mockResolvedValue({ code: -1, message: 'SERVICES_API_UNAVAILABLE' })
    const { useServiceStatusStore } = await import('./serviceStatus')
    const store = useServiceStatusStore()

    await expect(store.refresh()).resolves.toBe(false)

    expect(store.unavailable).toBe(true)
    expect(store.loaded).toBe(false)
  })

  it('轮询期间旧响应不覆盖新状态（快照守卫）', async () => {
    let resolveFirst
    mockServicesGetStatus
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => Promise.resolve({
        code: 0,
        data: { services: [{ key: 'mainBackend', name: '主服务', status: 'running', port: 8299 }] },
      }))
    const { useServiceStatusStore } = await import('./serviceStatus')
    const store = useServiceStatusStore()

    const first = store.refresh()
    const second = store.refresh()
    await second
    resolveFirst({ code: 0, data: { services: [{ key: 'mainBackend', name: '主服务', status: 'stopped', port: 8299 }] } })
    await first

    expect(store.services[0].status).toBe('running')
  })

  it('startPolling 定时刷新，stopPolling 停止', async () => {
    mockServicesGetStatus.mockResolvedValue({
      code: 0,
      data: { services: [{ key: 'mainBackend', name: '主服务', status: 'running', port: 8299 }] },
    })
    const { useServiceStatusStore } = await import('./serviceStatus')
    const store = useServiceStatusStore()

    store.startPolling()
    expect(mockServicesGetStatus).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10000)
    expect(mockServicesGetStatus).toHaveBeenCalledTimes(2)

    store.stopPolling()
    await vi.advanceTimersByTimeAsync(30000)
    expect(mockServicesGetStatus).toHaveBeenCalledTimes(2)
  })
})
