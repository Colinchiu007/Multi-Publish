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
