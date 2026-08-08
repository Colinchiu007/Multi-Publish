// @ts-check
/**
 * minimax-llm.test.js — MiniMax 文字推理（LLM）Adapter 单元测试
 *
 * 覆盖：
 *   - 默认 base_url / 模型常量与模型列表
 *   - chatCompletion：请求体（model/messages）、响应解析（content/finish_reason/usage）
 *   - 参数缺失报 INVALID_CONFIG
 *   - HTTP 错误 → ProviderError（含 429 映射）
 *   - streamChat：SSE 解析
 *   - capabilities()/supports() 能力协商
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { MinimaxLlmAdapter, MINIMAX_LLM_MODELS, DEFAULT_MODEL, stripThinkingBlocks } = require('./minimax-llm')
const { ProviderError, ERROR_CODES } = require('./_base/provider-error')

function jsonResponse (body, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

describe('MinimaxLlmAdapter', () => {
  let adapter
  const fetchSpy = vi.fn()

  beforeEach(() => {
    global.fetch = fetchSpy
    adapter = new MinimaxLlmAdapter({ apiKey: 'mm-key', baseUrl: 'https://api.minimaxi.com/v1' })
  })

  afterEach(() => {
    fetchSpy.mockReset()
    delete global.fetch
  })

  it('默认 base_url 与模型常量', () => {
    expect(adapter.credentials.baseUrl).toBe('https://api.minimaxi.com/v1')
    expect(DEFAULT_MODEL).toBe('MiniMax-M2.7')
    expect(MINIMAX_LLM_MODELS.some(m => m.id === 'MiniMax-M3')).toBe(true)
  })

  it('validateConfig 校验 apiKey/baseUrl', () => {
    expect(new MinimaxLlmAdapter({ apiKey: 'k', baseUrl: 'https://api.minimaxi.com/v1' }).validateConfig().valid).toBe(true)
    expect(new MinimaxLlmAdapter({ baseUrl: 'https://api.minimaxi.com/v1' }).validateConfig().valid).toBe(false)
  })

  it('capabilities 包含 chatCompletion/streamChat/listModels/testConnection', () => {
    const caps = adapter.capabilities()
    expect(caps).toContain('chatCompletion')
    expect(caps).toContain('streamChat')
    expect(caps).toContain('listModels')
    expect(caps).toContain('testConnection')
    expect(adapter.supports('chatCompletion')).toBe(true)
    expect(adapter.supports('synthesize')).toBe(false)
  })

  it('stripThinkingBlocks 剥离 <think> 思考块（成对/未闭合/无思考）', () => {
    expect(stripThinkingBlocks('<think>思考内容</think>最终答案')).toBe('最终答案')
    expect(stripThinkingBlocks('A<think>思考</think>B')).toBe('AB')
    expect(stripThinkingBlocks('<think>没有闭合的思考')).toBe('')
    expect(stripThinkingBlocks('正常内容')).toBe('正常内容')
    expect(stripThinkingBlocks('')).toBe('')
  })

  it('chatCompletion 剥离 content 中的 <think> 思考块', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      id: 'resp-think',
      model: 'MiniMax-M2.7',
      choices: [{
        message: { content: '<think>用户让我把场景 12 变成图片提示词</think>\n\nA real final prompt' },
        finish_reason: 'stop',
      }],
    }))
    const result = await adapter.chatCompletion({ messages: [{ role: 'user', content: '12' }] })
    expect(result.content).toBe('A real final prompt')
    expect(result.content).not.toContain('think')
  })

  it('chatCompletion 纯思考无答案时返回空 content（不把思考当答案）', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      choices: [{ message: { content: '<think>只有思考</think>' }, finish_reason: 'stop' }],
    }))
    const result = await adapter.chatCompletion({ messages: [] })
    expect(result.content).toBe('')
  })

  it('streamChat 抑制跨 chunk 的 think 块', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"最终"}}]}',
      'data: {"choices":[{"delta":{"content":"<think>思考开"}}]}',
      'data: {"choices":[{"delta":{"content":"始了"}}]}',
      'data: {"choices":[{"delta":{"content":"</think>答案"}}]}',
      'data: [DONE]',
    ].join('\n')
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks + '\n') })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    }
    fetchSpy.mockResolvedValue({ ok: true, status: 200, body: { getReader: () => reader } })
    const received = []
    await adapter.streamChat({ messages: [] }, (c) => received.push(c))
    expect(received.join('')).toBe('最终答案')
  })

  it('chatCompletion 使用默认模型并解析响应', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({
      id: 'resp-1',
      model: 'MiniMax-M2.7',
      choices: [{ message: { content: '你好' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    }))
    const result = await adapter.chatCompletion({ messages: [{ role: 'user', content: 'hi' }] })
    expect(result.content).toBe('你好')
    expect(result.model).toBe('MiniMax-M2.7')
    expect(result.usage.total_tokens).toBe(8)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.minimaxi.com/v1/chat/completions')
    const body = JSON.parse(init.body)
    expect(body.model).toBe('MiniMax-M2.7')
    expect(body.messages[0].content).toBe('hi')
    expect(init.headers.Authorization).toBe('Bearer mm-key')
  })

  it('chatCompletion 缺少 messages 抛 INVALID_CONFIG', async () => {
    await expect(adapter.chatCompletion({ model: 'MiniMax-M2.7' })).rejects.toMatchObject({ code: ERROR_CODES.INVALID_CONFIG })
  })

  it('HTTP 429 → ProviderError RATE_LIMITED', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ base_resp: { status_msg: 'rate limited' } }, false, 429))
    await expect(adapter.chatCompletion({ messages: [] })).rejects.toMatchObject({ code: ERROR_CODES.RATE_LIMITED })
  })

  it('HTTP 401 → ProviderError AUTH_FAILED', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, false, 401))
    await expect(adapter.chatCompletion({ messages: [] })).rejects.toMatchObject({ code: ERROR_CODES.AUTH_FAILED })
  })

  it('streamChat 解析 SSE 数据', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      'data: [DONE]',
    ].join('\n')
    const reader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sse + '\n') })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    }
    fetchSpy.mockResolvedValue({ ok: true, status: 200, body: { getReader: () => reader } })
    const chunks = []
    await adapter.streamChat({ messages: [] }, (c) => chunks.push(c))
    expect(chunks).toEqual(['你', '好'])
  })

  it('testConnection 网络错误返回 success:false', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'))
    const result = await adapter.testConnection()
    expect(result.success).toBe(false)
  })
})

