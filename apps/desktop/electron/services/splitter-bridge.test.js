// @vitest-environment node
const SplitterBridge = require('./splitter-bridge')

describe('SplitterBridge traceId（cross-process-traceid R1/R3）', () => {
  it('split 透传 traceId 且 body 不含 traceId', async () => {
    const bridge = new SplitterBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ scenes: [], sentences: [] }))

    await bridge.split('第一句。第二句！', { language: 'zh', traceId: 'run_1' })

    expect(bridge._post.mock.calls[0][3]).toBe('run_1')
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body.language).toBe('zh')
    expect(body).not.toHaveProperty('traceId')
  })

  it('未提供 traceId 时不传（_post 第 4 参为 undefined）', async () => {
    const bridge = new SplitterBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ scenes: [], sentences: [] }))

    await bridge.split('普通分句', { mode: 'precise' })

    expect(bridge._post.mock.calls[0][3]).toBeUndefined()
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body).not.toHaveProperty('traceId')
  })
})
