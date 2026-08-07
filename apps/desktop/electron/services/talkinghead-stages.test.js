// @vitest-environment node
const {
  registerTalkingHeadStages,
  TALKINGHEAD_STAGE_TYPES,
  buildSegments,
  buildSrt,
  toSrtTimestamp,
} = require('./talkinghead-stages')

function makePipeline() {
  const executors = new Map()
  const pipeline = {
    stageExecutor: { executors, register(type, fn) { executors.set(type, fn) } },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor(type, fn) { executors.set(type, fn); return { success: true } },
  }
  const reg = registerTalkingHeadStages(pipeline)
  const get = (type) => executors.get(type)
  return { pipeline, get, reg }
}

describe('talking-head 阶段执行器', () => {
  it('注册全部 4 个自定义阶段类型', () => {
    const { reg, get } = makePipeline()
    expect(reg.success).toBe(true)
    expect(reg.registered).toHaveLength(4)
    for (const type of Object.values(TALKINGHEAD_STAGE_TYPES)) {
      expect(get(type)).toBeTypeOf('function')
    }
  })

  describe('分句与 SRT', () => {
    it('buildSegments 按行均分时长', () => {
      const segments = buildSegments('第一句。\n第二句。\n第三句。', 9)
      expect(segments).toHaveLength(3)
      expect(segments[0]).toMatchObject({ text: '第一句。', start: 0, end: 3 })
      expect(segments[2].start).toBe(6)
    })

    it('toSrtTimestamp 格式正确', () => {
      expect(toSrtTimestamp(3661.5)).toBe('01:01:01,500')
      expect(toSrtTimestamp(0)).toBe('00:00:00,000')
    })

    it('buildSrt 生成标准 SRT 块', () => {
      const srt = buildSrt([{ start: 0, end: 2, text: '你好' }])
      expect(srt).toContain('00:00:00,000 --> 00:00:02,000')
      expect(srt).toContain('你好')
    })
  })

  describe('阶段错误路径', () => {
    it('upload 缺少视频时报可行动错误', async () => {
      const { get } = makePipeline()
      const result = await get(TALKINGHEAD_STAGE_TYPES.UPLOAD)({
        stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要可读的本地视频')
    })

    it('transcribe 缺少文案时失败（fail closed）', async () => {
      const { get } = makePipeline()
      const result = await get(TALKINGHEAD_STAGE_TYPES.TRANSCRIBE)({
        stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要 context.upload')
    })

    it('captions 依赖 context.transcribe', async () => {
      const { get } = makePipeline()
      const result = await get(TALKINGHEAD_STAGE_TYPES.CAPTIONS)({
        runId: 'r', stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要 context.transcribe')
    })

    it('render 缺少有效字幕时报错', async () => {
      const { get } = makePipeline()
      const result = await get(TALKINGHEAD_STAGE_TYPES.RENDER)({
        runId: 'r', stage: {}, params: {},
        context: { upload: { videoPath: 'C:/x.mp4' } },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要有效的字幕文件')
    })
  })
})
