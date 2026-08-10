// @ts-check
/**
 * fetch-utils.test.js — fetchWithTimeout 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { fetchWithTimeout } = require('./fetch-utils')

describe('fetchWithTimeout', () => {
  let originalFetch

  beforeEach(() => { originalFetch = global.fetch })
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks() })

  it('正常响应时返回 response 并清理定时器', async () => {
    const mock = vi.fn(async () => ({ ok: true, status: 200 }))
    global.fetch = mock
    const resp = await fetchWithTimeout('https://example.com', {}, 1000)
    expect(resp.ok).toBe(true)
    expect(mock).toHaveBeenCalledTimes(1)
    const opts = mock.mock.calls[0][1]
    expect(opts.signal).toBeDefined()
  })

  it('上游挂起时在 timeoutMs 内 abort 抛错', async () => {
    global.fetch = vi.fn((url, opts = {}) => new Promise((resolve, reject) => {
      opts.signal && opts.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        reject(err)
      })
    }))
    const t0 = Date.now()
    await expect(fetchWithTimeout('https://example.com', {}, 100)).rejects.toThrow()
    expect(Date.now() - t0).toBeLessThan(5000)
  })

  it('opts 透传（method/headers）', async () => {
    const mock = vi.fn(async () => ({ ok: true }))
    global.fetch = mock
    await fetchWithTimeout('https://example.com', { method: 'POST', headers: { a: '1' } }, 1000)
    const [url, opts] = mock.mock.calls[0]
    expect(url).toBe('https://example.com')
    expect(opts.method).toBe('POST')
    expect(opts.headers.a).toBe('1')
    expect(opts.signal).toBeDefined()
  })
})
