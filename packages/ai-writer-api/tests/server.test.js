/**
 * AiWriter API server tests
 */
// @multi-publish/ai-writer 通过 workspace hoisting 在根 node_modules 解析，
// Vitest 4 对此类 hoisted 依赖的 vi.mock 拦截不完整（factory 不会执行）。
// 改用 vi.spyOn 真实 AiWriter.prototype 方法：src/server.js 顶层
// require("@multi-publish/ai-writer") 与测试拿到同一 constructor 引用，
// spy prototype 方法即可拦截 new AiWriter().generateTitles() 等调用。
var AiWriter = require("@multi-publish/ai-writer")
var request = require("supertest")
var app

var _spies = {}

// 测试用 API Key（不再使用弱默认值，显式注入）
var VALID_KEY = "test-api-key-for-vitest"

beforeAll(function() {
  // 显式设置环境变量，使 server.js 能初始化
  process.env.AI_WRITER_API_KEY = VALID_KEY
  // spy prototype 方法，保留默认行为以便 server.js 初始化时 isConfigured() 等
  _spies.generateTitles = vi.spyOn(AiWriter.prototype, "generateTitles").mockResolvedValue([])
  _spies.generateSummary = vi.spyOn(AiWriter.prototype, "generateSummary").mockResolvedValue("")
  _spies.enhanceContent = vi.spyOn(AiWriter.prototype, "enhanceContent").mockResolvedValue("")
  _spies.isConfigured = vi.spyOn(AiWriter.prototype, "isConfigured").mockReturnValue(true)
  var mod = require("../src/server")
  // server.js 在 API_KEY 可用时导出 app，否则导出工厂
  app = mod.createApp ? mod.createApp({ apiKey: VALID_KEY }) : mod
})

beforeEach(function() {
  // 只清 calls，保留 mockImplementation（vi.clearAllMocks 会清 implementation，
  // 这里手动重置 mockResolvedValue 的返回值到默认）
  _spies.generateTitles.mockClear()
  _spies.generateSummary.mockClear()
  _spies.enhanceContent.mockClear()
  _spies.isConfigured.mockClear()
  _spies.generateTitles.mockResolvedValue([])
  _spies.generateSummary.mockResolvedValue("")
  _spies.enhanceContent.mockResolvedValue("")
  _spies.isConfigured.mockReturnValue(true)
})

afterAll(function() {
  vi.restoreAllMocks()
})

describe("AiWriter API", function() {
  test("GET /api/ai/health returns OK", async function() {
    var res = await request(app).get("/api/ai/health")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("ok")
  })

  test("POST /api/ai/titles returns titles", async function() {
    _spies.generateTitles.mockResolvedValue(["Title 1", "Title 2", "Title 3"])
    var res = await request(app)
      .post("/api/ai/titles")
      .send({ topic: "AI trends", count: 3 })
      .set("X-API-Key", VALID_KEY)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(["Title 1", "Title 2", "Title 3"])
    expect(_spies.generateTitles).toHaveBeenCalledWith("AI trends", 3)
  })

  test("POST /api/ai/titles without count defaults to 5", async function() {
    _spies.generateTitles.mockResolvedValue(["T1"])
    await request(app)
      .post("/api/ai/titles")
      .send({ topic: "test" })
      .set("X-API-Key", VALID_KEY)
    expect(_spies.generateTitles).toHaveBeenCalledWith("test", 5)
  })

  test("POST /api/ai/summary returns summary", async function() {
    _spies.generateSummary.mockResolvedValue("Summary text")
    var res = await request(app)
      .post("/api/ai/summary")
      .send({ content: "Long article content here" })
      .set("X-API-Key", VALID_KEY)
    expect(res.status).toBe(200)
    expect(res.body.data).toBe("Summary text")
  })

  test("POST /api/ai/enhance returns enhanced content", async function() {
    _spies.enhanceContent.mockResolvedValue("Enhanced content")
    var res = await request(app)
      .post("/api/ai/enhance")
      .send({ content: "Original text", style: "concise" })
      .set("X-API-Key", VALID_KEY)
    expect(res.status).toBe(200)
    expect(res.body.data).toBe("Enhanced content")
    expect(_spies.enhanceContent).toHaveBeenCalledWith("Original text", "concise")
  })

  test("POST /api/ai/enhance defaults to polish style", async function() {
    _spies.enhanceContent.mockResolvedValue("Enhanced")
    await request(app)
      .post("/api/ai/enhance")
      .send({ content: "text" })
      .set("X-API-Key", VALID_KEY)
    expect(_spies.enhanceContent).toHaveBeenCalledWith("text", "polish")
  })

  test("returns 400 for missing required fields", async function() {
    var res = await request(app)
      .post("/api/ai/titles")
      .send({})
      .set("X-API-Key", VALID_KEY)
    expect(res.status).toBe(400)
  })

  test("returns 401 without API key", async function() {
    var res = await request(app).post("/api/ai/titles").send({ topic: "test" })
    expect(res.status).toBe(401)
  })

  test("returns 401 with wrong API key", async function() {
    var res = await request(app)
      .post("/api/ai/titles")
      .send({ topic: "test" })
      .set("X-API-Key", "wrong-key")
    expect(res.status).toBe(401)
  })

  test("POST /api/ai/titles returns 500 on AI error", async function() {
    _spies.generateTitles.mockRejectedValue(new Error("API failed"))
    var res = await request(app)
      .post("/api/ai/titles")
      .send({ topic: "test" })
      .set("X-API-Key", VALID_KEY)
    expect(res.status).toBe(500)
    expect(res.body.error).toBeDefined()
  })
})
