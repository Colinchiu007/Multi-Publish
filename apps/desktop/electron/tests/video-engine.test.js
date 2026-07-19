import { beforeEach, describe, expect, it, vi } from 'vitest'

const { VideoEngine } = require('../services/video-engine')

describe('VideoEngine 能力清单', () => {
  let engine

  beforeEach(() => {
    engine = new VideoEngine()
  })

  it('导出 VideoEngine 类', () => {
    expect(VideoEngine).toBeTypeOf('function')
  })

  it('返回包含 green-screen 的处理类型副本', () => {
    const types = engine.listProcessTypes()

    expect(types).toContain('green-screen')
    types.push('mutated')
    expect(engine.listProcessTypes()).not.toContain('mutated')
  })

  it('返回 scene-detect 和 transcript 分析类型', () => {
    expect(engine.listAnalyzeTypes()).toEqual(expect.arrayContaining([
      'scene-detect',
      'transcript',
    ]))
  })

  it('返回结构完整的素材源数组', () => {
    const sources = engine.listStockSources()

    expect(sources.length).toBeGreaterThan(5)
    expect(sources.every((source) => (
      typeof source.id === 'string'
      && typeof source.name === 'string'
      && typeof source.type === 'string'
    ))).toBe(true)
  })

  it('getStatus 返回 FFmpeg 布尔状态和能力列表', () => {
    const ffmpegCheck = vi.spyOn(engine, '_checkFfmpeg').mockReturnValue(false)

    expect(engine.getStatus()).toEqual({
      ffmpegAvailable: false,
      processTypes: expect.arrayContaining(['green-screen']),
      analyzeTypes: expect.arrayContaining(['scene-detect']),
    })
    expect(ffmpegCheck).toHaveBeenCalledOnce()
  })
})
