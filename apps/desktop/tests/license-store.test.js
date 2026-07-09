/**
 * License plan validation tests
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
__enableElectronMock()

describe("License plan validation", function() {
  test("PRO_FEATURES includes expected items", function() {
    var LM = require("../electron/license-manager")
    var features = LM.PRO_FEATURES
    expect(features).toContain("batch-publish")
    expect(features).toContain("scheduled-publish")
    expect(features).toContain("platform-all")
    expect(features).toContain("templates")
  })

  test("FREE_FEATURES is smaller than PRO", function() {
    var LM = require("../electron/license-manager")
    expect(LM.FREE_FEATURES.length).toBeLessThan(LM.PRO_FEATURES.length)
  })

  test("TRIAL_DAYS is 7", function() {
    var LM = require("../electron/license-manager")
    expect(LM.TRIAL_DAYS).toBe(7)
  })
})
