// @vitest-environment node
// @ts-check
/**
 * story2video-stages-aspect-ratio.test.js — 画幅兜底推导行为锁（2026-10-06 回归）
 *
 * ## 为什么单独一个文件
 *
 * 本 issue（项目 mur2tzc8_ru1r：720x1280 竖屏成片配横图）有两道防线：
 *   1. 适配器层：所有图片适配器都消费 `aspect_ratio`（见 image-aspect-ratio-portrait-regression.test.js）
 *   2. **流水线层（本文件）**：即使渲染层漏传 aspectRatio，generate_assets 阶段也必须
 *      **按输出分辨率推导画幅**，而不是写死 '16:9'。
 *
 * 防线 1 治「适配器不听」，防线 2 治「上游没传」。两道都要在——只修一道，下一个
 * 漏传画幅的调用方（或升级滞后的客户端）就会让 bug 原样复现。
 *
 * 反证纪律：把 resolveAspectRatio 的中间「按分辨率推导」一跳删掉（即回到
 * `params.aspectRatio || stage.options?.aspectRatio || '16:9'`），本文件立即变红。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const {
  registerStory2VideoStages,
  STORY2VIDEO_STAGE_TYPES,
} = require('./story2video-stages')
const { deriveStory2VideoAspectRatio } = require('./story2video-text-config')
const { cleanupRunInputDir, STORY2VIDEO_TEMP_DIR } = require('./story2video-paths')
const fs = require('fs')

fs.mkdirSync(STORY2VIDEO_TEMP_DIR, { recursive: true })

/**
 * 跑一次 generate_assets，返回 generateImage 收到的第一个 opts。
 * @returns {Promise<object|null>}
 */
async function captureImageOpts({ params, stageOptions = {} }) {
  const generateImage = vi.fn(async (_prompt, opts) => ({
    code: 0,
    data: { path: 'image-' + opts.index + '.png' },
  }))
  const assetGenerator = {
    generateImage,
    generateTTS: vi.fn(async (_text, { index }) => ({
      code: 0,
      data: { path: 'audio-' + index + '.mp3', duration: 2 },
    })),
  }
  const stageExecutor = new Map()
  const pipeline = {
    stageExecutor: {
      executors: stageExecutor,
      register(type, fn) { stageExecutor.set(type, fn) },
    },
    _assetGenerator: assetGenerator,
    aiGenerator: null,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), notify: vi.fn() },
    registerStageExecutor(type, fn) {
      stageExecutor.set(type, fn)
      return { success: true }
    },
  }
  registerStory2VideoStages(pipeline)
  const fn = stageExecutor.get(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS)
  fn.optimizeExecutor = stageExecutor.get(STORY2VIDEO_STAGE_TYPES.OPTIMIZE)
  fn.sceneContextExecutor = stageExecutor.get(STORY2VIDEO_STAGE_TYPES.SCENE_CONTEXT)
  fn.finalizeAssetsExecutor = stageExecutor.get(STORY2VIDEO_STAGE_TYPES.FINALIZE_ASSETS)

  await fn({
    stage: { options: { concurrency: 1, ...stageOptions } },
    params,
    context: {
      split: [{ text: '第一段' }],
      optimize: ['第一段的视觉提示词'],
    },
    serviceBus: {},
  })
  const call = generateImage.mock.calls[0]
  return call ? call[1] : null
}

describe('deriveStory2VideoAspectRatio — 由输出分辨率推导画幅（单一真源）', () => {
  it.each([
    ['720x1280', '9:16'],
    ['1080x1920', '9:16'],
    ['1080x1440', '3:4'],
    ['1080x1080', '1:1'],
    ['1280x720', '16:9'],
    ['1920x1080', '16:9'],
    ['3840x2160', '16:9'],
  ])('%s → %s', (resolution, expected) => {
    expect(deriveStory2VideoAspectRatio(resolution)).toBe(expected)
  })

  it('分辨率缺失/非法返回 null（由调用方决定兜底，不臆造画幅）', () => {
    expect(deriveStory2VideoAspectRatio(undefined)).toBeNull()
    expect(deriveStory2VideoAspectRatio(null)).toBeNull()
    expect(deriveStory2VideoAspectRatio('')).toBeNull()
    expect(deriveStory2VideoAspectRatio('huge')).toBeNull()
  })
})

describe('generate_assets 画幅兜底：漏传 aspectRatio 时按输出分辨率推导（2026-10-06 回归）', () => {
  afterEach(() => {
    cleanupRunInputDir('run')
  })

  it('resolution=720x1280 且未传 aspectRatio → 仍按 9:16 出竖图（修复前恒为 16:9 横图）', async () => {
    const opts = await captureImageOpts({ params: { resolution: '720x1280' } })
    expect(opts).toBeTruthy()
    expect(opts.aspect_ratio).toBe('9:16')
  })

  it('resolution=1080x1440 → 3:4', async () => {
    const opts = await captureImageOpts({ params: { resolution: '1080x1440' } })
    expect(opts.aspect_ratio).toBe('3:4')
  })

  it('resolution=1920x1080 → 16:9（横屏行为不变）', async () => {
    const opts = await captureImageOpts({ params: { resolution: '1920x1080' } })
    expect(opts.aspect_ratio).toBe('16:9')
  })

  it('stage.options.resolution 同样参与推导（渲染层只写 stageOptions 的情形）', async () => {
    const opts = await captureImageOpts({
      params: {},
      stageOptions: { resolution: '720x1280' },
    })
    expect(opts.aspect_ratio).toBe('9:16')
  })

  it('显式 params.aspectRatio 优先级最高（不做任何改写）', async () => {
    const opts = await captureImageOpts({
      params: { resolution: '1920x1080', aspectRatio: '9:16' },
    })
    expect(opts.aspect_ratio).toBe('9:16')
  })

  it('stage.options.aspectRatio 次于 params（既有优先级不变）', async () => {
    const opts = await captureImageOpts({
      params: {},
      stageOptions: { aspectRatio: '3:4' },
    })
    expect(opts.aspect_ratio).toBe('3:4')
  })

  it('分辨率与画幅都缺时维持 16:9 历史兜底（不改变无信息场景的行为）', async () => {
    const opts = await captureImageOpts({ params: {} })
    expect(opts.aspect_ratio).toBe('16:9')
  })
})
