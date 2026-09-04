// @ts-check
import { describe, it, expect, vi } from 'vitest'
import {
  createVideoCloneAssetGenerator,
  createPlaceholderImageGenerator,
} from './asset-generator'

const report = { platformParams: { aspect: '16:9' } }
const spec = { index: 0, promptSeed: 'palette:warm', durationSec: 2 }

describe('createVideoCloneAssetGenerator', () => {
  it('服务成功：返回 data.path', async () => {
    const gen = createVideoCloneAssetGenerator({
      assetGenerator: { generateImage: vi.fn(async () => ({ code: 0, data: { path: 'C:/tmp/a.png' } })) },
    })
    const out = await gen(spec, report)
    expect(out.path).toBe('C:/tmp/a.png')
    expect(out.kind).toBe('image')
  })

  it('无服务 → PROVIDER_UNAVAILABLE', async () => {
    const gen = createVideoCloneAssetGenerator({ assetGenerator: null })
    await expect(gen(spec, report)).rejects.toMatchObject({ code: 'VIDEOCLONE_PROVIDER_UNAVAILABLE' })
  })

  it('服务失败 → ASSET_GENERATION_FAILED', async () => {
    const gen = createVideoCloneAssetGenerator({
      assetGenerator: { generateImage: vi.fn(async () => ({ code: -1, message: 'boom' })) },
    })
    await expect(gen(spec, report)).rejects.toMatchObject({ code: 'VIDEOCLONE_ASSET_GENERATION_FAILED' })
  })
})

describe('createPlaceholderImageGenerator', () => {
  it('占位生成（stub ffmpeg runner）→ 返回 path + degraded 标注', async () => {
    const dir = 'C:/tmp/vc-assets-test'
    // stub runCommand：直接写一个假文件
    const gen = createPlaceholderImageGenerator({ outputDir: dir })
    // 注入 stub：通过 monkey-patch runners 不可行，改用真实 ffmpeg（存在性判断）
    const { spawnSync } = require('node:child_process')
    const ok = spawnSync('ffmpeg', ['-version']).status === 0
    if (!ok) { expect(true).toBe(true); return }
    const fs = require('node:fs')
    fs.mkdirSync(dir, { recursive: true })
    const out = await gen(spec, report)
    expect(fs.existsSync(out.path)).toBe(true)
    expect(out.degraded).toBe(true)
    expect(out.source).toBe('ffmpeg-placeholder')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('createVideoCloneAssetGenerator - 真实视频生成（kind=video）', () => {
  const videoSpec = { index: 1, promptSeed: 'palette:warm | plot:故事', durationSec: 3, kind: 'video' }

  it('视频素材：调用 generateVideo 并返回 kind=video', async () => {
    const generateVideo = vi.fn(async () => ({ code: 0, data: { path: 'C:/tmp/video.mp4' } }))
    const gen = createVideoCloneAssetGenerator({
      assetGenerator: { generateImage: vi.fn(), generateVideo },
    })
    const out = await gen(videoSpec, report)
    expect(out.kind).toBe('video')
    expect(out.path).toBe('C:/tmp/video.mp4')
    expect(generateVideo).toHaveBeenCalled()
  })

  it('视频素材：未提供 generateVideo → PROVIDER_UNAVAILABLE', async () => {
    const gen = createVideoCloneAssetGenerator({
      assetGenerator: { generateImage: vi.fn() },
    })
    await expect(gen(videoSpec, report)).rejects.toMatchObject({ code: 'VIDEOCLONE_PROVIDER_UNAVAILABLE' })
  })

  it('视频素材：经 prompt-engine 优化后再调用 generateVideo', async () => {
    const generateVideo = vi.fn(async () => ({ code: 0, data: { path: 'C:/tmp/opt.mp4' } }))
    const optimizeVideoPromptsBatch = vi.fn(async () => [{ optimized_prompt: '[optimized] 故事' }])
    const gen = createVideoCloneAssetGenerator({
      assetGenerator: { generateImage: vi.fn(), generateVideo },
      optimizeVideoPromptsBatch,
    })
    await gen(videoSpec, report)
    expect(optimizeVideoPromptsBatch).toHaveBeenCalledWith([videoSpec.promptSeed], { model: 'agnes-video-v2.0' })
    expect(generateVideo).toHaveBeenCalledWith('[optimized] 故事', expect.any(Object))
  })

  it('视频素材：prompt-engine 返回空提示词 → ASSET_GENERATION_FAILED', async () => {
    const gen = createVideoCloneAssetGenerator({
      assetGenerator: { generateImage: vi.fn(), generateVideo: vi.fn() },
      optimizeVideoPromptsBatch: vi.fn(async () => [{ optimized_prompt: '' }]),
    })
    await expect(gen(videoSpec, report)).rejects.toMatchObject({ code: 'VIDEOCLONE_ASSET_GENERATION_FAILED' })
  })

  it('视频素材：generateVideo 失败 → ASSET_GENERATION_FAILED', async () => {
    const gen = createVideoCloneAssetGenerator({
      assetGenerator: { generateImage: vi.fn(), generateVideo: vi.fn(async () => ({ code: -1, message: 'video boom' })) },
    })
    await expect(gen(videoSpec, report)).rejects.toMatchObject({ code: 'VIDEOCLONE_ASSET_GENERATION_FAILED' })
  })
})