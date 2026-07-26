// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  registerStory2VideoStages,
  STORY2VIDEO_STAGE_TYPES,
  normalizeAssetConcurrency,
} = require('./story2video-stages')
const {
  MAX_SCENES,
  cleanupRunInputDir,
  importUserSelectedMedia,
} = require('./story2video-paths')

afterEach(() => {
  cleanupRunInputDir('run')
})

function makeStageExecutor() {
  const executors = new Map()
  return {
    executors,
    register(type, fn) { executors.set(type, fn) },
  }
}

function makePipeline(assetGenerator) {
  const stageExecutor = makeStageExecutor()
  const pipeline = {
    stageExecutor,
    _assetGenerator: assetGenerator,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerStageExecutor(type, fn) {
      stageExecutor.register(type, fn)
      return { success: true }
    },
  }
  registerStory2VideoStages(pipeline)
  const assetsExecutor = stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS)
  assetsExecutor.domainExecutor = stageExecutor.executors.get(STORY2VIDEO_STAGE_TYPES.DOMAIN_ENRICH)
  return assetsExecutor
}

describe('story2video 资源索引契约', () => {
  it('资源并发值被限制为安全整数范围', () => {
    expect(normalizeAssetConcurrency(Infinity)).toBe(3)
    expect(normalizeAssetConcurrency(0)).toBe(1)
    expect(normalizeAssetConcurrency(2.8)).toBe(2)
    expect(normalizeAssetConcurrency(999)).toBe(8)
  })

  it('历史内容先经过 domain_enrich，输出保留原文并生成可优化的视觉提示词', async () => {
    const fn = makePipeline(null)
    const result = await fn.domainExecutor({
      stage: { options: { contentType: 'general' } },
      params: { contentType: 'history' },
      context: { split: [{ text: '唐朝长安城的灯火照亮宫殿。' }] },
      serviceBus: {},
    })
    expect(result.success).toBe(true)
    expect(result.output.domainEnriched).toBe(true)
    expect(result.output.scenes[0].text).toContain('唐朝')
    expect(result.output.scenes[0].imagePromptSeed).toContain('唐代')
    expect(result.output.scenes[0].prompt).toContain('无文字')
  })

  it('通用内容在 domain_enrich 中透传，不改变原始句子', async () => {
    const fn = makePipeline(null)
    const result = await fn.domainExecutor({
      stage: { options: { contentType: 'general' } },
      params: {},
      context: { split: [{ text: '普通内容。' }] },
      serviceBus: {},
    })
    expect(result.success).toBe(true)
    expect(result.output.domainEnriched).toBe(false)
    expect(result.output.scenes).toEqual([{ text: '普通内容。' }])
  })

  it('任一 scene 的图片或音频失败时默认阻断，不能生成错位清单', async () => {
    const fn = makePipeline({
      generateImage: vi.fn(async (_prompt, { index }) => index === 1
        ? { code: -1, message: 'image failed' }
        : { code: 0, data: { path: `image-${index}.png` } }),
      generateTTS: vi.fn(async (_text, { index }) => ({
        code: 0,
        data: { path: `audio-${index}.mp3`, duration: 2 },
      })),
    })

    const result = await fn({
      stage: { options: { concurrency: 2 } },
      params: {},
      context: {
        split: [{ text: '一' }, { text: '二' }, { text: '三' }],
        optimize: ['p1', 'p2', 'p3'],
      },
      serviceBus: {},
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/scene.*失败|asset.*failed/i)
  })

  it('显式允许部分资源时只保留同 index 的成对 scene', async () => {
    const fn = makePipeline({
      generateImage: vi.fn(async (_prompt, { index }) => index === 1
        ? { code: -1, message: 'image failed' }
        : { code: 0, data: { path: `image-${index}.png` } }),
      generateTTS: vi.fn(async (_text, { index }) => ({
        code: 0,
        data: { path: `audio-${index}.mp3`, duration: 2 },
      })),
    })

    const result = await fn({
      stage: { options: { concurrency: 2 } },
      params: { allowPartialAssets: true },
      context: {
        split: [{ text: '一' }, { text: '二' }, { text: '三' }],
        optimize: ['p1', 'p2', 'p3'],
      },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(result.output.scenes).toEqual([
      expect.objectContaining({ index: 0, imagePath: 'image-0.png', audioPath: 'audio-0.mp3' }),
      expect.objectContaining({ index: 2, imagePath: 'image-2.png', audioPath: 'audio-2.mp3' }),
    ])
    expect(result.output.scenes).not.toContainEqual(expect.objectContaining({ index: 1 }))
    expect(result.output.failures).toEqual({
      images: [expect.objectContaining({ index: 1, error: 'image failed' })],
      audio: [],
    })
  })

  it('图片模式直接摄取用户图片，不调用图片生成器并保持 scene index', async () => {
    const assetGenerator = {
      generateImage: vi.fn(),
      generateTTS: vi.fn(async (_text, { index }) => ({
        code: 0,
        data: { path: `audio-${index}.mp3`, duration: 2 },
      })),
    }
    const fn = makePipeline(assetGenerator)
    const imageData = 'data:image/png;base64,aW1hZ2U='

    const result = await fn({
      stage: { options: { concurrency: 1 } },
      params: { inputMode: 'images', images: [imageData] },
      context: {
        split: [{ text: '图片 1' }],
        optimize: ['图片 1 的视觉提示词'],
      },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(assetGenerator.generateImage).not.toHaveBeenCalled()
    expect(result.output.scenes).toHaveLength(1)
    expect(result.output.scenes[0]).toMatchObject({ index: 0, audioPath: 'audio-0.mp3' })
    expect(result.output.scenes[0].imagePath).toMatch(/story2video[\\/]inputs[\\/].*image_0000\.png$/)
  })

  it('音频模式摄取用户音频并跳过 TTS，保留逐段索引和声明时长', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-audio-input-'))
    const audioPath = path.join(root, 'narration.mp3')
    fs.writeFileSync(audioPath, Buffer.from('audio'))
    const imported = importUserSelectedMedia(audioPath, 'audio')
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => ({
        code: 0,
        data: { path: path.join(root, 'image-' + index + '.png') },
      })),
      generateTTS: vi.fn(),
    }
    const fn = makePipeline(assetGenerator)

    try {
      const result = await fn({
        stage: { options: { concurrency: 1 } },
        params: {
          inputMode: 'audio',
          audio: [{ name: 'narration.mp3', path: imported.path, duration: 1.25 }],
        },
        context: {
          split: [{ text: 'narration.mp3' }],
          optimize: ['narration 的画面'],
        },
        serviceBus: {},
      })

      expect(result.success).toBe(true)
      expect(assetGenerator.generateTTS).not.toHaveBeenCalled()
      expect(result.output.scenes).toEqual([
        expect.objectContaining({
          index: 0,
          audioPath: fs.realpathSync.native(imported.path),
          duration: 1.25,
        }),
      ])
    } finally {
      fs.rmSync(imported.path, { force: true })
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('音频模式拒绝未导入到 Story2Video 受控目录的路径', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-untrusted-audio-'))
    const audioPath = path.join(root, 'narration.mp3')
    fs.writeFileSync(audioPath, Buffer.from('audio'))
    const assetGenerator = {
      generateImage: vi.fn(async () => ({ code: 0, data: { path: 'image-0.png' } })),
      generateTTS: vi.fn(),
    }
    const fn = makePipeline(assetGenerator)

    try {
      const result = await fn({
        stage: { options: { concurrency: 1 } },
        params: {
          inputMode: 'audio',
          audio: [{ name: 'narration.mp3', path: audioPath, duration: 1.25 }],
        },
        context: {
          split: [{ text: 'narration.mp3' }],
          optimize: ['narration 的画面'],
        },
        serviceBus: {},
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/audio|资源|asset/i)
      expect(assetGenerator.generateTTS).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('图片和 TTS 两类资源同时开始生成，并接受直接 path 响应', async () => {
    let release
    const gate = new Promise(resolve => { release = resolve })
    const assetGenerator = {
      generateImage: vi.fn(async (_prompt, { index }) => {
        await gate
        return { path: `image-${index}.png` }
      }),
      generateTTS: vi.fn(async (_text, { index }) => {
        await gate
        return { data: { path: `audio-${index}.mp3`, duration: 2 } }
      }),
    }
    const fn = makePipeline(assetGenerator)
    const pending = fn({
      stage: { options: { concurrency: 999 } },
      params: {},
      context: { split: [{ text: '一' }], optimize: ['p1'] },
      serviceBus: {},
    })

    await vi.waitFor(() => {
      expect(assetGenerator.generateImage).toHaveBeenCalledTimes(1)
      expect(assetGenerator.generateTTS).toHaveBeenCalledTimes(1)
    })
    release()
    const result = await pending
    expect(result.success).toBe(true)
    expect(result.output.scenes[0]).toMatchObject({
      imagePath: 'image-0.png',
      audioPath: 'audio-0.mp3',
    })
  })

  it('保留真实 provider 与离线降级资源的来源，供项目交付时明确提示', async () => {
    const fn = makePipeline({
      generateImage: vi.fn(async () => ({
        code: 0,
        data: {
          path: 'image-0.png',
          provider: 'local-diffusion',
          source: 'model-provider',
          degraded: false,
        },
      })),
      generateTTS: vi.fn(async () => ({
        code: 0,
        data: {
          path: 'audio-0.mp3',
          duration: 2,
          source: 'ffmpeg-silence',
          degraded: true,
        },
      })),
    })

    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: [{ text: '一' }], optimize: ['p1'] },
      serviceBus: {},
    })

    expect(result.success).toBe(true)
    expect(result.output.scenes[0]).toMatchObject({
      imageMeta: { source: 'model-provider', degraded: false },
      audioMeta: { source: 'ffmpeg-silence', degraded: true },
    })
    expect(result.output.stats).toMatchObject({ degradedImages: 0, degradedTts: 1 })
  })

  it('超过最大场景数时在生成资源前失败', async () => {
    const assetGenerator = {
      generateImage: vi.fn(),
      generateTTS: vi.fn(),
    }
    const fn = makePipeline(assetGenerator)
    const scenes = Array.from({ length: MAX_SCENES + 1 }, (_, index) => ({ text: String(index) }))

    const result = await fn({
      stage: { options: {} },
      params: {},
      context: { split: scenes, optimize: scenes.map(scene => scene.text) },
      serviceBus: {},
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/scene|场景|limit/i)
    expect(assetGenerator.generateImage).not.toHaveBeenCalled()
    expect(assetGenerator.generateTTS).not.toHaveBeenCalled()
  })
})
