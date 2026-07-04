/**
 * AiWriter unit tests
 */
jest.mock("axios", () => ({
  post: jest.fn(),
}))

jest.mock("../electron/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

describe("AiWriter", function() {
  let AiWriter
  let axios
  let SUCCESS_RESP = { data: { choices: [{ message: { content: "默认回复" } }] } }

  beforeAll(function() {
    AiWriter = require("../electron/ai-writer")
  })

  beforeEach(function() {
    axios = require("axios")
    axios.post.mockReset()
    axios.post.mockResolvedValue(SUCCESS_RESP)
  })

  test("constructor sets default options", function() {
    let writer = new AiWriter()
    expect(writer.apiUrl).toBe("https://api.openai.com/v1/chat/completions")
  })

  test("constructor accepts custom options", function() {
    let writer = new AiWriter({ apiUrl: "http://localhost:11434/v1/chat/completions", model: "llama3" })
    expect(writer.apiUrl).toBe("http://localhost:11434/v1/chat/completions")
    expect(writer.model).toBe("llama3")
  })

  test("generateTitles returns array of titles on success", async function() {
    let list = "1. 标题一\n2. 标题二\n3. 标题三"
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: list } }] } })
    let writer = new AiWriter({ apiKey: "test-key" })
    let titles = await writer.generateTitles("AI 技术发展趋势")
    expect(Array.isArray(titles)).toBe(true)
    expect(titles.length).toBeGreaterThanOrEqual(3)
  })

  test("generateTitles returns empty array on API error", async function() {
    axios.post.mockRejectedValue(new Error("API Error"))
    let writer = new AiWriter({ apiKey: "test-key" })
    let titles = await writer.generateTitles("test")
    expect(Array.isArray(titles)).toBe(true)
    expect(titles.length).toBe(0)
  })

  test("generateSummary returns summary text on success", async function() {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: "这是文章的摘要内容。" } }] } })
    let writer = new AiWriter({ apiKey: "test-key" })
    let summary = await writer.generateSummary("这是一篇很长的文章，讨论了很多问题。")
    expect(summary).toBe("这是文章的摘要内容。")
  })

  test("generateSummary returns empty string on error", async function() {
    axios.post.mockRejectedValue(new Error("Network error"))
    let writer = new AiWriter({ apiKey: "test-key" })
    let summary = await writer.generateSummary("test")
    expect(summary).toBe("")
  })

  test("isConfigured returns false without apiKey", function() {
    let writer = new AiWriter()
    expect(writer.isConfigured()).toBe(false)
  })

  test("isConfigured returns true with apiKey", function() {
    let writer = new AiWriter({ apiKey: "sk-test" })
    expect(writer.isConfigured()).toBe(true)
  })

  test("enhanceContent returns enhanced text on success", async function() {
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: "这是润色后的内容。" } }] } })
    let writer = new AiWriter({ apiKey: "test-key" })
    let result = await writer.enhanceContent("这是一段需要润色的原始内容")
    expect(result).toBe("这是润色后的内容。")
  })
})
