/**
 * UsageTracker unit tests (desktop app usage statistics)
 */
jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}))

jest.mock("path", () => ({
  join: jest.fn(function() { return "/mock/usage-data.json"; }),
  dirname: jest.fn(),
}))

jest.mock("../electron/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

describe("UsageTracker", () => {
  let UsageTracker
  let tracker

  beforeAll(function() {
    UsageTracker = require("../electron/usage-tracker")
  })

  beforeEach(function() {
    tracker = new UsageTracker()
    // Reset internal state
    tracker._data = { events: [], features: {}, daily: {}, sessions: 0, since: null }
    tracker._loaded = false
  })

  test("initializes with empty data", function() {
    expect(tracker._data).toBeDefined()
    expect(tracker._data.events).toEqual([])
    expect(tracker._data.features).toEqual({})
    expect(tracker._data.daily).toEqual({})
    expect(tracker._data.sessions).toBe(0)
  })

  test("trackEvent records an event", function() {
    tracker.trackEvent("publish", "click", { platform: "weibo" })
    expect(tracker._data.events.length).toBe(1)
    expect(tracker._data.events[0].feature).toBe("publish")
    expect(tracker._data.events[0].action).toBe("click")
    expect(tracker._data.events[0].detail.platform).toBe("weibo")
    expect(tracker._data.events[0].timestamp).toBeDefined()
  })

  test("trackFeatureUsage increments counter", function() {
    tracker.trackFeatureUsage("publish_button", "click")
    tracker.trackFeatureUsage("publish_button", "click")
    tracker.trackFeatureUsage("publish_button", "success")
    expect(tracker._data.features.publish_button.click).toBe(2)
    expect(tracker._data.features.publish_button.success).toBe(1)
  })

  test("trackDaily records per-day stats", function() {
    let today = new Date().toISOString().split("T")[0]
    tracker.trackDaily("articles_published", 3)
    tracker.trackDaily("articles_published", 1)
    expect(tracker._data.daily[today].articles_published).toBe(4)
  })

  test("getStats returns summary", function() {
    tracker.trackFeatureUsage("publish", "click")
    tracker.trackFeatureUsage("login", "success")
    tracker.trackEvent("app", "start")
    let stats = tracker.getStats()
    expect(stats.features.publish.click).toBe(1)
    expect(stats.features.login.success).toBe(1)
    expect(stats.events).toBeDefined()
  })

  test("save persists data to disk", function() {
    let fs = require("fs")
    tracker.trackFeatureUsage("test", "click")
    tracker.save()
    expect(fs.writeFileSync).toHaveBeenCalled()
    let callArg = fs.writeFileSync.mock.calls[0][1]
    let parsed = JSON.parse(callArg)
    expect(parsed.features.test.click).toBe(1)
  })

  test("getDailyStats returns daily breakdown", function() {
    let today = new Date().toISOString().split("T")[0]
    tracker.trackDaily("articles_published", 5)
    tracker.trackDaily("platforms_used", 3)
    let daily = tracker.getDailyStats()
    expect(daily[today].articles_published).toBe(5)
    expect(daily[today].platforms_used).toBe(3)
  })

  test("reset clears all data", function() {
    tracker.trackFeatureUsage("publish", "click")
    tracker.trackEvent("app", "start")
    expect(tracker._data.events.length).toBeGreaterThan(0)
    tracker.reset()
    expect(tracker._data.events.length).toBe(0)
    expect(Object.keys(tracker._data.features).length).toBe(0)
  })

  test("load reads from disk", function() {
    let fs = require("fs")
    let saved = { events: [{feature:"test",action:"load"}], features: {test:{load:1}}, daily: {}, sessions: 1, since: "2026-01-01" }
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify(saved))
    tracker.load()
    expect(tracker._data.features.test.load).toBe(1)
    expect(tracker._data.sessions).toBe(1)
  })
})
