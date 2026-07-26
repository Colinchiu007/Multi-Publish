import { afterEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
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

function holdExclusiveWindowsFileLock (filePath, holdMs) {
  const script = [
    '& {',
    'param($file, $holdMs)',
    '$handle = [IO.File]::Open($file, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)',
    'try {',
    '[Console]::Out.WriteLine("LOCKED")',
    '[Console]::Out.Flush()',
    '[Threading.Thread]::Sleep([int]$holdMs)',
    '} finally { $handle.Dispose() }',
    '}',
  ].join('\n')
  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
    filePath,
    String(holdMs),
  ], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stderr = ''
  let locked = false
  let resolveLocked
  let rejectLocked
  const lockedPromise = new Promise((resolve, reject) => {
    resolveLocked = resolve
    rejectLocked = reject
  })
  const exitPromise = new Promise((resolve, reject) => {
    child.once('error', error => {
      rejectLocked(error)
      reject(error)
    })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.stdout.on('data', chunk => {
      if (!locked && chunk.toString().includes('LOCKED')) {
        locked = true
        resolveLocked()
      }
    })
    child.once('exit', code => {
      if (!locked) rejectLocked(new Error(`PowerShell exited before locking the file: ${stderr}`))
      if (code === 0) resolve()
      else reject(new Error(`PowerShell file lock exited with code ${code}: ${stderr}`))
    })
  })

  return lockedPromise.then(() => ({ exitPromise }))
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

  it('相同账号 ID 在不同 owner 下使用独立凭证文件和密钥空间', () => {
    const userDataDir = createTempDir()
    const ownerA = 'user-a'
    const ownerB = 'user-b'

    expect(credentialStore.saveCredential('shared', { owner: ownerA }, userDataDir, {
      ownerSubject: ownerA,
      safeStorage: createSafeStorage(),
    })).toBe(true)
    expect(credentialStore.saveCredential('shared', { owner: ownerB }, userDataDir, {
      ownerSubject: ownerB,
      safeStorage: createSafeStorage(),
    })).toBe(true)
    expect(credentialStore.loadCredential('shared', userDataDir, {
      ownerSubject: ownerA,
      safeStorage: createSafeStorage(),
    })).toEqual({ owner: ownerA })
    expect(credentialStore.loadCredential('shared', userDataDir, {
      ownerSubject: ownerB,
      safeStorage: createSafeStorage(),
    })).toEqual({ owner: ownerB })
    expect(credentialStore.getOwnerCredentialDir(userDataDir, ownerA)).not.toBe(
      credentialStore.getOwnerCredentialDir(userDataDir, ownerB),
    )
    expect(credentialStore.hasCredential('shared', userDataDir, ownerA)).toBe(true)
    expect(credentialStore.deleteCredential('shared', userDataDir, ownerA)).toBe(true)
    expect(credentialStore.loadCredential('shared', userDataDir, {
      ownerSubject: ownerA,
      safeStorage: createSafeStorage(),
    })).toBeNull()
    expect(credentialStore.loadCredential('shared', userDataDir, {
      ownerSubject: ownerB,
      safeStorage: createSafeStorage(),
    })).toEqual({ owner: ownerB })
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

  it.skipIf(process.platform !== 'win32')('Windows 主密钥短暂锁释放后仍能完成格式迁移', async () => {
    const userDataDir = createTempDir()
    const credDir = path.join(userDataDir, 'credentials')
    const keyFile = path.join(credDir, '.masterkey')
    const legacyKey = 'c'.repeat(64)
    fs.mkdirSync(credDir, { recursive: true })
    fs.writeFileSync(keyFile, legacyKey, 'utf8')
    const fileLock = await holdExclusiveWindowsFileLock(keyFile, 180)

    try {
      expect(credentialStore.getMasterKey(credDir, { safeStorage: createSafeStorage() })).toBe(legacyKey)
      await fileLock.exitPromise
      expect(fs.readFileSync(keyFile, 'utf8')).toMatch(/^safeStorage:v1:/)
      expect(fs.existsSync(`${keyFile}.tmp.${process.pid}`)).toBe(false)
    } finally {
      await fileLock.exitPromise.catch(() => {})
    }
  })

  it.skipIf(process.platform !== 'win32')('Windows 主密钥备份短暂锁释放后仍能完成格式迁移', async () => {
    const userDataDir = createTempDir()
    const credDir = path.join(userDataDir, 'credentials')
    const keyFile = path.join(credDir, '.masterkey')
    const backupFile = `${keyFile}.bak`
    const legacyKey = 'd'.repeat(64)
    fs.mkdirSync(credDir, { recursive: true })
    fs.writeFileSync(keyFile, legacyKey, 'utf8')
    fs.writeFileSync(backupFile, legacyKey, 'utf8')
    const fileLock = await holdExclusiveWindowsFileLock(backupFile, 180)

    try {
      expect(credentialStore.getMasterKey(credDir, { safeStorage: createSafeStorage() })).toBe(legacyKey)
      await fileLock.exitPromise
      expect(fs.readFileSync(backupFile, 'utf8')).toMatch(/^safeStorage:v1:/)
      expect(fs.existsSync(`${backupFile}.tmp.${process.pid}`)).toBe(false)
    } finally {
      await fileLock.exitPromise.catch(() => {})
    }
  })

  it.skipIf(process.platform !== 'win32')('Windows 凭据文件短暂锁释放后原子保存成功', async () => {
    const userDataDir = createTempDir()
    const options = { safeStorage: createSafeStorage() }
    const accountId = 'locked-account'
    const filePath = path.join(userDataDir, 'credentials', `${accountId}.json.enc`)
    expect(credentialStore.saveCredential(accountId, { version: 1 }, userDataDir, options)).toBe(true)
    const fileLock = await holdExclusiveWindowsFileLock(filePath, 180)

    try {
      expect(credentialStore.saveCredential(accountId, { version: 2 }, userDataDir, options)).toBe(true)
      await fileLock.exitPromise
      expect(credentialStore.loadCredential(accountId, userDataDir, options)).toEqual({ version: 2 })
      expect(fs.existsSync(`${filePath}.tmp.${process.pid}`)).toBe(false)
    } finally {
      await fileLock.exitPromise.catch(() => {})
    }
  })
})
