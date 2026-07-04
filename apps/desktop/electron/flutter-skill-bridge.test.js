/**
 * flutter-skill-bridge unit tests
 */
jest.mock("ws", () => ({
  WebSocketServer: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}))

jest.mock("../electron/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

jest.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: jest.fn().mockReturnValue([]),
    getFocusedWindow: jest.fn().mockReturnValue(null),
  },
}))

describe("FlutterSkillBridge", () => {
  beforeEach(() => {
    jest.resetModules()
    delete process.env.FLUTTER_SKILL_BRIDGE
  })

  test("start does nothing when disabled", () => {
    var bridge = require("../electron/flutter-skill-bridge")
    bridge.start(null)
    var running = bridge.isRunning()
    expect(running).toBe(false)
  })

  test("start enables when FLUTTER_SKILL_BRIDGE=1", () => {
    process.env.FLUTTER_SKILL_BRIDGE = "1"
    var bridge = require("../electron/flutter-skill-bridge")
    bridge.start({})
    var running = bridge.isRunning()
    expect(running).toBe(true)
  })

  test("stop sets isRunning to false", () => {
    process.env.FLUTTER_SKILL_BRIDGE = "1"
    var bridge = require("../electron/flutter-skill-bridge")
    bridge.start({})
    expect(bridge.isRunning()).toBe(true)
    bridge.stop()
    expect(bridge.isRunning()).toBe(false)
  })

  test("isRunning returns false when not started", () => {
    var bridge = require("../electron/flutter-skill-bridge")
    expect(bridge.isRunning()).toBe(false)
  })
})
