/**
 * AiWriter unit tests
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
__registerMock("axios", {
  post: vi.fn(),
})

__registerMock("../electron/logger", {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

describe("AiWriter", function() {
  var AiWriter
  var axios
  var SUCCESS_RESP = { data: { choices: [{ message: { content: "默认回复" } }] } }

  beforeAll(function() {
    AiWriter = require("../electron/services/ai-writer")
  })

  beforeEach(function() {
    axios = require("axios")
    axios.post.mockReset()
    axios.post.mockResolvedValue(SUCCESS_RESP)
  })

  test("constructor sets default options", function() {
    var writer = new AiWriter()
    expect(writer.apiUrl).toBe("https://api.openai.com/v1/chat/completions")
  })

  test("constructor accepts custom options", function() {
    var writer = new AiWriter({ apiUrl: "http://localhost:11434/v1/chat/completions", model: "llama3" })
    expect(writer.apiUrl).toBe("http://localhost:11434/v1/chat/completions")
    expect(writer.model).toBe("llama3")
  })

  test("generateTitles returns array of titles on success", async function() {
    var list = "1. 标题一\n2. 标题二\n3. 标题三"
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: list } }] } })
    var writer = new AiWriter({ apiKey: "test-key" })
    var titles = await writer.generateTitles("AI 技术发展趋势")
    expect(Array.isArray(titles)).toBe(true)
    expect(titles.length).toBeGreaterThanOrEqual(3)
  })

  test("generateTitles returns empty array on API error", async function() {
    axios.post.mockRejectedValue(new Error("API Error"))
    var writer = new AiWriter({ apiKey: "test-key" })
    var titles = await writer.generateTitles("test")
    expect(Array.isArray(titles)).toBe(true)
    expect(titles.length).toBe(0)
  })

  test("generateSummary returns summary text on success", async function() {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: "这是文章的摘要内容。" } }] } })
    var writer = new AiWriter({ apiKey: "test-key" })
    var summary = await writer.generateSummary("这是一篇很长的文章，讨论了很多问题。")
    expect(summary).toBe("这是文章的摘要内容。")
  })

  test("generateSummary returns empty string on error", async function() {
    axios.post.mockRejectedValue(new Error("Network error"))
    var writer = new AiWriter({ apiKey: "test-key" })
    var summary = await writer.generateSummary("test")
    expect(summary).toBe("")
  })

  test("isConfigured returns false without apiKey", function() {
    var writer = new AiWriter()
    expect(writer.isConfigured()).toBe(false)
  })

  test("isConfigured returns true with apiKey", function() {
    var writer = new AiWriter({ apiKey: "sk-test" })
    expect(writer.isConfigured()).toBe(true)
  })

  test("enhanceContent returns enhanced text on success", async function() {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: "这是润色后的内容。" } }] } })
    var writer = new AiWriter({ apiKey: "test-key" })
    var result = await writer.enhanceContent("这是一段需要润色的原始内容")
    expect(result).toBe("这是润色后的内容。")
  })
})
