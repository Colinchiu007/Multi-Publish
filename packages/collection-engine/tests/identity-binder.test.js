import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
const req = createRequire(import.meta.url)
const { IdentityBinder } = req('../src/identity-binder')

describe('IdentityBinder', () => {
  let binder

  beforeEach(() => {
    binder = new IdentityBinder()
  })

  it('should bind and resolve', () => {
    binder.bind('zhihu', 'user1', 'fp_abc123', '192.168.1.1')
    const res = binder.resolve('zhihu', 'user1')
    expect(res).toBeTruthy()
    expect(res.fingerprint).toBe('fp_abc123')
    expect(res.ip).toBe('192.168.1.1')
    expect(res.sessionPartition).toBe('persist:rpa-zhihu-user1')
  })

  it('should return null for unbound account', () => {
    expect(binder.resolve('unknown', 'nobody')).toBeNull()
  })

  it('should unbind and return false on re-resolve', () => {
    binder.bind('douyin', 'user2')
    binder.unbind('douyin', 'user2')
    expect(binder.resolve('douyin', 'user2')).toBeNull()
  })

  it('should list all bindings', () => {
    binder.bind('zhihu', 'u1')
    binder.bind('wechat_mp', 'u2')
    const list = binder.list()
    expect(list.length).toBe(2)
    expect(list.map(b => b.platform).sort()).toEqual(['wechat_mp', 'zhihu'])
  })

  it('should generate session partition from browserData when available', () => {
    const mockBrowserData = { getPartition: (p, id) => 'persist:rpa-' + p + '-' + id }
    const smartBinder = new IdentityBinder({ browserData: mockBrowserData })
    smartBinder.bind('xiaohongshu', 'test_id')
    expect(smartBinder.resolve('xiaohongshu', 'test_id').sessionPartition)
      .toBe('persist:rpa-xiaohongshu-test_id')
  })

  it('should overwrite existing binding', () => {
    binder.bind('p', 'a', 'old_fp', 'old_ip')
    binder.bind('p', 'a', 'new_fp', 'new_ip')
    const res = binder.resolve('p', 'a')
    expect(res.fingerprint).toBe('new_fp')
    expect(res.ip).toBe('new_ip')
  })
})
