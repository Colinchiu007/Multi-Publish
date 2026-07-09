/**
 * 跨包集成测试：ai-writer 包 → WrappedAiWriter (Electron 服务) → axios
 *
 * 验证三件事：
 * 1. 跨包 require 链路 — WrappedAiWriter 通过相对路径 require
 *    `packages/ai-writer/src/index` 并以原型链继承 AiWriter。
 * 2. 委派正确 — WrappedAiWriter 重写的 generateTitles/generateSummary/enhanceContent
 *    调用 orig* 引用（AiWriter.prototype 上的方法），最终走 _call → axios.post。
 * 3. 日志增强 — WrappedAiWriter 在委派前调用 log.info('AiWriter', ...)。
 *
 * 关于 ai-writer-api HTTP 服务器：Electron 运行时并不通过 HTTP 调用 ai-writer-api
 * （ai-writer-api 是独立的 CLI/HTTP 服务），所以本测试不覆盖 HTTP 链路；
 * 该链路由 packages/ai-writer-api/tests/server.test.js 自身的单元测试覆盖。
 *
 * Mock 策略：只在最底层 vi.spyOn(axios, 'post')，让上层全真实运行。
 * 这是 Vitest 4 处理 hoisted ESM 依赖的既定模式（参见 packages/ai-writer/tests/index.test.js）。
 */
import { vi, test, expect, beforeEach, afterEach } from 'vitest'

// 注意：必须用 require('axios') 而非 import axios from 'axios'。
// packages/ai-writer/src/index.js 顶部用 require('axios') 拿 CJS 实例，
// ESM import 在 Vitest 4 下拿到的是不同的模块实例，spy 不生效。
// 用 require 保证与包内同一 Node module cache 实例。
let axios
let WrappedAiWriter
let logger
let axiosPostSpy
let loggerInfoSpy

beforeEach(() => {
  // WrappedAiWriter 与 logger 都无模块级可变状态，无需 resetModules。
  // 但需保证 spy 在 require('./ai-writer') 之前装好，以便包内 require('axios')
  // 命中被 spy 的同一实例（Node module cache）。
  if (axiosPostSpy) axiosPostSpy.mockRestore()
  axios = require('axios')
  axiosPostSpy = vi.spyOn(axios, 'post')

  // logger 是 services/ai-writer.js 顶部 require 的对象，spy 必须在 require 之前装。
  // 但 require('./logger') 本身是幂等的——拿到单例后 spy 其 info 方法即可。
  logger = require('./logger')
  if (loggerInfoSpy) loggerInfoSpy.mockRestore()
  loggerInfoSpy = vi.spyOn(logger, 'info')

  WrappedAiWriter = require('./ai-writer')
})

afterEach(() => {
  if (axiosPostSpy) axiosPostSpy.mockRestore()
  if (loggerInfoSpy) loggerInfoSpy.mockRestore()
})

// 辅助：构造 OpenAI Chat Completions 成功响应
function mockOpenAIResponse (text) {
  axiosPostSpy.mockResolvedValueOnce({
    data: { choices: [{ message: { content: text } }] }
  })
}

test('WrappedAiWriter 继承 AiWriter：generateTitles 解析编号列表 + 透传 Authorization', async () => {
  mockOpenAIResponse('1. 标题一\n2. 标题二\n3. 标题三')
  const writer = new WrappedAiWriter({ apiKey: 'sk-test' })
  const titles = await writer.generateTitles('测试主题')
  expect(titles).toEqual(['标题一', '标题二', '标题三'])
  expect(axiosPostSpy).toHaveBeenCalledTimes(1)

  // 验证 Authorization header 透传到 axios
  // axios.post(url, data, config) — 3 个参数
  const [, , config] = axiosPostSpy.mock.calls[0]
  expect(config.headers.Authorization).toBe('Bearer sk-test')
  expect(config.headers['Content-Type']).toBe('application/json')
  expect(config.timeout).toBe(30000)

  // 验证日志增强：WrappedAiWriter 在委派前调用 log.info('AiWriter', ...)
  expect(loggerInfoSpy).toHaveBeenCalledWith(
    'AiWriter',
    expect.stringContaining('Generating titles for: 测试主题')
  )
})

