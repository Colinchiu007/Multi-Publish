/**
 * License plan validation tests
 */
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
