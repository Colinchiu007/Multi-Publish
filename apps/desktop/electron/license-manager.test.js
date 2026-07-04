/**
 * LicenseManager unit tests
 */
jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}))

jest.mock("path", () => ({
  join: jest.fn(() => "/mock/license.json"),
  dirname: jest.fn(),
}))

jest.mock("../electron/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

describe("LicenseManager", function() {
  let LicenseManager
  let manager

  beforeAll(function() {
    LicenseManager = require("../electron/license-manager")
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
    manager.activate("TEST-KEY-12345")
    expect(manager.isPro()).toBe(true)
    expect(manager.getInfo().licenseKey).toBe("TEST-KEY-12345")
  })

  test("deactivate resets to free", function() {
    manager.activate("TEST-KEY-12345")
    expect(manager.isPro()).toBe(true)
    manager.deactivate()
    expect(manager.isPro()).toBe(false)
  })

  test("activate does not overwrite existing key on re-activate", function() {
    manager.activate("KEY-1")
    manager.activate("KEY-2")
    expect(manager.getInfo().licenseKey).toBe("KEY-1")
  })

  test("getFeatures returns free features for free users", function() {
    let features = manager.getFeatures()
    expect(Array.isArray(features)).toBe(true)
    expect(features).not.toContain("batch-publish")
  })

  test("getFeatures returns pro features for pro users", function() {
    manager.activate("PRO-KEY")
    let features = manager.getFeatures()
    expect(features).toContain("batch-publish")
  })

  test("hasFeature checks specific feature", function() {
    expect(manager.hasFeature("templates")).toBe(false)
    manager.activate("PRO-KEY")
    expect(manager.hasFeature("templates")).toBe(true)
  })

  test("save persists to disk", function() {
    let fs = require("fs")
    manager.activate("SAVE-TEST")
    manager.save()
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  test("load reads obfuscated data from disk", function() {
    let fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    // Use the LicenseManager's own obfuscation
    let crypto = require("crypto")
    let raw = JSON.stringify({
      type: "pro",
      licenseKey: "LOADED-KEY",
      activatedAt: "2026-07-04T00:00:00Z",
    })
    let buf = Buffer.from(raw, "utf-8")
    let xor = Buffer.alloc(buf.length)
    for (var i = 0; i < buf.length; i++) xor[i] = buf[i] ^ 0x4d
    fs.readFileSync.mockReturnValue(xor.toString("base64"))
    manager.load()
    expect(manager.isPro()).toBe(true)
    expect(manager.getInfo().licenseKey).toBe("LOADED-KEY")
  })
})
