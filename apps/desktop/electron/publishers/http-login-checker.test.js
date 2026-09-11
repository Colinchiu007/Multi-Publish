// @ts-check
/**
 * HTTP API 登录检测测试 — 验证蚁小二逆向的 API 端点调用与判定逻辑
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('http-login-checker', () => {
  let checker

  beforeEach(async () => {
    vi.resetModules()
    global.__enableElectronMock()
    global.__resetElectronMock()
    __registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
    checker = await import('./http-login-checker.js')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isHttpCheckSupported', () => {
    it('douyin 和 toutiao 已注册', () => {
      expect(checker.isHttpCheckSupported('douyin')).toBe(true)
      expect(checker.isHttpCheckSupported('toutiao')).toBe(true)
    })

    it('未注册平台返回 false', () => {
      expect(checker.isHttpCheckSupported('wechat_mp')).toBe(false)
      expect(checker.isHttpCheckSupported('bilibili')).toBe(false)
      expect(checker.isHttpCheckSupported('kuaishou')).toBe(false)
    })
  })

  describe('cookiesToHeader', () => {
    it('Cookie 数组转请求头字符串', () => {
      const result = checker.cookiesToHeader([
        { name: 'sid', value: 'abc' },
        { name: 'token', value: 'xyz' }
      ])
      expect(result).toBe('sid=abc; token=xyz')
    })

    it('空数组返回空串', () => {
      expect(checker.cookiesToHeader([])).toBe('')
      expect(checker.cookiesToHeader(null)).toBe('')
    })
  })

  describe('checkLoginViaHttpApi', () => {
    it('未注册平台返回 supported: false', async () => {
      const result = await checker.checkLoginViaHttpApi('unknown_platform', [{ name: 'a', value: 'b' }])
      expect(result).toEqual({ supported: false })
    })

    it('无 Cookie 时返回 NO_CREDENTIAL', async () => {
      const result = await checker.checkLoginViaHttpApi('douyin', [])
      expect(result).toEqual({ supported: true, valid: false, code: 'CHECK_LOGIN_NO_CREDENTIAL' })
    })

    it('抖音 API 成功响应 → valid', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status_code: 0, data: { uid: '123', nickname: 'test' } }),
        headers: new Map()
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await checker.checkLoginViaHttpApi('douyin', [{ name: 'sid', value: 'valid' }])
      expect(result).toEqual({ supported: true, valid: true, code: 'CHECK_LOGIN_SUCCESS_HTTP_API' })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://creator.douyin.com/aweme/v1/creator/pc/user/info/',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Cookie: 'sid=valid',
            Referer: 'https://creator.douyin.com/creator-micro/home'
          })
        })
      )
    })

    it('抖音 status_code 非 0 → expired', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status_code: 8, status_msg: '未登录' }),
        headers: new Map()
      }))

      const result = await checker.checkLoginViaHttpApi('douyin', [{ name: 'sid', value: 'expired' }])
      expect(result).toEqual({ supported: true, valid: false, code: 'CHECK_LOGIN_COOKIE_EXPIRED' })
    })

    it('头条 code 0 且有 user.id → valid', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ code: 0, data: { user: { id: '456', screen_name: '头条号' } } }),
        headers: new Map()
      }))

      const result = await checker.checkLoginViaHttpApi('toutiao', [{ name: 'session', value: 'valid' }])
      expect(result).toEqual({ supported: true, valid: true, code: 'CHECK_LOGIN_SUCCESS_HTTP_API' })
    })

    it('302 重定向到登录页 → expired', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        headers: new Map([['location', 'https://creator.douyin.com/login']])
      }))

      const result = await checker.checkLoginViaHttpApi('douyin', [{ name: 'sid', value: 'expired' }])
      expect(result).toEqual({ supported: true, valid: false, code: 'CHECK_LOGIN_COOKIE_EXPIRED' })
    })

    it('网络错误返回 valid: undefined（降级到浏览器检测）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

      const result = await checker.checkLoginViaHttpApi('douyin', [{ name: 'sid', value: 'x' }])
      expect(result.supported).toBe(true)
      expect(result.valid).toBeUndefined()
      expect(result.code).toBe('CHECK_LOGIN_HTTP_ERROR')
    })
  })
})