test('WrappedAiWriter.generateSummary 短路：content < 10 时不调 axios，但仍记日志', async () => {
  const writer = new WrappedAiWriter({ apiKey: 'sk-test' })
  const result = await writer.generateSummary('短内容')
  expect(result).toBe('')
  expect(axiosPostSpy).not.toHaveBeenCalled()
  // 短路发生在 origGenerateSummary 内部，但 WrappedAiWriter 的日志在外层，
  // 所以日志仍然记录（验证日志与短路独立）
  expect(loggerInfoSpy).toHaveBeenCalledWith(
    'AiWriter',
    expect.stringContaining('Generating summary for')
  )
})

test('WrappedAiWriter.generateSummary 正常路径：委派到 _call → axios', async () => {
  mockOpenAIResponse('这是摘要内容')
  const writer = new WrappedAiWriter({ apiKey: 'sk-test' })
  const result = await writer.generateSummary('这是一段足够长的内容用于测试摘要生成功能。')
  expect(result).toBe('这是摘要内容')
  expect(axiosPostSpy).toHaveBeenCalledTimes(1)
})

test('WrappedAiWriter.enhanceContent 短路：content < 5 时返回原文，不调 axios', async () => {
  const writer = new WrappedAiWriter({ apiKey: 'sk-test' })
  const result = await writer.enhanceContent('短', 'polish')
  expect(result).toBe('短')
  expect(axiosPostSpy).not.toHaveBeenCalled()
})

test('WrappedAiWriter.enhanceContent 正常路径：style 透传到 system prompt', async () => {
  mockOpenAIResponse('润色后的内容')
  const writer = new WrappedAiWriter({ apiKey: 'sk-test' })
  const result = await writer.enhanceContent('这是一段需要润色的长内容。', 'concise')
  expect(result).toBe('润色后的内容')
  expect(axiosPostSpy).toHaveBeenCalledTimes(1)
  // 验证 style 出现在 system prompt
  // axios.post(url, data, config) — data 是第二个参数
  const [, body] = axiosPostSpy.mock.calls[0]
  const systemPrompt = body.messages[0].content
  expect(systemPrompt).toContain('concise')
})

test('WrappedAiWriter.isConfigured 反映 apiKey 状态（透传到父类）', () => {
  const configured = new WrappedAiWriter({ apiKey: 'sk-test' })
  const unconfigured = new WrappedAiWriter({})
  expect(configured.isConfigured()).toBe(true)
  expect(unconfigured.isConfigured()).toBe(false)
})

test('axios 失败时返回安全默认值：generateTitles→[] / generateSummary→"" / enhanceContent→原文', async () => {
  axiosPostSpy.mockRejectedValueOnce(new Error('Network error'))
  const writer = new WrappedAiWriter({ apiKey: 'sk-test' })
  const titles = await writer.generateTitles('主题')
  expect(titles).toEqual([])

  axiosPostSpy.mockRejectedValueOnce(new Error('Network error'))
  const longContent = '这是一段足够长的内容用于测试摘要生成功能。'
  const summary = await writer.generateSummary(longContent)
  expect(summary).toBe('')

  axiosPostSpy.mockRejectedValueOnce(new Error('Network error'))
  const enhanced = await writer.enhanceContent('这是一段需要润色的长内容。', 'polish')
  expect(enhanced).toBe('这是一段需要润色的长内容。')
})

test('WrappedAiWriter 实例 instanceof AiWriter（原型链继承正确）', () => {
  const AiWriter = require('../../../../packages/ai-writer/src/index')
  const writer = new WrappedAiWriter({ apiKey: 'sk-test' })
  expect(writer).toBeInstanceOf(AiWriter)
  // 验证重写的方法仍是从 WrappedAiWriter.prototype 上取
  expect(WrappedAiWriter.prototype.generateTitles).not.toBe(AiWriter.prototype.generateTitles)
  expect(WrappedAiWriter.prototype.generateSummary).not.toBe(AiWriter.prototype.generateSummary)
  expect(WrappedAiWriter.prototype.enhanceContent).not.toBe(AiWriter.prototype.enhanceContent)
})
