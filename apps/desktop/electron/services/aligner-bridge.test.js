// @vitest-environment node
const AlignerBridge = require('./aligner-bridge')

describe('AlignerBridge /align 请求契约', () => {
  it('transcribeAudio 组装 /align body 并透传选项', async () => {
    const bridge = new AlignerBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ code: 0, data: { words: [] } }))

    const result = await bridge.transcribeAudio('C:/tmp/vo.mp3', {
      model: 'base',
      language: 'zh',
      beamSize: 5,
      vadFilter: true,
      initialPrompt: '要知道在农耕社会',
    })

    expect(bridge._post).toHaveBeenCalledTimes(1)
    const [path, rawBody] = bridge._post.mock.calls[0]
    expect(path).toBe('/align')
    const body = JSON.parse(rawBody)
    expect(body.audio_path).toBe('C:/tmp/vo.mp3')
    expect(body.options).toEqual({
      model: 'base',
      language: 'zh',
      beam_size: 5,
      vad_filter: true,
      initial_prompt: '要知道在农耕社会',
    })
    expect(result).toEqual({ code: 0, data: { words: [] } })
  })

  it('缺省选项使用默认值（base / beam 5 / vad on）', async () => {
    const bridge = new AlignerBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ words: [] }))
    await bridge.transcribeAudio('C:/tmp/vo.mp3')
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body.options.model).toBe('base')
    expect(body.options.beam_size).toBe(5)
    expect(body.options.vad_filter).toBe(true)
  })
})
describe('AlignerBridge traceId（cross-process-traceid R1/R3）', () => {
  it('transcribeAudio 透传 traceId 且 body 不含 traceId', async () => {
    const bridge = new AlignerBridge({})
    bridge.isRunning = true
    bridge._post = vi.fn(() => Promise.resolve({ words: [], segments: [], language: 'zh', duration: 0.5, elapsed_ms: 10, model: 'base' }))

    await bridge.transcribeAudio('C:/tmp/vo.mp3', { model: 'base', language: 'zh', traceId: 'run_2' })

    expect(bridge._post.mock.calls[0][3]).toBe('run_2')
    const body = JSON.parse(bridge._post.mock.calls[0][1])
    expect(body.audio_path).toBe('C:/tmp/vo.mp3')
    expect(JSON.stringify(body)).not.toContain('traceId')
  })
})
