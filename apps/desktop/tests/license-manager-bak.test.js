/**
 * license-manager .bak 恢复测试 — R33 强制补测试（跨5轮债务）
 * 覆盖：主文件损坏时从 .bak 恢复、.bak 也损坏时降级 free、原子写
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

// license-manager 直接导出 LicenseManager 类
__enableElectronMock()
const LicenseManager = require('../electron/services/license-manager')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'license-test-'))

// 复用源文件的 obfuscate/deobfuscate（通过 LicenseManager 的 save 生成有效文件）
function makeManager(dataPath) {
  const m = new LicenseManager(dataPath)
  return m
}

describe('license-manager .bak 恢复', () => {
  let dataPath

  beforeEach(() => {
    dataPath = path.join(tmpDir, `license-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  })

  afterEach(() => {
    try { fs.unlinkSync(dataPath) } catch (_) {}
    try { fs.unlinkSync(dataPath + '.bak') } catch (_) {}
    try { fs.unlinkSync(dataPath + '.tmp') } catch (_) {}
  })

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
  })

  it('save 生成主文件 + .bak 备份', () => {
    const m = makeManager(dataPath)
    m.activate('PRO-KEY-12345')
    m.save()

    expect(fs.existsSync(dataPath)).toBe(true)
    expect(fs.existsSync(dataPath + '.bak')).toBe(true)
    // .tmp 不应残留
    expect(fs.existsSync(dataPath + '.tmp')).toBe(false)
  })

  it('主文件损坏时从 .bak 恢复 Pro 许可', () => {
    const m = makeManager(dataPath)
    m.activate('PRO-KEY-67890')
    m.save()
    expect(m.isPro()).toBe(true)

    // 损坏主文件（写入无效内容）
    fs.writeFileSync(dataPath, 'CORRUPTED_DATA_NOT_VALID_BASE64_OR_OBFUSCATED!!!')

    // 重新加载，应从 .bak 恢复
    const m2 = makeManager(dataPath)
    m2.load()
    expect(m2.isPro()).toBe(true)
    expect(m2._data.type).toBe('pro')
    expect(m2._data.licenseKey).toBe('PRO-KEY-67890')
  })

  it('主文件和 .bak 都损坏时降级为 free', () => {
    const m = makeManager(dataPath)
    m.activate('PRO-KEY-WILL-LOSE')
    m.save()

    // 损坏主文件和备份
    fs.writeFileSync(dataPath, 'CORRUPTED!!!')
    fs.writeFileSync(dataPath + '.bak', 'ALSO_CORRUPTED!!!')

    const m2 = makeManager(dataPath)
    m2.load()
    expect(m2._data.type).toBe('free')
    expect(m2.isPro()).toBe(false)
  })

  it('无 .bak 时主文件损坏降级为 free', () => {
    const m = makeManager(dataPath)
    m.activate('PRO-NO-BAK')
    m.save()
    // 删除 .bak
    fs.unlinkSync(dataPath + '.bak')
    // 损坏主文件
    fs.writeFileSync(dataPath, 'CORRUPTED_NO_BACKUP!!!')

    const m2 = makeManager(dataPath)
    m2.load()
    expect(m2._data.type).toBe('free')
  })

  it('原子写：save 不残留 .tmp', () => {
    const m = makeManager(dataPath)
    m.activate('PRO-ATOMIC')
    m.save()
    m.save() // 二次 save
    expect(fs.existsSync(dataPath + '.tmp')).toBe(false)
  })

  it('_daysRemaining Invalid Date 返回 0（R29 修复）', () => {
    const m = makeManager(dataPath)
    m._data = { type: 'trial', expiresAt: 'not-a-date', features: [] }
    expect(m._daysRemaining()).toBe(0)

    m._data.expiresAt = ''
    expect(m._daysRemaining()).toBe(0)
  })
})
