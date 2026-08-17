// @vitest-environment node
const path = require('path')
const fs = require('fs')
const os = require('os')
const childProcess = require('child_process')

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

    it('buildSegments 读取 options 中的 maxSegments/minSegmentSeconds/maxTotalSeconds（选项接线回归）', () => {
      // maxSegments=2 只保留前 2 段
      const s2 = buildSegments(60, [1, 5, 12], { maxSegments: 2 })
      expect(s2).toHaveLength(2)
      // minSegmentSeconds=8 过滤掉所有 <8s 的片段（场景 [1,5,12] → 段长 1,4,7,48 → 仅末段 ≥8）
      const s3 = buildSegments(60, [1, 5, 12], { minSegmentSeconds: 8 })
      expect(s3.length).toBeGreaterThanOrEqual(1)
      expect(s3[0].duration).toBeGreaterThanOrEqual(8)
      // maxTotalSeconds=6 截断总时长
      const s4 = buildSegments(60, [1, 5, 12], { maxTotalSeconds: 6 })
      let total = s4.reduce((sum, seg) => sum + seg.duration, 0)
      expect(total).toBeLessThanOrEqual(6)
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
    it('extract 按片段上报明细并输出完成摘要', async () => {
      const events = []
      const { get } = makePipeline()
      const outputDir = path.join(os.tmpdir(), 'story2video', 'clipfactory-progress-' + Date.now())
      const inputPath = path.join(outputDir, 'input.mp4')
      fs.mkdirSync(outputDir, { recursive: true })
      const execFileSpy = vi.spyOn(childProcess, 'execFile').mockImplementation((binary, args, options, callback) => {
        callback(null, '', '')
      })
      try {
        const result = await get(CLIPFACTORY_STAGE_TYPES.EXTRACT)({
          runId: 'progress-' + Date.now(),
          stage: {},
          params: {},
          context: {
            analyze: {
              inputPath,
              segments: [
                { index: 0, start: 0, duration: 1 },
                { index: 1, start: 1, duration: 1 },
              ],
            },
          },
          onProgress: event => events.push(event),
        })
        expect(result.success).toBe(true)
        expect(events).toHaveLength(3)
        expect(events.slice(0, 2)).toEqual([
          expect.objectContaining({ percent: 50, messageKey: 'stageProgress.clipfactoryExtract', detail: { done: 1, total: 2, kind: 'segment' } }),
          expect.objectContaining({ percent: 100, messageKey: 'stageProgress.clipfactoryExtract', detail: { done: 2, total: 2, kind: 'segment' } }),
        ])
        expect(events[2]).toMatchObject({ percent: 100, summaryKey: 'stageProgress.clipfactoryExtractSummary', summaryParams: { done: 2, total: 2 } })
      } finally {
        execFileSpy.mockRestore()
        fs.rmSync(outputDir, { recursive: true, force: true })
      }
    })

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
