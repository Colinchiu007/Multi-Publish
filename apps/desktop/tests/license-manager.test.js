/**
 * LicenseManager unit tests
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
__enableElectronMock()

__registerMock("fs", {
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
})

__registerMock("path", {
  join: vi.fn(() => "/mock/license.json"),
  dirname: vi.fn(),
})

__registerMock("./logger", {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

describe("LicenseManager", function() {
  var LicenseManager
  var manager

  beforeAll(function() {
    LicenseManager = require("../electron/services/license-manager")
  })

  beforeEach(function() {
    manager = new LicenseManager("/mock/license.json")
  })

  test("initializes as free", function() {
    expect(manager.isPro()).toBe(false)
  })

  test("isFree returns free type by default", function() {
    expect(manager.getInfo().type).toBe("free")
  })

  test("activate sets pro status", function() {
    manager.activate("TEST-KEYX-2345")
    expect(manager.isPro()).toBe(true)
    expect(manager.getInfo().licenseKey).toBe("TEST-KEYX-2345")
  })

  test("activate rejects arbitrary garbage strings (S1 格式守卫)", function() {
    // S1 最小止血第 2 步（2026-10-09）：#3085 已在 IPC 层对正式包拒收本地激活码，
    // 但 `activate()` 方法本身仍接受任意非空字符串。开发构建里该路径仍可达。
    // 格式守卫与 subscription-service 的 REDEEM_CODE_PATTERN（ABCD-EFGH-JKMN）对齐：
    // 游离单字符 / 纯标点 / 中文等垃圾输入一律拒绝，且不写入任何授权状态。
    var garbage = ["a", "x", "随便什么字符串", "!!!", "12345", "abc-def", "test-key-no-format"]
    for (var i = 0; i < garbage.length; i++) {
      var m = new LicenseManager("/mock/license-" + i + ".json")
      expect(m.activate(garbage[i])).toBe(false)
      expect(m.getInfo().type).toBe("free")
      expect(m.isPro()).toBe(false)
    }
  })

  test("activate accepts service-issued redemption code format", function() {
    // 服务端兑换码格式（subscription-service.js REDEEM_CODE_ALPHABET，无易混淆 0/O/1/I/L）：
    // 4-4-4 段，允许连字符分隔。格式通过≠码有效——真实核销在服务端 /api/v1/redeem。
    var m = new LicenseManager("/mock/license-fmt.json")
    expect(m.activate("ABCD-EFGH-JKMN")).toBe(true)
    expect(m.isPro()).toBe(true)
  })

  test("deactivate resets to free", function() {
    manager.activate("TEST-KEYX-2345")
    expect(manager.isPro()).toBe(true)
    manager.deactivate()
    expect(manager.isPro()).toBe(false)
  })

  test("activate does not overwrite existing key on re-activate", function() {
    manager.activate("AAAA-BBBB-CCCC")
    manager.activate("DDDD-EEEE-FFFF")
    expect(manager.getInfo().licenseKey).toBe("AAAA-BBBB-CCCC")
  })

  test("getFeatures returns free features for free users", function() {
    var features = manager.getFeatures()
    expect(Array.isArray(features)).toBe(true)
    expect(features).not.toContain("batch-publish")
  })

  test("getFeatures returns pro features for pro users", function() {
    manager.activate("SAVE-TEST-K234")
    var features = manager.getFeatures()
    expect(features).toContain("batch-publish")
  })

  test("hasFeature checks specific feature", function() {
    expect(manager.hasFeature("templates")).toBe(false)
    manager.activate("SAVE-TEST-K234")
    expect(manager.hasFeature("templates")).toBe(true)
  })

  test("save persists to disk", function() {
    var fs = require("fs")
    manager.activate("ATOM-WXYZ-2345")
    manager.save()
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  test("load reads encrypted data from disk", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    // Round-trip through the manager's own encrypt() (AES-256-GCM)：
    // 捕获 save() 写入的密文，再喂回 load()，避免与具体加密格式耦合
    var captured = null
    fs.writeFileSync.mockImplementationOnce(function(_p, data) {
      captured = data
    })
    var producer = new LicenseManager("/mock/license.json")
    producer.activate("REST-KEYX-2345")
    producer.save()
    expect(captured).toBeTruthy()
    fs.readFileSync.mockReturnValue(captured)
    manager.load()
    expect(manager.isPro()).toBe(true)
    expect(manager.getInfo().licenseKey).toBe("REST-KEYX-2345")
  })
})
