/**
 * AiWriter API server tests
 */
jest.mock("@multi-publish/ai-writer")

var AiWriter = require("@multi-publish/ai-writer")
var request = require("supertest")
var app

// Mock AiWriter
var mockGenerateTitles = jest.fn()
var mockGenerateSummary = jest.fn()
var mockEnhanceContent = jest.fn()

AiWriter.mockImplementation(function() {
  return {
    generateTitles: mockGenerateTitles,
    generateSummary: mockGenerateSummary,
    enhanceContent: mockEnhanceContent,
    isConfigured: jest.fn().mockReturnValue(true),
  }
})

beforeAll(function() {
  jest.isolateModules(function() {
    app = require("../src/server")
  })
})

beforeEach(function() {
  jest.clearAllMocks()
})

var VALID_KEY = "dev-key-change-me"

describe("AiWriter API", function() {
  test("GET /api/ai/health returns OK", async function() {
    var res = await request(app).get("/api/ai/health")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("ok")
  })

  test("POST /api/ai/titles returns titles", async function() {
    mockGenerateTitles.mockResolvedValue(["Title 1", "Title 2", "Title 3"])
    var res = await request(app)
      .post("/api/ai/titles")
      .send({ topic: "AI trends", count: 3 })
      .set("X-API-Key", VALID_KEY)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual(["Title 1", "Title 2", "Title 3"])
    expect(mockGenerateTitles).toHaveBeenCalledWith("AI trends", 3)
  })

  test("POST /api/ai/titles without count defaults to 5", async function() {
    mockGenerateTitles.mockResolvedValue(["T1"])
    await request(app)
      .post("/api/ai/titles")
      .send({ topic: "test" })
      .set("X-API-Key", VALID_KEY)
    expect(mockGenerateTitles).toHaveBeenCalledWith("test", 5)
  })

  test("POST /api/ai/summary returns summary", async function() {
    mockGenerateSummary.mockResolvedValue("Summary text")
    var res = await request(app)
      .post("/api/ai/summary")
      .send({ content: "Long article content here" })
      .set("X-API-Key", VALID_KEY)
    expect(res.status).toBe(200)
    expect(res.body.data).toBe("Summary text")
  })

  test("POST /api/ai/enhance returns enhanced content", async function() {
    mockEnhanceContent.mockResolvedValue("Enhanced content")
    var res = await request(app)
      .post("/api/ai/enhance")
      .send({ content: "Original text", style: "concise" })
      .set("X-API-Key", VALID_KEY)
    expect(res.status).toBe(200)
    expect(res.body.data).toBe("Enhanced content")
    expect(mockEnhanceContent).toHaveBeenCalledWith("Original text", "concise")
  })

  test("POST /api/ai/enhance defaults to polish style", async function() {
    mockEnhanceContent.mockResolvedValue("Enhanced")
    await request(app)
      .post("/api/ai/enhance")
      .send({ content: "text" })
      .set("X-API-Key", VALID_KEY)
    expect(mockEnhanceContent).toHaveBeenCalledWith("text", "polish")
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
    mockGenerateTitles.mockRejectedValue(new Error("API failed"))
    var res = await request(app)
      .post("/api/ai/titles")
      .send({ topic: "test" })
      .set("X-API-Key", VALID_KEY)
    expect(res.status).toBe(500)
    expect(res.body.error).toBeDefined()
  })
})
