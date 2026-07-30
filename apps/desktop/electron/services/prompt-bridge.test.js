// @vitest-environment node
const PromptBridge = require('./prompt-bridge')

describe('PromptBridge prompt-engine 请求兼容', () => {
  it('批量优化会省略空的可选字段，并把文本上下文转换为 synopsis 对象', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: [] }))

    const request = {
      prompt: '城市夜景',
      style: 'realistic',
      max_length: null,
      context: '一个发生在未来城市的故事',
    }
    await bridge.optimizeBatch([request])

    expect(request).toEqual({
      prompt: '城市夜景',
      style: 'realistic',
      max_length: null,
      context: '一个发生在未来城市的故事',
    })
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body.requests[0]).toEqual({
      prompt: '城市夜景',
      style: 'realistic',
      context: { synopsis: '一个发生在未来城市的故事' },
    })
    expect(body.requests[0]).not.toHaveProperty('max_length')
  })

  it('单个优化同样不会发送 null max_length 或空 context', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))

    await bridge.optimize({ prompt: '山间日出', max_length: null, context: '' })

    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body).toEqual({ prompt: '山间日出' })
  })

  it('单个和批量优化对非对象输入使用相同的 prompt 兼容规则', async () => {
    const bridge = new PromptBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: {} }))

    await bridge.optimize(42)
    await bridge.optimizeBatch([42])

    expect(JSON.parse(bridge._post.mock.calls[0][1])).toEqual({ prompt: '42' })
    expect(JSON.parse(bridge._post.mock.calls[1][1])).toEqual({
      requests: [{ prompt: '42' }],
    })
  })
})
