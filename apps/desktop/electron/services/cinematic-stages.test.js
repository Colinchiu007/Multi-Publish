// @vitest-environment node
const {
  registerCinematicStages,
  CINEMATIC_STAGE_TYPES,
  parseProbe,
} = require('./cinematic-stages')

function makePipeline() {
  const executors = new Map()
  const pipeline = {
    stageExecutor: { executors, register(type, fn) { executors.set(type, fn) } },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor(type, fn) { executors.set(type, fn); return { success: true } },
  }
  const reg = registerCinematicStages(pipeline)
  const get = (type) => executors.get(type)
  return { pipeline, get, reg }
}

describe('cinematic 阶段执行器', () => {
  it('注册全部 4 个自定义阶段类型', () => {
    const { reg, get } = makePipeline()
    expect(reg.success).toBe(true)
    expect(reg.registered).toHaveLength(4)
    for (const type of Object.values(CINEMATIC_STAGE_TYPES)) {
      expect(get(type)).toBeTypeOf('function')
    }
  })

  it('parseProbe 解析 ffprobe 输出', () => {
    const out = 'width=640\nheight=360\navg_frame_rate=24000/1001\nduration=12.000000\n'
    expect(parseProbe(out)).toMatchObject({ width: 640, height: 360, duration: 12 })
  })

  describe('ingest 阶段', () => {
    it('缺少视频输入时报可行动错误', async () => {
      const { get } = makePipeline()
      const result = await get(CINEMATIC_STAGE_TYPES.INGEST)({
        stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要可读的本地视频')
    })
  })

  describe('grade / compose / render 阶段', () => {
    it('grade 依赖 context.ingest', async () => {
      const { get } = makePipeline()
      const result = await get(CINEMATIC_STAGE_TYPES.GRADE)({
        runId: 'r', stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要 context.ingest')
    })

    it('compose 依赖 context.grade', async () => {
      const { get } = makePipeline()
      const result = await get(CINEMATIC_STAGE_TYPES.COMPOSE)({
        runId: 'r', stage: { options: {} }, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要 context.grade')
    })

    it('render 依赖有效的合成产物', async () => {
      const { get } = makePipeline()
      const result = await get(CINEMATIC_STAGE_TYPES.RENDER)({
        runId: 'r', stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要有效的合成产物')
    })

    it('render 上报开始与结构化完成摘要', async () => {
      const outputDir = require('path').join(require('os').tmpdir(), 'story2video', 'cinematic-progress-' + Date.now())
      const inputPath = require('path').join(outputDir, 'composed.mp4')
      require('fs').mkdirSync(outputDir, { recursive: true })
      require('fs').writeFileSync(inputPath, 'video')
      const events = []
      try {
        const { get } = makePipeline()
        const result = await get(CINEMATIC_STAGE_TYPES.RENDER)({
          runId: 'progress-' + Date.now(),
          stage: {},
          params: {},
          context: { compose: { composedPath: inputPath, duration: 6 } },
          onProgress: event => events.push(event),
        })
        expect(result.success).toBe(true)
        expect(events).toEqual([
          expect.objectContaining({ percent: 0, messageKey: 'stageProgress.cinematicRender' }),
          expect.objectContaining({ percent: 100, summaryKey: 'stageProgress.cinematicRenderSummary', detail: { done: 1, total: 1, kind: 'video' } }),
        ])
      } finally {
        require('fs').rmSync(outputDir, { recursive: true, force: true })
      }
    })
  })
})
