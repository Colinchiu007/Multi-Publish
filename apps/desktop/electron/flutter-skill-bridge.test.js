/**
 * flutter-skill-bridge unit tests
 */
jest.mock("ws", () => ({
  WebSocketServer: jest.fn().mockImplementation(function() {
    return { on: jest.fn(), close: jest.fn() };
  }),
}))

jest.mock("../../packages/flutter-skill-bridge/flutter-skill-electron.js", () => {
  function MockBridge(opts) {
    this.port = opts.port || 18118;
    this.appName = "test";
    this.started = false;
  }
  MockBridge.prototype.start = function() { this.started = true; };
  MockBridge.prototype.stop = function() { this.started = false; };
  return { default: MockBridge };
}, { virtual: true })

jest.mock("../electron/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

describe("FlutterSkillBridge", () => {
  beforeEach(function() {
    jest.resetModules()
    delete process.env.FLUTTER_SKILL_BRIDGE
    delete require.cache[require.resolve("../electron/flutter-skill-bridge")]
  })

  test("isRunning returns false when not started", function() {
    let bridge = require("../electron/flutter-skill-bridge")
    expect(bridge.isRunning()).toBe(false)
  })

  test("start does nothing when disabled (no env var)", function() {
    let bridge = require("../electron/flutter-skill-bridge")
    bridge.start(null)
    expect(bridge.isRunning()).toBe(false)
  })

  test("start enables bridge when FLUTTER_SKILL_BRIDGE=1", function() {
    process.env.FLUTTER_SKILL_BRIDGE = "1"
    let bridge = require("../electron/flutter-skill-bridge")
    bridge.start({})
    expect(bridge.isRunning()).toBe(true)
  })

  test("stop sets isRunning to false", function() {
    process.env.FLUTTER_SKILL_BRIDGE = "1"
    let bridge = require("../electron/flutter-skill-bridge")
    bridge.start({})
    expect(bridge.isRunning()).toBe(true)
    bridge.stop()
    expect(bridge.isRunning()).toBe(false)
  })

  test("start with --flutter-skill arg flag", function() {
    process.argv.push("--flutter-skill")
    let bridge = require("../electron/flutter-skill-bridge")
    bridge.start({})
    expect(bridge.isRunning()).toBe(true)
    // Cleanup
    let idx = process.argv.indexOf("--flutter-skill")
    if (idx >= 0) process.argv.splice(idx, 1)
  })
})
