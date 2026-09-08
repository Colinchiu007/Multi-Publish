/**
 * RewriteStrategyManager unit tests
 *
 * 注意：用 __registerMock 替代 vi.mock（vitest 4 下 vi.mock factory 对 CJS require 不生效）。
 */
__enableElectronMock()

__registerMock("fs", {
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  renameSync: vi.fn(),
})

__registerMock("path", {
  join: vi.fn(function() { return "/mock/rewrite-strategies.json"; }),
  dirname: vi.fn(),
  basename: vi.fn(function(p) { return p; }),
})

__registerMock("./logger", {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

__registerMock("@multi-publish/rewrite-engine", {
  BUILTIN_STRATEGIES: [
    { id: "strategy-viral-storytelling", name: "故事化爆款策略", category: "viral", enabled: true, sort_order: 10 },
    { id: "strategy-ecommerce-convert", name: "电商转化策略", category: "marketing", enabled: true, sort_order: 20 },
  ],
})

describe("RewriteStrategyManager", function() {
  var RewriteStrategyManager
  var manager

  beforeAll(function() {
    RewriteStrategyManager = require("../electron/services/rewrite-strategy-manager")
  })

  beforeEach(function() {
    manager = new RewriteStrategyManager()
    manager._remote = []
    manager._loaded = false
  })

  test("listBuiltins 返回内置策略", function() {
    var builtins = manager.listBuiltins()
    expect(builtins.length).toBe(2)
    expect(builtins[0].id).toBe("strategy-viral-storytelling")
    expect(builtins[0].builtin).toBe(true)
    expect(builtins[0].source).toBe("builtin")
  })

  test("listEnabled 返回内置策略（无远程时）", function() {
    expect(manager.listEnabled().length).toBe(2)
  })

  test("applyRemote 合并远程策略", function() {
    var remote = [{
      id: "strategy-custom-001",
      name: "自定义策略",
      systemPrompt: "测试",
      userPromptTemplate: "测试 {content}",
      category: "viral",
      industry: ["ecommerce"],
      purpose: ["conversion"],
      tone: ["casual"],
      platforms: ["douyin"],
      enabled: true,
      sort_order: 5,
    }]
    var n = manager.applyRemote(remote)
    expect(n).toBeGreaterThanOrEqual(1)
    var list = manager.listEnabled()
    expect(list.length).toBeGreaterThanOrEqual(3)
    var custom = list.find(function(s) { return s.id === "strategy-custom-001" })
    expect(custom).toBeDefined()
    expect(custom.source).toBe("remote")
    expect(custom.builtin).toBe(false)
  })

  test("applyRemote 空数组/null 不报错返回 0", function() {
    expect(manager.applyRemote(null)).toBe(0)
    expect(manager.applyRemote([])).toBe(0)
  })

  test("applyRemote 超上限整批拒绝", function() {
    var huge = []
    for (var i = 0; i < 201; i++) {
      huge.push({
        id: "strategy-fake-" + i,
        name: "Fake " + i,
        systemPrompt: "x",
        userPromptTemplate: "x",
        category: "viral",
        industry: ["general"],
        purpose: ["engagement"],
        tone: ["casual"],
        platforms: ["douyin"],
        enabled: true,
      })
    }
    expect(manager.applyRemote(huge)).toBe(0)
  })

  test("applyRemote 非法条目跳过（缺 name / 非法 category）", function() {
    var bad = [
      { id: "ok", name: "OK", systemPrompt: "x", userPromptTemplate: "x", category: "viral", industry: ["general"], purpose: ["conversion"], tone: ["casual"], platforms: ["douyin"], enabled: true },
      { id: "bad-no-name", systemPrompt: "x" },
      { id: "bad-category", name: "Bad", systemPrompt: "x", userPromptTemplate: "x", category: "invalid", industry: ["general"], purpose: ["conversion"], tone: ["casual"], platforms: ["douyin"], enabled: true },
    ]
    var n = manager.applyRemote(bad)
    expect(n).toBeGreaterThanOrEqual(1)
    var list = manager.listEnabled()
    expect(list.find(function(s) { return s.id === "ok" })).toBeDefined()
    expect(list.find(function(s) { return s.id === "bad-no-name" })).toBeUndefined()
    expect(list.find(function(s) { return s.id === "bad-category" })).toBeUndefined()
  })

  test("get 按 id 获取策略", function() {
    var s = manager.get("strategy-viral-storytelling")
    expect(s).toBeDefined()
    expect(s.name).toBe("故事化爆款策略")
    expect(manager.get("nonexistent")).toBeNull()
  })

  test("listRemote 只返回远程策略", function() {
    manager.applyRemote([{
      id: "strategy-remote-1",
      name: "Remote 1",
      systemPrompt: "x",
      userPromptTemplate: "x",
      category: "viral",
      industry: ["general"],
      purpose: ["engagement"],
      tone: ["casual"],
      platforms: ["douyin"],
      enabled: true,
      sort_order: 1,
    }])
    var remote = manager.listRemote()
    expect(remote.length).toBe(1)
    expect(remote[0].id).toBe("strategy-remote-1")
    expect(remote[0].source).toBe("remote")
  })
})
