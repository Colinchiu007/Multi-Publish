/**
 * browser-data.test.js — Stage -1.2：RPA 浏览器数据主密钥 safeStorage 化
 *
 * 验证维度：
 *   1. 新建密钥：safeStorage 可用 → safeStorage:v1: 加密落盘（主文件 + 双副本）
 *   2. 新建密钥：safeStorage 不可用 → fail-closed 抛错（拒绝明文新密钥）
 *   3. 存量明文密钥（裸 hex / plaintext:v1:）→ 自动迁移为 safeStorage，密钥值不变
 *   4. 存量 safeStorage 密钥 → 直接读取，不重复迁移
 *   5. 存量明文密钥 + safeStorage 不可用 → 降级警告继续使用（不抛错）
 *   6. safeStorage 密钥 + safeStorage 不可用 → 抛错（无法解密）
 *   7. 密钥文件损坏 → 抛错
 *   8. saveCookies/restoreCookies 加密往返（真实依赖 + mock safeStorage）
 *   9. 加密数据不因密钥存储格式迁移而变化（密钥值稳定）
 *
 * 说明：本包为纯 Node 环境，无 electron，safeStorage 全部通过 configureSafeStorage 注入
 * （模拟 Windows DPAPI，与 account-credential-crypto.test.js 同构）。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const browserData = require('../src/browser-data')

// ─── helpers ─────────────────────────────────────

function createSafeStorage () {
  return {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`protected:${value}`, 'utf8'),
    decryptString: value => Buffer.from(value).toString('utf8').replace(/^protected:/, ''),
  }
}

const tempDirs = []
function createTempDir () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-browser-data-'))
  tempDirs.push(dir)
  return dir
}

function createMockSession (initialCookies = []) {
  const stored = initialCookies.slice()
  return {
    cookies: {
      get: async () => stored.slice(),
      set: async (cookie) => { stored.push(cookie); return true },
    },
  }
}

const HEX64 = /^[0-9a-f]{64}$/i

beforeEach(() => {
  browserData.configureSafeStorage(createSafeStorage())
})

afterEach(() => {
  browserData.configureSafeStorage(null) // 清除注入，避免跨用例污染
  for (const dir of tempDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch (_) {}
  }
})

// ─── 1. 新建密钥（safeStorage 可用）─────────────

describe('getOrCreateKey 新建（safeStorage 可用）', () => {
  it('创建 64-hex 密钥并以 safeStorage:v1: 前缀加密落盘（主文件 + .bak 双副本）', () => {
    const dir = createTempDir()
    const key = browserData._internals.getOrCreateKey(dir)

    expect(key).toMatch(HEX64)
    const keyFile = path.join(dir, '.browser_data_key')
    const backupFile = keyFile + '.bak'
    expect(fs.existsSync(keyFile)).toBe(true)
    expect(fs.existsSync(backupFile)).toBe(true)

    const serialized = fs.readFileSync(keyFile, 'utf8').trim()
    expect(serialized.startsWith('safeStorage:v1:')).toBe(true)
    expect(serialized).not.toContain(key) // 明文不应出现在文件中
    expect(fs.readFileSync(backupFile, 'utf8').trim()).toBe(serialized)
  })

  it('重复调用返回同一密钥（稳定）', () => {
    const dir = createTempDir()
    const first = browserData._internals.getOrCreateKey(dir)
    const second = browserData._internals.getOrCreateKey(dir)
    expect(second).toBe(first)
  })
})

// ─── 2. 新建密钥（safeStorage 不可用）────────────

describe('getOrCreateKey 新建（safeStorage 不可用）', () => {
  it('fail-closed 抛错，拒绝创建明文密钥，且不落盘密钥文件', () => {
    browserData.configureSafeStorage(null) // 纯 Node 无 electron → null
    const dir = createTempDir()
    expect(() => browserData._internals.getOrCreateKey(dir)).toThrow(/拒绝创建明文/)
    const keyFile = path.join(dir, '.browser_data_key')
    const backupFile = keyFile + '.bak'
    expect(fs.existsSync(keyFile)).toBe(false)
    expect(fs.existsSync(backupFile)).toBe(false)
  })
})

// ─── 3. 存量明文密钥自动迁移 ────────────────────

describe('存量明文密钥迁移', () => {
  it('裸 hex 明文密钥在 safeStorage 可用时迁移为 safeStorage:v1:，密钥值不变', () => {
    const dir = createTempDir()
    fs.mkdirSync(dir, { recursive: true })
    const legacyKey = 'a'.repeat(64)
    fs.writeFileSync(path.join(dir, '.browser_data_key'), legacyKey, 'utf8')

    const key = browserData._internals.getOrCreateKey(dir)
    expect(key).toBe(legacyKey)

    const serialized = fs.readFileSync(path.join(dir, '.browser_data_key'), 'utf8').trim()
    expect(serialized.startsWith('safeStorage:v1:')).toBe(true)
    expect(fs.readFileSync(path.join(dir, '.browser_data_key.bak'), 'utf8').trim()).toBe(serialized)
  })

  it('plaintext:v1: 前缀密钥同样可读取并迁移', () => {
    const dir = createTempDir()
    fs.mkdirSync(dir, { recursive: true })
    const legacyKey = 'b'.repeat(64)
    fs.writeFileSync(path.join(dir, '.browser_data_key'), 'plaintext:v1:' + legacyKey, 'utf8')

    const key = browserData._internals.getOrCreateKey(dir)
    expect(key).toBe(legacyKey)
    const serialized = fs.readFileSync(path.join(dir, '.browser_data_key'), 'utf8').trim()
    expect(serialized.startsWith('safeStorage:v1:')).toBe(true)
  })

  it('主文件损坏时回退读取 .bak 副本并迁移', () => {
    const dir = createTempDir()
    fs.mkdirSync(dir, { recursive: true })
    const legacyKey = 'c'.repeat(64)
    fs.writeFileSync(path.join(dir, '.browser_data_key'), 'garbage', 'utf8')
    fs.writeFileSync(path.join(dir, '.browser_data_key.bak'), legacyKey, 'utf8')

    const key = browserData._internals.getOrCreateKey(dir)
    expect(key).toBe(legacyKey)
    expect(fs.readFileSync(path.join(dir, '.browser_data_key'), 'utf8').trim().startsWith('safeStorage:v1:')).toBe(true)
  })
})

// ─── 4. 存量 safeStorage 密钥 ────────────────────

describe('存量 safeStorage:v1: 密钥', () => {
  it('直接读取，不重复迁移（文件内容保持不变）', () => {
    const dir = createTempDir()
    fs.mkdirSync(dir, { recursive: true })
    const first = browserData._internals.getOrCreateKey(dir) // 生成并落盘 safeStorage 格式
    const serializedBefore = fs.readFileSync(path.join(dir, '.browser_data_key'), 'utf8')
    // 重新（模拟新进程）读取
    const second = browserData._internals.getOrCreateKey(dir)
    expect(second).toBe(first)
    expect(fs.readFileSync(path.join(dir, '.browser_data_key'), 'utf8')).toBe(serializedBefore)
  })
})

// ─── 5. 明文密钥 + safeStorage 不可用（降级）─────

describe('明文密钥 + safeStorage 不可用', () => {
  it('降级警告继续使用历史密钥，不抛错', () => {
    browserData.configureSafeStorage(null)
    const dir = createTempDir()
    fs.mkdirSync(dir, { recursive: true })
    const legacyKey = 'd'.repeat(64)
    fs.writeFileSync(path.join(dir, '.browser_data_key'), legacyKey, 'utf8')

    let warned = false
    const spy = spyConsoleWarn(() => { warned = true })
    try {
      const key = browserData._internals.getOrCreateKey(dir)
      expect(key).toBe(legacyKey)
      expect(warned).toBe(true)
      // 不迁移：仍为明文
      expect(fs.readFileSync(path.join(dir, '.browser_data_key'), 'utf8').trim()).toBe(legacyKey)
    } finally {
      spy()
      browserData.configureSafeStorage(createSafeStorage())
    }
  })
})

function spyConsoleWarn (onWarn) {
  const original = console.warn
  console.warn = (...args) => { onWarn(...args) }
  return () => { console.warn = original }
}

// ─── 6. safeStorage 密钥 + safeStorage 不可用 ────

describe('safeStorage 密钥 + safeStorage 不可用', () => {
  it('无法解密时抛错（fail-closed，不静默重建）', () => {
    const dir = createTempDir()
    const key = browserData._internals.getOrCreateKey(dir) // 先以 safeStorage 格式生成

    browserData.configureSafeStorage(null) // 此后无 safeStorage
    expect(() => browserData._internals.getOrCreateKey(dir)).toThrow(/无法解密/)
  })
})

// ─── 7. 密钥损坏 ─────────────────────────────────

describe('密钥损坏', () => {
  it('非法格式（非 hex、非前缀）抛错', () => {
    const dir = createTempDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '.browser_data_key'), 'not-a-valid-key-format', 'utf8')
    expect(() => browserData._internals.getOrCreateKey(dir)).toThrow(/格式无效/)
  })
})

// ─── 8. saveCookies / restoreCookies 往返 ────────

describe('saveCookies / restoreCookies 加密往返', () => {
  it('保存后恢复成功，cookie 集与加密数据一致', async () => {
    const userDataDir = createTempDir()
    const sourceCookies = [
      { name: 'session', value: 'secret-1', domain: '.douyin.com', path: '/' },
      { name: 'passport', value: 'secret-2', domain: '.douyin.com', path: '/' },
    ]

    const saved = await browserData.saveCookies(
      createMockSession(sourceCookies), 'douyin', 'acc_1', userDataDir
    )
    expect(saved.count).toBe(2)

    // 落盘内容为密文，不含明文 cookie 值
    const encryptedPath = path.join(userDataDir, 'browser_data', 'douyin', 'acc_1', 'cookies.json.enc')
    expect(fs.existsSync(encryptedPath)).toBe(true)
    const raw = fs.readFileSync(encryptedPath)
    expect(raw.includes('secret-1')).toBe(false)
    expect(raw.includes('secret-2')).toBe(false)

    // 恢复到一个全新的 session
    const restored = await browserData.restoreCookies(
      createMockSession(), 'douyin', 'acc_1', userDataDir
    )
    expect(restored.count).toBe(2)
    expect(restored.restored).toBe(true)
  })

  it('密钥从明文迁移到 safeStorage 后，既有加密 cookies 仍可解密（密钥值不变）', async () => {
    const userDataDir = createTempDir()
    const accDir = path.join(userDataDir, 'browser_data', 'douyin', 'acc_1')
    fs.mkdirSync(accDir, { recursive: true })

    // 模拟历史状态：明文密钥 + 用它加密的 cookies
    const legacyKey = 'e'.repeat(64)
    browserData.configureSafeStorage(null)
    const { encrypt } = browserData._internals
    fs.writeFileSync(path.join(accDir, '.browser_data_key'), legacyKey, 'utf8')
    const cookies = [{ name: 'auth', value: 'old-secret', domain: '.douyin.com', path: '/' }]
    fs.writeFileSync(path.join(accDir, 'cookies.json.enc'), encrypt(JSON.stringify(cookies), legacyKey))

    // 升级环境：safeStorage 可用，读取时自动迁移（密钥不变 → 密文可解）
    browserData.configureSafeStorage(createSafeStorage())
    const restored = await browserData.restoreCookies(
      createMockSession(), 'douyin', 'acc_1', userDataDir
    )
    expect(restored.count).toBe(1)
    expect(restored.restored).toBe(true)
    expect(fs.readFileSync(path.join(accDir, '.browser_data_key'), 'utf8').trim().startsWith('safeStorage:v1:')).toBe(true)
  })
})

// ─── 9. 公开 API 兼容性 ──────────────────────────

describe('公开 API 兼容性', () => {
  it('configureSafeStorage 可注入并清除', () => {
    expect(typeof browserData.configureSafeStorage).toBe('function')
    browserData.configureSafeStorage(null)
    browserData.configureSafeStorage(createSafeStorage())
  })

  it('无 safeStorage 时 hasSavedState / listSavedAccounts 正常工作（不触碰密钥）', () => {
    browserData.configureSafeStorage(null)
    const userDataDir = createTempDir()
    expect(browserData.hasSavedState('douyin', 'nobody', userDataDir)).toBe(false)
    expect(browserData.listSavedAccounts(userDataDir)).toEqual([])
  })
})