// @ts-check
/**
 * crypto.test.js — P2 TDD 先行测试
 *
 * 验证 API Key 加密/解密/遮罩功能：
 * - encrypt/decrypt 往返测试（mock safeStorage）
 * - safeStorage 不可用时拒绝存储（抛错，非降级明文）
 * - mask 遮罩显示（sk-****1234）
 * - setSafeStorage 注入 mock（测试用）
 *
 * 关键设计决策（审查记录第 17 行）：
 * safeStorage 不可用时拒绝存储 + UI 显示警告（非降级明文）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── mock safeStorage ───
function createMockSafeStorage() {
  const store = new Map()
  let counter = 0
  return {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str) => {
      const key = `enc_${counter++}_${str}`
      store.set(key, str)
      return Buffer.from(key, 'utf-8')
    }),
    decryptString: vi.fn((buf) => {
      const key = buf.toString('utf-8')
      return store.get(key) || ''
    }),
  }
}

let crypto

beforeEach(() => {
  __enableElectronMock()
  delete require.cache[require.resolve('./crypto')]
  crypto = require('./crypto')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('crypto — P2 API Key 加密', () => {
  describe('setSafeStorage / getSafeStorage', () => {
    it('setSafeStorage 注入 mock safeStorage', () => {
      const mock = createMockSafeStorage()
      crypto.setSafeStorage(mock)
      expect(crypto.isAvailable()).toBe(true)
    })

    it('未注入且 electron 不可用时 isAvailable 返回 false', () => {
      crypto.setSafeStorage(null)
      expect(crypto.isAvailable()).toBe(false)
    })
  })

  describe('encrypt', () => {
    it('encrypt 加密字符串返回 Buffer', () => {
      const mock = createMockSafeStorage()
      crypto.setSafeStorage(mock)
      const encrypted = crypto.encrypt('sk-test-key-12345')
      expect(Buffer.isBuffer(encrypted)).toBe(true)
      expect(encrypted.length).toBeGreaterThan(0)
      expect(mock.encryptString).toHaveBeenCalledWith('sk-test-key-12345')
    })

    it('encrypt(null) 返回 null', () => {
      crypto.setSafeStorage(createMockSafeStorage())
      expect(crypto.encrypt(null)).toBeNull()
      expect(crypto.encrypt(undefined)).toBeNull()
      expect(crypto.encrypt('')).toBeNull()
    })

    it('safeStorage 不可用时 encrypt 抛错（拒绝降级明文）', () => {
      crypto.setSafeStorage(null)
      expect(() => crypto.encrypt('sk-test-key')).toThrow(/safeStorage.*not.*available/i)
    })
  })

  describe('decrypt', () => {
    it('decrypt 解密 Buffer 返回原文', () => {
      const mock = createMockSafeStorage()
      crypto.setSafeStorage(mock)
      const encrypted = crypto.encrypt('sk-test-key-12345')
      const decrypted = crypto.decrypt(encrypted)
      expect(decrypted).toBe('sk-test-key-12345')
    })

    it('decrypt(null) 返回空字符串', () => {
      crypto.setSafeStorage(createMockSafeStorage())
      expect(crypto.decrypt(null)).toBe('')
      expect(crypto.decrypt(undefined)).toBe('')
      expect(crypto.decrypt('')).toBe('')
    })

    it('decrypt 接受 Buffer 或 string', () => {
      const mock = createMockSafeStorage()
      crypto.setSafeStorage(mock)
      const encrypted = crypto.encrypt('sk-test-key')
      expect(crypto.decrypt(encrypted)).toBe('sk-test-key')
      const base64 = encrypted.toString('base64')
      expect(crypto.decrypt(base64)).toBe('sk-test-key')
    })

    it('safeStorage 不可用时 decrypt 抛错（拒绝降级明文）', () => {
      crypto.setSafeStorage(null)
      expect(() => crypto.decrypt(Buffer.from('test'))).toThrow(/safeStorage.*not.*available/i)
    })

    it('decrypt 解密失败返回空字符串（不抛错）', () => {
      const mock = createMockSafeStorage()
      mock.decryptString = vi.fn(() => { throw new Error('decrypt failed') })
      crypto.setSafeStorage(mock)
      expect(crypto.decrypt(Buffer.from('invalid'))).toBe('')
    })
  })

  describe('mask', () => {
    it('mask 长字符串返回 prefix****suffix 格式', () => {
      expect(crypto.mask('sk-1234567890abcdef')).toBe('sk-1****cdef')
    })

    it('mask 短字符串（<8 字符）返回 ****', () => {
      expect(crypto.mask('short')).toBe('****')
      expect(crypto.mask('1234567')).toBe('****')
    })

    it('mask(null/undefined/空) 返回 ****', () => {
      expect(crypto.mask(null)).toBe('****')
      expect(crypto.mask(undefined)).toBe('****')
      expect(crypto.mask('')).toBe('****')
    })

    it('mask 恰好 8 字符返回 prefix****suffix', () => {
      expect(crypto.mask('12345678')).toBe('1234****5678')
    })
  })

  describe('往返测试', () => {
    it('decrypt(encrypt(key)) === key', () => {
      const mock = createMockSafeStorage()
      crypto.setSafeStorage(mock)
      const keys = [
        'sk-test-key-12345',
        'sk-ant-api03-xxxxxxxxxxxxx',
        'a',
        'very-long-api-key-with-special-chars-!@#$%^&*()',
      ]
      for (const key of keys) {
        const encrypted = crypto.encrypt(key)
        const decrypted = crypto.decrypt(encrypted)
        expect(decrypted).toBe(key)
      }
    })
  })
})
