// @vitest-environment node
const path = require('path')
const fs = require('fs')
const os = require('os')

vi.mock('./media-tool-paths', () => ({
  findFfmpeg: vi.fn(() => 'ffmpeg'),
  findFfprobe: vi.fn(() => 'ffprobe'),
}))

const {
  registerClipFactoryStages,
  CLIPFACTORY_STAGE_TYPES,
  buildSegments,
  parseSceneTimes,
} = require('./clipfactory-stages')
const mediaToolPaths = require('./media-tool-paths')

function makePipeline() {
  const executors = new Map()
  const pipeline = {
    stageExecutor: { executors, register(type, fn) { executors.set(type, fn) } },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor(type, fn) { executors.set(type, fn); return { success: true } },
  }
  const reg = registerClipFactoryStages(pipeline)
  const get = (type) => executors.get(type)
  return { pipeline, get, reg }
}

describe('clip-factory 阶段执行器', () => {
  it('注册全部 4 个自定义阶段类型', () => {
    const { reg, get } = makePipeline()
    expect(reg.success).toBe(true)
    expect(reg.registered).toHaveLength(4)
    for (const type of Object.values(CLIPFACTORY_STAGE_TYPES)) {
      expect(get(type)).toBeTypeOf('function')
    }
  })

  describe('场景解析', () => {
    it('parseSceneTimes 提取 pts_time', () => {
      const output = 'frame:1 pts:0\nframe:2 pts_time:5.000\nframe:3 pts_time:12.5\n'
      expect(parseSceneTimes(output)).toEqual([5, 12.5])
    })

    it('buildSegments 过滤过短片段并封顶数量与总时长', () => {
      const segments = buildSegments(60, [1, 5, 12, 30])
      // 0→1 为 1s（<2s 被过滤），首段为 1→5
      expect(segments[0]).toMatchObject({ start: 1, end: 5, duration: 4 })
      expect(segments[1].start).toBe(5)
      expect(segments[2].start).toBe(12)
      expect(segments.length).toBeGreaterThanOrEqual(3)
    })

    it('无场景变化时保留整段作为兜底', () => {
      const segments = buildSegments(20, [])
      expect(segments).toHaveLength(1)
      expect(segments[0]).toMatchObject({ start: 0, end: 20, duration: 20 })
    })

    it('总时长超过上限时截断', () => {
      const segments = buildSegments(600, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
      const total = segments.reduce((sum, s) => sum + s.duration, 0)
      expect(total).toBeLessThanOrEqual(60)
      expect(segments.length).toBeLessThanOrEqual(8)
    })
  })

  describe('analyze 阶段', () => {
    it('缺少视频输入时报可行动错误', async () => {
      const { get } = makePipeline()
      const result = await get(CLIPFACTORY_STAGE_TYPES.ANALYZE)({
        stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要可读的本地视频')
    })

    it('不可读的视频路径报可行动错误', async () => {
      const { get } = makePipeline()
      const result = await get(CLIPFACTORY_STAGE_TYPES.ANALYZE)({
        stage: {}, params: { video: 'C:/definitely/not/exists.mp4' }, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要可读的本地视频')
    })
  })

  describe('caption / export 阶段', () => {
    it('caption 依赖 context.extract 并生成片段标题', async () => {
      const { get } = makePipeline()
      const missing = await get(CLIPFACTORY_STAGE_TYPES.CAPTION)({
        stage: {}, params: {}, context: {},
      })
      expect(missing.success).toBe(false)
      const ok = await get(CLIPFACTORY_STAGE_TYPES.CAPTION)({
        stage: {}, params: {},
        context: { extract: { clips: [{ index: 0, path: 'a.mp4' }] } },
      })
      expect(ok.success).toBe(true)
      expect(ok.output.clips[0].title).toBe('精彩片段 1')
    })

    it('export 缺少 concat 列表时报错', async () => {
      const { get } = makePipeline()
      const result = await get(CLIPFACTORY_STAGE_TYPES.EXPORT)({
        runId: 'run_x', stage: {}, params: {}, context: {},
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('需要有效的 concat 列表')
    })
  })
})
