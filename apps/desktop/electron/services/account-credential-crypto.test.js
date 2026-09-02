import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('./logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

import { createAccountCredentialCrypto } from './account-credential-crypto.js'

const tempDirs = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function createTempDir () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-account-crypto-'))
  tempDirs.push(dir)
  return dir
}

// 与 credential-store.test.js 同构的 safeStorage 模拟（模拟 Windows DPAPI）
function createSafeStorage () {
  return {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`protected:${value}`, 'utf8'),
    decryptString: value => Buffer.from(value).toString('utf8').replace(/^protected:/, ''),
  }
}

describe('account-credential-crypto', () => {
  it('cookies 经 credential-store 主密钥加密后可往返解密（真实依赖）', () => {
    const userDataDir = createTempDir()
    const crypto = createAccountCredentialCrypto({ userDataDir, safeStorage: createSafeStorage() })

    expect(crypto.isEncryptionAvailable()).toBe(true)
    const cookies = [{ name: 'session', value: 'secret' }]
    const blob = crypto.encrypt(cookies)
    expect(blob).not.toBeNull()
    expect(blob.length).toBeGreaterThan(0)
    expect(crypto.decrypt(blob)).toEqual(cookies)
  })

  it('localStorage 对象可往返解密', () => {
    const userDataDir = createTempDir()
    const crypto = createAccountCredentialCrypto({ userDataDir, safeStorage: createSafeStorage() })
    const localStorage = { token: 'private', prefs: { theme: 'dark' } }
    const blob = crypto.encrypt(localStorage)
    expect(blob).not.toBeNull()
    expect(crypto.decrypt(blob)).toEqual(localStorage)
  })

  it('空值（null/undefined/空数组/空对象）不加密返回 null', () => {
    const userDataDir = createTempDir()
    const crypto = createAccountCredentialCrypto({ userDataDir, safeStorage: createSafeStorage() })
    expect(crypto.encrypt(null)).toBeNull()
    expect(crypto.encrypt(undefined)).toBeNull()
    expect(crypto.encrypt([])).toBeNull()
    expect(crypto.encrypt({})).toBeNull()
    expect(crypto.decrypt(null)).toBeNull()
    expect(crypto.decrypt(undefined)).toBeNull()
  })

  it('缺省 userDataDir（测试环境无法解析 electron.app）时加密不可用，渐进回退入口有效', () => {
    const crypto = createAccountCredentialCrypto({ userDataDir: null, safeStorage: createSafeStorage() })
    expect(crypto.isEncryptionAvailable()).toBe(false)
    expect(crypto.encrypt([{ name: 'a', value: 'b' }])).toBeNull()
    expect(crypto.decrypt(Buffer.from('x'))).toBeNull()
  })

  it('密文损坏时 decrypt 返回 null 而非抛错', () => {
    const userDataDir = createTempDir()
    const crypto = createAccountCredentialCrypto({ userDataDir, safeStorage: createSafeStorage() })
    expect(crypto.isEncryptionAvailable()).toBe(true)
    expect(crypto.decrypt(Buffer.from('garbage-bytes-not-encrypted'))).toBeNull()
  })

  it('主密钥不可解（系统凭据状态变化，模拟 DPAPI 失效）时加密不可用', () => {
    const userDataDir = createTempDir()
    // 第一次：正常 safeStorage 生成主密钥文件
    createAccountCredentialCrypto({ userDataDir, safeStorage: createSafeStorage() }).isEncryptionAvailable()
    // 库中已有存量凭证（模拟既有加密数据）：主密钥不可恢复时必须 fail-closed，不得自动重建
    fs.writeFileSync(path.join(userDataDir, "credentials", "existing-account.json.enc"), "fake")

    // 第二次：safeStorage 无法解密（模拟 DPAPI 状态变化）→ 主密钥不可恢复 → 加密不可用
    const brokenSafeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: () => Buffer.from('x'),
      decryptString: () => { throw new Error('unable to decrypt master key') },
    }
    const crypto = createAccountCredentialCrypto({ userDataDir, safeStorage: brokenSafeStorage })
    expect(crypto.isEncryptionAvailable()).toBe(false)
  })

  it('多个实例共享同一主密钥：不同适配器加密的数据可互相解密', () => {
    const userDataDir = createTempDir()
    const safeStorage = createSafeStorage()
    const cryptoA = createAccountCredentialCrypto({ userDataDir, safeStorage })
    const cryptoB = createAccountCredentialCrypto({ userDataDir, safeStorage })
    const blob = cryptoA.encrypt([{ name: 'token', value: 'abc' }])
    expect(blob).not.toBeNull()
    expect(cryptoB.decrypt(blob)).toEqual([{ name: 'token', value: 'abc' }])
  })
})