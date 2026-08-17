// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')
const { promisify } = require('util')

const {
  registerPodcastRepurposeStages,
  PODCAST_STAGE_TYPES,
  buildPodcastSegments,
} = require('./podcast-repurpose-stages')
const { findFfmpeg, findFfprobe } = require('./media-tool-paths')

// CI Linux 自托管 runner 无捆绑 ffmpeg/ffprobe（见 media-tool 门禁）：真实工具用例在工具缺失时跳过
const ffmpegAvailable = Boolean(findFfmpeg())
const ffprobeAvailable = Boolean(findFfprobe())

const execFileAsync = promisify(execFile)

function makeStageExecutor() {
  const executors = new Map()
  return { executors, register(type, fn) { executors.set(type, fn) } }
}

function makePipeline(assetGenerator) {
  const stageExecutor = makeStageExecutor()
  const pipeline = {
    stageExecutor,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor(type, fn) { stageExecutor.register(type, fn); return { success: true } },
  }
  if (assetGenerator) pipeline._assetGenerator = assetGenerator
  const reg = registerPodcastRepurposeStages(pipeline)
  const get = (type) => stageExecutor.executors.get(type)
  return { pipeline, get, reg }
}

async function makeWav(seconds = 2) {
  // resolveReadableMediaFile 只允许受控媒体根目录（os.tmpdir()/story2video），测试 wav 必须落在其中
  const baseDir = path.join(os.tmpdir(), 'story2video')
  fs.mkdirSync(baseDir, { recursive: true })
  const file = path.join(baseDir, 'podcast-test-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.wav')
  await execFileAsync(findFfmpeg(), ['-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', String(seconds), '-y', file])
  return file
}

function makeImages(count) {
  return Array.from({ length: count }, (_, i) => ({ index: i, success: true, path: path.join(os.tmpdir(), 'img_' + i + '.png') }))
}

