/**
 * credential-store 测试 — R33 强制补测试（跨5轮债务）
 * 覆盖：getMasterKey 原子写/chmod、saveCredential/loadCredential roundtrip、
 *       getCredentialFilePath 路径穿越校验、deleteCredential、listAccounts
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const cs = require('../electron/services/credential-store')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-test-'))

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(`protected:${value}`, 'utf8'),
  decryptString: value => Buffer.from(value).toString('utf8').replace(/^protected:/, ''),
}
const protectedOptions = { safeStorage }

describe('credential-store', () => {
  let userDataDir

  beforeEach(() => {
    userDataDir = path.join(tmpDir, `user-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(userDataDir, { recursive: true })
  })

  afterEach(() => {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch (_) {}
  })

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
  })

  it('getMasterKey 首次创建主密钥文件（原子写 + chmod 600 + .bak）', () => {
    const credDir = path.join(userDataDir, 'credentials')
    const keyFile = path.join(credDir, '.masterkey')
    const bakFile = keyFile + '.bak'

    const key1 = cs.getMasterKey(credDir, protectedOptions)
    expect(key1).toBeTruthy()
    expect(typeof key1).toBe('string')
    expect(fs.existsSync(keyFile)).toBe(true)
    expect(fs.existsSync(bakFile)).toBe(true)
    // .tmp 不应残留
    expect(fs.existsSync(keyFile + '.tmp')).toBe(false)
    // chmod 600（非 Windows）
    if (process.platform !== 'win32') {
      const stat = fs.statSync(keyFile)
      expect(stat.mode & 0o777).toBe(0o600)
    }
  })

  it('getMasterKey 二次调用返回相同密钥', () => {
    const credDir = path.join(userDataDir, 'credentials')
    const key1 = cs.getMasterKey(credDir, protectedOptions)
    const key2 = cs.getMasterKey(credDir, protectedOptions)
    expect(key1).toBe(key2)
  })

  it('saveCredential + loadCredential roundtrip', () => {
    const accountId = 'acc_test_001'
    const data = {
      localStorage: { token: 'abc123', theme: 'dark' },
      accountInfo: { nickName: 'TestUser', avatar: 'http://example.com/a.png' },
    }

    cs.saveCredential(accountId, data, userDataDir, protectedOptions)
    const loaded = cs.loadCredential(accountId, userDataDir, protectedOptions)

    expect(loaded).toBeTruthy()
    expect(loaded.localStorage.token).toBe('abc123')
    expect(loaded.localStorage.theme).toBe('dark')
    expect(loaded.accountInfo.nickName).toBe('TestUser')
  })

  it('loadCredential 不存在的账号返回 null', () => {
    const result = cs.loadCredential('nonexistent_acc', userDataDir)
    expect(result).toBeNull()
  })

  it('getCredentialFilePath 拒绝路径穿越', () => {
    const credDir = path.join(userDataDir, 'credentials')
    expect(() => cs.getCredentialFilePath('../../etc/passwd', credDir)).toThrow()
    expect(() => cs.getCredentialFilePath('a/b', credDir)).toThrow()
    expect(() => cs.getCredentialFilePath('a\\b', credDir)).toThrow()
    expect(() => cs.getCredentialFilePath(null, credDir)).toThrow()
    expect(() => cs.getCredentialFilePath(123, credDir)).toThrow()
    // 正常 accountId 不抛错
    expect(() => cs.getCredentialFilePath('acc_normal', credDir)).not.toThrow()
  })

  it('hasCredential 正确反映存在性', () => {
    const accountId = 'acc_has_001'
    expect(cs.hasCredential(accountId, userDataDir)).toBe(false)
    cs.saveCredential(accountId, { localStorage: {}, accountInfo: {} }, userDataDir, protectedOptions)
    expect(cs.hasCredential(accountId, userDataDir)).toBe(true)
  })

  it('deleteCredential 删除凭证文件', () => {
    const accountId = 'acc_del_001'
    cs.saveCredential(accountId, { localStorage: { x: '1' }, accountInfo: {} }, userDataDir, protectedOptions)
    expect(cs.hasCredential(accountId, userDataDir)).toBe(true)
    cs.deleteCredential(accountId, userDataDir)
    expect(cs.hasCredential(accountId, userDataDir)).toBe(false)
  })

  it('saveCredential 原子写不残留 .tmp', () => {
    const accountId = 'acc_atom_001'
    cs.saveCredential(accountId, { localStorage: {}, accountInfo: {} }, userDataDir, protectedOptions)
    const credDir = path.join(userDataDir, 'credentials')
    const files = fs.readdirSync(credDir)
    // 不应有 .tmp 残留（只应有 .json.enc + .masterkey + .masterkey.bak）
    const tmpFiles = files.filter(f => f.includes('.tmp'))
    expect(tmpFiles.length).toBe(0)
  })

  it('listAccounts 返回已保存的账号列表', () => {
    cs.saveCredential('acc_list_1', { localStorage: {}, accountInfo: {} }, userDataDir, protectedOptions)
    cs.saveCredential('acc_list_2', { localStorage: {}, accountInfo: {} }, userDataDir, protectedOptions)
    const accounts = cs.listAccounts(userDataDir)
    expect(accounts).toContain('acc_list_1')
    expect(accounts).toContain('acc_list_2')
  })

  it('不同 owner 的同名账号使用独立加密命名空间', () => {
    cs.saveCredential('shared', { accountInfo: { nickName: 'A' } }, userDataDir, 'user-a')
    cs.saveCredential('shared', { accountInfo: { nickName: 'B' } }, userDataDir, 'user-b')

    expect(cs.loadCredential('shared', userDataDir, 'user-a').accountInfo.nickName).toBe('A')
    expect(cs.loadCredential('shared', userDataDir, 'user-b').accountInfo.nickName).toBe('B')
    expect(cs.listAccounts(userDataDir, 'user-a')).toEqual(['shared'])
    expect(cs.listAccounts(userDataDir, 'user-b')).toEqual(['shared'])
  })

  it('owner 命名空间不把旧 legacy 文件回退给已登录用户', () => {
    cs.saveCredential('legacy-only', { accountInfo: { nickName: 'legacy' } }, userDataDir)

    expect(cs.loadCredential('legacy-only', userDataDir, 'user-a')).toBeNull()
    expect(cs.hasCredential('legacy-only', userDataDir, 'user-a')).toBe(false)
  })

  it('删除一个 owner 的凭证不会删除另一个 owner 的同名凭证', () => {
    cs.saveCredential('shared', { accountInfo: { nickName: 'A' } }, userDataDir, 'user-a')
    cs.saveCredential('shared', { accountInfo: { nickName: 'B' } }, userDataDir, 'user-b')

    expect(cs.deleteCredential('shared', userDataDir, 'user-a')).toBe(true)
    expect(cs.loadCredential('shared', userDataDir, 'user-a')).toBeNull()
    expect(cs.loadCredential('shared', userDataDir, 'user-b').accountInfo.nickName).toBe('B')
  })

  it('owner 只接受非空字符串且命名空间不允许路径穿越', () => {
    expect(() => cs.getOwnerCredentialDir(userDataDir, '../user-a')).not.toThrow()
    expect(() => cs.getOwnerCredentialDir(userDataDir, '')).toThrow()
    expect(() => cs.getOwnerCredentialDir(userDataDir, null)).toThrow()
    const ownerDir = cs.getOwnerCredentialDir(userDataDir, '../user-a')
    expect(ownerDir.startsWith(path.join(userDataDir, 'credentials', 'owners'))).toBe(true)
    expect(ownerDir).not.toContain('..')
  })
})
