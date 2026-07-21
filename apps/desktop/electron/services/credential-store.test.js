import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as credentialStore from './credential-store.js'

const tempDirs = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function createTempDir () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-credentials-'))
  tempDirs.push(dir)
  return dir
}

function createSafeStorage () {
  return {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`protected:${value}`, 'utf8'),
    decryptString: value => Buffer.from(value).toString('utf8').replace(/^protected:/, ''),
  }
}

describe('credential-store', () => {
  it('round-trips cookies as part of the encrypted credential record and reports success', () => {
    const userDataDir = createTempDir()
    const data = {
      cookies: [{ name: 'session', value: 'secret' }],
      localStorage: { token: 'private' },
      indexedDB: { secure: { value: 'private' } },
      accountInfo: { platformAccountId: 'acct-1' },
    }

    const options = { safeStorage: createSafeStorage() }
    expect(credentialStore.saveCredential('acct-1', data, userDataDir, options)).toBe(true)
    expect(credentialStore.loadCredential('acct-1', userDataDir, options)).toEqual(data)
  })

  it('uses the OS protected master-key envelope when safeStorage is available', () => {
    const userDataDir = createTempDir()
    const safeStorage = createSafeStorage()

    credentialStore.saveCredential('acct-2', { cookies: [] }, userDataDir, { safeStorage })
    const keyFile = path.join(userDataDir, 'credentials', '.masterkey')
    const key = fs.readFileSync(keyFile, 'utf8')
    expect(key.startsWith('safeStorage:v1:')).toBe(true)
    expect(key).not.toContain('protected:')
    expect(credentialStore.loadCredential('acct-2', userDataDir, { safeStorage })).toEqual({ cookies: [] })
  })

  it('系统凭据保护不可用时拒绝创建可被离线解密的主密钥', () => {
    const userDataDir = createTempDir()

    expect(credentialStore.saveCredential('acct-unsafe', { cookies: [] }, userDataDir, { safeStorage: null })).toBe(false)
    expect(fs.existsSync(path.join(userDataDir, 'credentials', '.masterkey'))).toBe(false)
    expect(fs.existsSync(path.join(userDataDir, 'credentials', 'acct-unsafe.json.enc'))).toBe(false)
  })

  it('兼容历史无前缀主密钥并在可用时迁移到系统保护格式', () => {
    const userDataDir = createTempDir()
    const credDir = path.join(userDataDir, 'credentials')
    fs.mkdirSync(credDir, { recursive: true })
    const legacyKey = 'a'.repeat(64)
    fs.writeFileSync(path.join(credDir, '.masterkey'), legacyKey, 'utf8')

    expect(credentialStore.getMasterKey(credDir, { safeStorage: createSafeStorage() })).toBe(legacyKey)
    expect(fs.readFileSync(path.join(credDir, '.masterkey'), 'utf8')).toMatch(/^safeStorage:v1:/)
  })

  it('拒绝格式不合法的无前缀主密钥', () => {
    const userDataDir = createTempDir()
    const credDir = path.join(userDataDir, 'credentials')
    fs.mkdirSync(credDir, { recursive: true })
    fs.writeFileSync(path.join(credDir, '.masterkey'), 'not-a-master-key', 'utf8')

    expect(() => credentialStore.getMasterKey(credDir, { safeStorage: null })).toThrow('主密钥格式无效')
  })

  it('主密钥损坏时从合法备份恢复', () => {
    const userDataDir = createTempDir()
    const credDir = path.join(userDataDir, 'credentials')
    fs.mkdirSync(credDir, { recursive: true })
    const legacyKey = 'b'.repeat(64)
    fs.writeFileSync(path.join(credDir, '.masterkey'), 'corrupted', 'utf8')
    fs.writeFileSync(path.join(credDir, '.masterkey.bak'), legacyKey, 'utf8')

    expect(credentialStore.getMasterKey(credDir, { safeStorage: createSafeStorage() })).toBe(legacyKey)
    expect(fs.readFileSync(path.join(credDir, '.masterkey'), 'utf8')).toMatch(/^safeStorage:v1:/)
  })
})
