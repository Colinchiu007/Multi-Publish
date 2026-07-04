/**
 * Container ? DI container tests
 */
var Container = require("../electron/container")

describe("Container", function() {
  var c

  beforeEach(function() {
    c = new Container()
  })

  test("register stores a value", function() {
    c.register("logger", { info: jest.fn() })
    expect(c.get("logger")).toBeDefined()
  })

  test("register with factory creates lazily", function() {
    var factory = jest.fn().mockReturnValue({ port: 8080 })
    c.register("server", factory)
    expect(factory).not.toHaveBeenCalled()
    var svc = c.get("server")
    expect(svc.port).toBe(8080)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  test("factory is called once (singleton)", function() {
    var factory = jest.fn().mockReturnValue({ x: 1 })
    c.register("s", factory)
    c.get("s")
    c.get("s")
    expect(factory).toHaveBeenCalledTimes(1)
  })

  test("has returns true/false", function() {
    c.register("a", 1)
    expect(c.has("a")).toBe(true)
    expect(c.has("b")).toBe(false)
  })

  test("assertRequired throws on missing deps", function() {
    expect(function() {
      c.assertRequired(["db", "cache"])
    }).toThrow("Missing required services: db, cache")
  })

  test("assertRequired passes when all exist", function() {
    c.register("db", {})
    c.register("cache", {})
    expect(function() {
      c.assertRequired(["db", "cache"])
    }).not.toThrow()
  })

  test("register singleton with factory and dependencies", function() {
    c.register("config", { port: 3000 })
    c.register("server", function(container) {
      return { port: container.get("config").port, started: true }
    })
    var svc = c.get("server")
    expect(svc.port).toBe(3000)
    expect(svc.started).toBe(true)
  })

  test("registerMany bulk registers", function() {
    c.registerMany({
      a: 1,
      b: function() { return 2 },
    })
    expect(c.get("a")).toBe(1)
    expect(c.get("b")).toBe(2)
  })
})