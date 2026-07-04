/**
 * TemplateManager unit tests
 */
jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
}))

jest.mock("path", () => ({
  join: jest.fn(function() { return "/mock/templates.json"; }),
  dirname: jest.fn(),
  basename: jest.fn(function(p) { return p; }),
}))

jest.mock("../electron/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

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
    TemplateManager = require("../electron/template-manager")
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
})
