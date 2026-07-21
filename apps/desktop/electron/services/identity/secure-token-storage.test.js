const fs = require('fs')
const os = require('os')
const path = require('path')

describe('SecureTokenStorage', () => {
  let safeStorage
  let SecureTokenStorage
  let tempDirectory

  beforeEach(() => {
    safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`encrypted:${value}`),
      decryptString: (value) => Buffer.from(value).toString().replace(/^encrypted:/, ''),
    }
    SecureTokenStorage = require('./secure-token-storage')
  })

  afterEach(async () => {
    if (tempDirectory) {
      await fs.promises.rm(tempDirectory, { force: true, recursive: true })
      tempDirectory = null
    }
  })

  it('以 safeStorage 保存和读取会话，不暴露明文文件格式', async () => {
    const writes = []
    const storage = new SecureTokenStorage({
      safeStorage,
      read: async () => writes.at(-1) || null,
      write: async (value) => writes.push(value),
    })

    await storage.save({ refreshToken: 'refresh-secret', subject: 'sub-1' })

    expect(writes).toHaveLength(1)
    expect(writes[0]).not.toContain('refresh-secret')
    expect(await storage.load()).toEqual({ refreshToken: 'refresh-secret', subject: 'sub-1' })
  })

  it('safeStorage 不可用时拒绝明文降级', async () => {
    const storage = new SecureTokenStorage({
      safeStorage: { isEncryptionAvailable: () => false },
      read: async () => null,
      write: async () => { throw new Error('should not write') },
    })

    await expect(storage.save({ refreshToken: 'secret' }))
      .rejects.toMatchObject({ code: 'IDENTITY_SECURE_STORAGE_UNAVAILABLE' })
  })

  it.each([null, [], 'session'])('拒绝非对象会话：%p', async (session) => {
    const storage = new SecureTokenStorage({
      safeStorage,
      read: async () => null,
      write: async () => { throw new Error('不应写入非法会话') },
    })

    await expect(storage.save(session)).rejects.toMatchObject({ code: 'IDENTITY_SESSION_INVALID' })
  })

  it('使用真实文件完成原子写入、读取和清理', async () => {
    tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'multi-publish-token-'))
    const filePath = path.join(tempDirectory, 'identity-session.json')
    const storage = new SecureTokenStorage({ safeStorage, filePath })

    await storage.save({ refreshToken: 'real-file-secret' })
    const envelope = await fs.promises.readFile(filePath, 'utf8')
    expect(envelope).not.toContain('real-file-secret')
    await expect(storage.load()).resolves.toEqual({ refreshToken: 'real-file-secret' })
    await storage.clear()
    await expect(fs.promises.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('损坏密文返回空会话并触发清理', async () => {
    let removed = false
    const storage = new SecureTokenStorage({
      safeStorage: {
        isEncryptionAvailable: () => true,
        decryptString: () => { throw new Error('bad ciphertext') },
      },
      read: async () => 'not-valid',
      remove: async () => { removed = true },
    })

    await expect(storage.load()).resolves.toBeNull()
    expect(removed).toBe(true)
  })

  it.each([
    [JSON.stringify({ version: 2, ciphertext: 'encrypted-session' }), '{}'],
    [JSON.stringify({ version: 1, ciphertext: 42 }), '{}'],
    [JSON.stringify({ version: 1, ciphertext: 'encrypted-session' }), '[]'],
  ])('无效 envelope 或会话结构会清理：%s', async (envelope, plaintext) => {
    let removed = false
    const storage = new SecureTokenStorage({
      safeStorage: {
        isEncryptionAvailable: () => true,
        decryptString: () => plaintext,
      },
      read: async () => envelope,
      remove: async () => { removed = true },
    })

    await expect(storage.load()).resolves.toBeNull()
    expect(removed).toBe(true)
  })

  it('安全存储暂时不可用时保留密文以便下次重试', async () => {
    let removed = false
    const storage = new SecureTokenStorage({
      safeStorage: { isEncryptionAvailable: () => false },
      read: async () => JSON.stringify({ version: 1, ciphertext: 'encrypted-session' }),
      remove: async () => { removed = true },
    })

    await expect(storage.load()).rejects.toMatchObject({ code: 'IDENTITY_SECURE_STORAGE_UNAVAILABLE' })
    expect(removed).toBe(false)
  })

  it('实现 Logto Adapter 的 getItem/setItem/removeItem 契约', async () => {
    let persisted = null
    const storage = new SecureTokenStorage({
      safeStorage,
      read: async () => persisted,
      write: async (value) => { persisted = value },
      remove: async () => { persisted = null },
    })

    await storage.setItem('refreshToken', 'refresh-1')
    await storage.setItem('idToken', 'id-1')
    expect(await storage.getItem('refreshToken')).toBe('refresh-1')
    await storage.removeItem('refreshToken')
    expect(await storage.getItem('refreshToken')).toBeNull()
    expect(await storage.getItem('idToken')).toBe('id-1')
  })

  it('并发写入多个 Logto Token 不丢字段', async () => {
    let persisted = null
    const storage = new SecureTokenStorage({
      safeStorage,
      read: async () => persisted,
      write: async (value) => { await new Promise((resolve) => setTimeout(resolve, 2)); persisted = value },
      remove: async () => { persisted = null },
    })
    await Promise.all([storage.setItem('refreshToken', 'refresh-2'), storage.setItem('idToken', 'id-2')])
    await expect(storage.getItem('refreshToken')).resolves.toBe('refresh-2')
    await expect(storage.getItem('idToken')).resolves.toBe('id-2')
  })

  it('清理与正在进行的 Token 写入串行，清理完成后不会写回旧会话', async () => {
    let persisted = null
    let releaseWrite
    const writeStarted = new Promise((resolve) => { releaseWrite = resolve })
    const storage = new SecureTokenStorage({
      safeStorage,
      read: async () => persisted,
      write: async (value) => {
        await writeStarted
        persisted = value
      },
      remove: async () => { persisted = null },
    })

    const writePromise = storage.setItem('refreshToken', 'old-token')
    await Promise.resolve()
    const clearPromise = storage.clear()
    releaseWrite()
    await Promise.all([writePromise, clearPromise])

    expect(persisted).toBeNull()
  })
})