describe('podcast-repurpose 阶段执行器', () => {
  it('注册全部 3 个自定义阶段类型', () => {
    const { reg, get } = makePipeline()
    expect(reg.success).toBe(true)
    expect(reg.registered).toHaveLength(3)
    for (const type of Object.values(PODCAST_STAGE_TYPES)) {
      expect(get(type)).toBeTypeOf('function')
    }
  })

  describe('buildPodcastSegments', () => {
    it('按行分句并均分时长', () => {
      const segments = buildPodcastSegments('第一句。\n第二句。\n第三句。', 9)
      expect(segments).toHaveLength(3)
      expect(segments[0]).toMatchObject({ text: '第一句。', start: 0, end: 3 })
      expect(segments[2].end).toBe(9)
    })

    it('空文案返回空数组；空时长回退 6 秒', () => {
      expect(buildPodcastSegments('', 10)).toHaveLength(0)
      expect(buildPodcastSegments('一段话', 0)).toHaveLength(1)
    })
  })

  describe('analyze 阶段', () => {
    it('缺少音频时失败', async () => {
      const { get } = makePipeline()
      const result = await get(PODCAST_STAGE_TYPES.ANALYZE)({ params: {} })
      expect(result.success).toBe(false)
      expect(result.error).toContain('音频')
    })

    it('音频不可读时失败（校验先于文案）', async () => {
      const { get } = makePipeline()
      const result = await get(PODCAST_STAGE_TYPES.ANALYZE)({ params: { audio: 'C:/no-such.wav', transcript: '文案' } })
      expect(result.success).toBe(false)
    })

    it.skipIf(!ffprobeAvailable)('真实 wav + 文案 → 时长与时间段', async () => {
      const wav = await makeWav(2)
      try {
        const { get } = makePipeline()
        const result = await get(PODCAST_STAGE_TYPES.ANALYZE)({ params: { audio: wav, transcript: '第一句。\n第二句。' } })
        expect(result.success).toBe(true)
        // CI（Windows 8.3 短路径）下 resolveReadableMediaFile 返回 canonical 路径，
        // 必须对期望值与实际值同时做 realpathSync.native 比较
        expect(fs.realpathSync.native(result.output.audioPath)).toBe(fs.realpathSync.native(wav))
        expect(result.output.duration).toBeGreaterThan(0)
        expect(result.output.segments).toHaveLength(2)
        expect(result.output.segments[0].start).toBe(0)
        expect(result.output.segments[1].end).toBeCloseTo(2, 1)
      } finally {
        fs.rmSync(wav, { force: true })
      }
    })

    it.skipIf(!ffprobeAvailable)('无文案且无语音识别服务时失败', async () => {
      const wav = await makeWav(1)
      try {
        const { get } = makePipeline()
        const result = await get(PODCAST_STAGE_TYPES.ANALYZE)({ params: { audio: wav } })
        expect(result.success).toBe(false)
        expect(result.error).toContain('文案')
      } finally {
        fs.rmSync(wav, { force: true })
      }
    })
  })

  describe('visualize 阶段', () => {
    it('为每段文案生成配图并透传 analyze 数据', async () => {
      const generateImage = vi.fn(async () => ({ code: 0, data: { path: 'C:/img/0.png' } }))
      const { get } = makePipeline({ generateImage })
      const events = []
      const result = await get(PODCAST_STAGE_TYPES.VISUALIZE)({
        runId: 'run-p1',
        stage: { options: {} },
        params: { imageProvider: 'minimax-image' },
        context: {
          analyze: {
            audioPath: 'C:/a.mp3', duration: 10,
            segments: [{ index: 0, text: '第一段', start: 0, end: 5 }, { index: 1, text: '第二段', start: 5, end: 10 }],
          },
        },
        onProgress: event => events.push(event),
      })
      expect(result.success).toBe(true)
      expect(generateImage).toHaveBeenCalledTimes(2)
      expect(generateImage.mock.calls[0][0]).toBe('第一段')
      expect(generateImage.mock.calls[0][1]).toMatchObject({ image_provider: 'minimax-image', index: 0 })
      expect(result.output.images).toHaveLength(2)
      expect(result.output.images[1].path).toBe('C:/img/0.png')
      expect(result.output.audioPath).toBe('C:/a.mp3')
      expect(events).toEqual([
        expect.objectContaining({ percent: 50, messageKey: 'stageProgress.podcastVisualize', detail: { done: 1, total: 2, kind: 'segment' } }),
        expect.objectContaining({ percent: 100, messageKey: 'stageProgress.podcastVisualize', detail: { done: 2, total: 2, kind: 'segment' } }),
        expect.objectContaining({ percent: 100, summaryKey: 'stageProgress.podcastSummary', summaryParams: { done: 2, total: 2 } }),
      ])
    })

    it('缺少 context.analyze.segments 时失败', async () => {
      const { get } = makePipeline({ generateImage: vi.fn() })
      const result = await get(PODCAST_STAGE_TYPES.VISUALIZE)({ runId: 'r', stage: {}, params: {}, context: {} })
      expect(result.success).toBe(false)
      expect(result.error).toContain('segments')
    })
  })

  describe('assemble 阶段', () => {
    it.skipIf(!ffmpegAvailable)('真实音频切分并组装场景', async () => {
      const wav = await makeWav(2)
      try {
        const { get } = makePipeline()
        const segments = [
          { index: 0, text: '第一段', start: 0, end: 1 },
          { index: 1, text: '第二段', start: 1, end: 2 },
        ]
        const images = makeImages(2)
        const result = await get(PODCAST_STAGE_TYPES.ASSEMBLE)({
          runId: 'run-assemble-' + Date.now(),
          context: { visualize: { audioPath: wav, segments, images } },
        })
        expect(result.success).toBe(true)
        expect(result.output.scenes).toHaveLength(2)
        for (const scene of result.output.scenes) {
          expect(scene.imagePath).toBeTruthy()
          expect(fs.existsSync(scene.audioPath)).toBe(true)
          expect(scene.duration).toBeGreaterThan(0)
        }
        // 清理切分产物目录
        const dir = path.dirname(result.output.scenes[0].audioPath)
        fs.rmSync(dir, { recursive: true, force: true })
      } finally {
        fs.rmSync(wav, { force: true })
      }
    })

    it('缺少 context.visualize 时失败', async () => {
      const { get } = makePipeline()
      const result = await get(PODCAST_STAGE_TYPES.ASSEMBLE)({ runId: 'r', context: {} })
      expect(result.success).toBe(false)
      expect(result.error).toContain('visualize')
    })
  })
})

