import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { VideoEngine } = require('../services/video-engine')

describe('VideoEngine 能力清单', () => {
  let engine

  beforeEach(() => {
    engine = new VideoEngine()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('导出 VideoEngine 类', () => {
    expect(VideoEngine).toBeTypeOf('function')
  })

  it('只公布已经接通真实后端的处理类型', () => {
    const types = engine.listProcessTypes()

    expect(types).toEqual(['trim'])
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
      processTypes: ['trim'],
      analyzeTypes: expect.arrayContaining(['scene-detect']),
    })
    expect(ffmpegCheck).toHaveBeenCalledOnce()
  })

  it('远程 CI 禁用原生媒体工具时不启动宿主 FFmpeg', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('SKIP_NATIVE_MEDIA_TOOL_TESTS', '1')
    const childProcess = require('child_process')
    const spawnSync = vi.spyOn(childProcess, 'spawnSync')

    expect(engine._checkFfmpeg()).toBe(false)
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('使用统一解析器返回的 FFmpeg 路径执行可用性检查', () => {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-engine-ffmpeg-'))
    const executable = path.join(root, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
    fs.writeFileSync(executable, 'binary')
    vi.stubEnv('SKIP_NATIVE_MEDIA_TOOL_TESTS', '0')
    vi.stubEnv('FFMPEG_PATH', executable)
    const childProcess = require('child_process')
    const spawnSync = vi.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0 })

    try {
      expect(engine._checkFfmpeg()).toBe(true)
      expect(spawnSync).toHaveBeenCalledWith(executable, ['-version'], { timeout: 3000 })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('裁剪时校验输入和时间范围，并忽略 renderer 伪造的输出路径', async () => {
    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-engine-trim-'))
    const input = path.join(root, 'video.mp4')
    fs.writeFileSync(input, 'video')
    const requestBackend = vi.fn(async (_method, _path, body) => ({ success: true, output: body.params.output_path }))
    vi.spyOn(engine, '_getPythonBridge').mockReturnValue({ isRunning: () => true, requestBackend })

    const result = await engine.process('trim', {
      input_path: input,
      output_path: 'C:/Windows/System32/evil.mp4',
      start_seconds: 1,
      end_seconds: 3,
      codec: 'copy',
    })
    const params = requestBackend.mock.calls[0][2].params

    expect(params.input_path).toBe(fs.realpathSync.native(input))
    expect(params.output_path).toMatch(new RegExp('^' + root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    expect(params.output_path).toMatch(/_trim_.*\.mp4$/)
    expect(params.codec).toBe('libx264')
    expect(result.success).toBe(true)
    await expect(engine.process('trim', {
      input_path: input,
      start_seconds: 3,
      end_seconds: 1,
    })).rejects.toThrow(/时间/)
    fs.rmSync(root, { recursive: true, force: true })
  })
})
