/**
 * TemplateManager unit tests
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
  readdirSync: vi.fn().mockReturnValue([]),
  renameSync: vi.fn(),
})

__registerMock("path", {
  join: vi.fn(function() { return "/mock/templates.json"; }),
  dirname: vi.fn(),
  basename: vi.fn(function(p) { return p; }),
})

__registerMock("./logger", {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

describe("TemplateManager", function() {
  var TemplateManager
  var manager
  var sampleTemplate = {
    id: "weekly-report",
    name: "周报模板",
    category: "report",
    title: "本周工作汇报",
    content: "本周主要工作及进展：\n1. ...\n2. ...",
    platforms: ["wechat_mp", "zhihu"],
    tags: ["周报", "工作"],
  }

  beforeAll(function() {
    TemplateManager = require("../electron/services/template-manager")
  })

  beforeEach(function() {
    manager = new TemplateManager()
    manager._templates = []
    manager._loaded = false
  })

  test("initializes with empty templates", function() {
    expect(manager.list()).toEqual([])
  })

  test("adds a template", function() {
    manager.add(sampleTemplate)
    expect(manager.list().length).toBe(1)
    expect(manager.list()[0].name).toBe("周报模板")
  })

  test("add assigns unique id if not provided", function() {
    manager.add({ name: "Test", content: "Content" })
    expect(manager.list()[0].id).toBeDefined()
  })

  test("get returns template by id", function() {
    manager.add(sampleTemplate)
    var tpl = manager.get(sampleTemplate.id)
    expect(tpl).toBeDefined()
    expect(tpl.name).toBe("周报模板")
  })

  test("get returns null for unknown id", function() {
    expect(manager.get("nonexistent")).toBeNull()
  })

  test("update modifies existing template", function() {
    manager.add(sampleTemplate)
    manager.update(sampleTemplate.id, { name: "改版周报" })
    expect(manager.get(sampleTemplate.id).name).toBe("改版周报")
  })

  test("delete removes template", function() {
    manager.add(sampleTemplate)
    manager.add({ name: "Other", content: "Other" })
    expect(manager.list().length).toBe(2)
    manager.delete(sampleTemplate.id)
    expect(manager.list().length).toBe(1)
    expect(manager.list()[0].name).toBe("Other")
  })

  test("listByCategory filters templates", function() {
    manager.add(sampleTemplate)
    manager.add({ id: "t2", name: "T2", category: "marketing", content: "C" })
    manager.add({ id: "t3", name: "T3", category: "report", content: "C" })
    expect(manager.listByCategory("report").length).toBe(2)
    expect(manager.listByCategory("marketing").length).toBe(1)
    expect(manager.listByCategory("other").length).toBe(0)
  })

  test("getPresets returns built-in templates", function() {
    var presets = TemplateManager.getPresets()
    expect(presets.length).toBeGreaterThan(0)
    expect(presets[0].id).toBeDefined()
    expect(presets[0].builtin).toBe(true)
  })

  test("seedDefaults adds presets if empty", function() {
    manager.seedDefaults()
    expect(manager.list().length).toBeGreaterThan(0)
  })

  test("save persists templates to disk", function() {
    var fs = require("fs")
    manager.add(sampleTemplate)
    manager.save()
    expect(fs.writeFileSync).toHaveBeenCalled()
  })

  test("load reads from disk", function() {
    var fs = require("fs")
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(JSON.stringify([sampleTemplate]))
    manager.load()
    expect(manager.list().length).toBe(1)
    expect(manager.list()[0].name).toBe("周报模板")
  })

  test("applyRemote 新增官方模板并标记 builtin，用户模板保留", function() {
    manager._templates = [{ id: "user-1", name: "用户模板", builtin: false }]
    manager._loaded = true
    const n = manager.applyRemote([
      { id: "preset-weekly", name: "Weekly Report", category: "report", title: "t", content: "c", platforms: ["wechat_mp"], tags: ["report"], sort_order: 10 },
    ])
    expect(n).toBe(1)
    const list = manager.list()
    expect(list.length).toBe(2)
    const remote = list.find(x => x.id === "preset-weekly")
    expect(remote.builtin).toBe(true)
    expect(remote.name).toBe("Weekly Report")
    expect(list.find(x => x.id === "user-1").name).toBe("用户模板")
  })

  test("applyRemote 按 id 覆盖已有模板字段，仅覆盖出现的键", function() {
    manager._templates = [{ id: "preset-weekly", name: "旧名", category: "report", builtin: true, content: "旧内容" }]
    manager._loaded = true
    const n = manager.applyRemote([{ id: "preset-weekly", name: "新名", platforms: ["weibo"] }])
    expect(n).toBe(1)
    const t = manager.get("preset-weekly")
    expect(t.name).toBe("新名")
    expect(t.content).toBe("旧内容") // 未出现的键不覆盖
    expect(t.platforms).toEqual(["weibo"])
  })

  test("applyRemote 非数组/超上限 fail-closed 返回 0", function() {
    manager._loaded = true
    expect(manager.applyRemote(null)).toBe(0)
    const huge = Array.from({ length: 201 }, (_, i) => ({ id: "t" + i, name: "x" }))
    expect(manager.applyRemote(huge)).toBe(0)
    expect(manager.list().length).toBe(0)
  })

  test("applyRemote 缺席即移除：本次下发未含的内置模板被移除，用户模板保留", function() {
    manager._templates = [
      { id: "preset-weekly", name: "W", builtin: true },
      { id: "user-1", name: "用户", builtin: false },
    ]
    manager._loaded = true
    const n = manager.applyRemote([{ id: "preset-daily", name: "D" }])
    expect(n).toBe(2) // 新增 preset-daily + 移除 preset-weekly
    const ids = manager.list().map(x => x.id)
    expect(ids).toContain("preset-daily")
    expect(ids).not.toContain("preset-weekly")
    expect(ids).toContain("user-1")
  })

  test("applyRemote 类型自防御：非法条目跳过，不污染本地", function() {
    manager._loaded = true
    const n = manager.applyRemote([
      { id: "bad-1", name: 123 },
      { id: "bad-2", name: "x", content: { nested: 1 } },
      { id: "ok", name: "正常", content: "正文" },
    ])
    expect(n).toBe(1)
    const ids = manager.list().map(x => x.id)
    expect(ids).toEqual(["ok"])
  })

  test("applyRemote 数组字段内容相同不触发变更/写盘", function() {
    manager._templates = [{ id: "t", name: "x", platforms: ["wechat_mp"], builtin: true }]
    manager._loaded = true
    var fs = require("fs")
    fs.writeFileSync.mockClear()
    const n = manager.applyRemote([{ id: "t", name: "x", platforms: ["wechat_mp"] }])
    expect(n).toBe(0) // 值相等：不记变更
    expect(fs.writeFileSync).not.toHaveBeenCalled()
  })
})
