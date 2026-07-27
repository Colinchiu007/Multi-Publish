// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { createHash } = require('crypto')
const {
  REQUIRED_ENCODERS,
  REQUIRED_FILTERS,
  assertFfmpegCapabilities,
  assertSourceIntegrity,
  resolveSources,
  stageMediaTools,
} = require('../../scripts/stage-media-tools')

const skipNativeMediaTests = process.env.NODE_ENV === 'test' &&
  process.env.SKIP_NATIVE_MEDIA_TOOL_TESTS === '1'

describe('媒体工具打包 staging', () => {
  let root

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-media-tools-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function createSource(name, content = name) {
    const target = path.join(root, 'source', name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
    return target
  }

  function createCompleteSources() {
    const ffmpegPath = createSource('ffmpeg.exe', 'ffmpeg')
    const ffprobePath = createSource('ffprobe.exe', 'ffprobe')
    const licensePath = createSource('ffmpeg.exe.LICENSE', 'GPL notice')
    const wrapperLicensePath = createSource('wrapper.LICENSE', 'BSD notice')
    const packageReadmePath = createSource('package.README.md', 'build provenance')
    const noticePath = createSource('THIRD-PARTY-NOTICES.md', 'distribution notice')
    const gplTextPath = createSource('GPL-3.0.txt', 'GPL version 3 text')
    return {
      ffmpegPath,
      ffprobePath,
      licensePath,
      wrapperLicensePath,
      packageReadmePath,
      noticePath,
      gplTextPath,
    }
  }

  function createAssetLock(sources, platform = 'win32', arch = 'x64') {
    const entry = {}
    for (const tool of ['ffmpeg', 'ffprobe']) {
      const source = sources[tool + 'Path']
      entry[tool] = {
        size: fs.statSync(source).size,
        sha256: createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
      }
    }
    return { assets: { [platform + '-' + arch]: entry } }
  }

  it('复制当前平台二进制和全部许可证材料到独立资源目录', () => {
    const sources = createCompleteSources()
    const outputDir = path.join(root, 'output')

    const result = stageMediaTools({
      outputDir,
      platform: 'win32',
      arch: 'x64',
      hostPlatform: 'win32',
      hostArch: 'x64',
      sources,
      verify: false,
    })

    expect(fs.readFileSync(result.ffmpegPath, 'utf8')).toBe('ffmpeg')
    expect(fs.readFileSync(result.ffprobePath, 'utf8')).toBe('ffprobe')
    expect(fs.readFileSync(path.join(outputDir, 'FFMPEG-LICENSE.txt'), 'utf8')).toBe('GPL notice')
    expect(fs.readFileSync(path.join(outputDir, 'FFMPEG-WRAPPER-LICENSE.txt'), 'utf8')).toBe('BSD notice')
    expect(fs.readFileSync(path.join(outputDir, 'FFMPEG-PACKAGE-README.md'), 'utf8')).toBe('build provenance')
    expect(fs.readFileSync(path.join(outputDir, 'THIRD-PARTY-NOTICES.md'), 'utf8')).toBe('distribution notice')
    expect(fs.readFileSync(path.join(outputDir, 'GPL-3.0.txt'), 'utf8')).toBe('GPL version 3 text')
  })

  it.each([
    ['ffmpeg', 'ffmpegPath'],
    ['ffprobe', 'ffprobePath'],
  ])('缺少 %s 二进制时失败关闭', (label, missingKey) => {
    const sources = createCompleteSources()
    sources[missingKey] = path.join(root, 'missing-' + label + '.exe')
    expect(() => stageMediaTools({
      outputDir: path.join(root, 'output'),
      platform: 'win32',
      arch: 'x64',
      hostPlatform: 'win32',
      hostArch: 'x64',
      sources,
      verify: false,
    })).toThrow(new RegExp(label))
  })

  it.each([
    ['FFmpeg 二进制许可证', 'licensePath'],
    ['npm 包装层许可证', 'wrapperLicensePath'],
    ['依赖来源说明', 'packageReadmePath'],
    ['第三方声明', 'noticePath'],
    ['GPLv3 许可证原文', 'gplTextPath'],
  ])('缺少%s时拒绝生成可分发资源', (label, missingKey) => {
    const sources = createCompleteSources()
    sources[missingKey] = path.join(root, 'missing-license')

    expect(() => stageMediaTools({
      outputDir: path.join(root, 'output'),
      platform: 'win32',
      arch: 'x64',
      hostPlatform: 'win32',
      hostArch: 'x64',
      sources,
      verify: false,
    })).toThrow(new RegExp(label))
  })

  it.each([
    ['linux', 'x64', 'win32', 'x64'],
    ['win32', 'arm64', 'win32', 'x64'],
  ])('拒绝在 %s/%s 主机为 %s/%s 的不匹配构建中混入错误二进制', (
    platform,
    arch,
    hostPlatform,
    hostArch,
  ) => {
    expect(() => stageMediaTools({
      outputDir: path.join(root, 'output'),
      platform,
      arch,
      hostPlatform,
      hostArch,
      sources: createCompleteSources(),
      verify: false,
    })).toThrow(/原生构建主机/)
  })

  it('FFmpeg 缺少 Story2Video 必需编码器或滤镜时拒绝打包', () => {
    const run = vi.fn((_binary, args) => (
      args.includes('-encoders')
        ? 'libx264 aac libmp3lame png'
        : 'scale anullsrc'
    ))

    expect(() => assertFfmpegCapabilities('ffmpeg.exe', { run }))
      .toThrow(/xfade/)
  })

  it('二进制 SHA-256 与资产锁不一致时拒绝打包', () => {
    const sources = createCompleteSources()
    const assetLock = createAssetLock(sources)
    assetLock.assets['win32-x64'].ffmpeg.sha256 = '0'.repeat(64)

    expect(() => assertSourceIntegrity(sources, 'win32', 'x64', assetLock))
      .toThrow(/SHA-256/)
  })

  it('资产锁未声明目标平台和架构时拒绝打包', () => {
    expect(() => assertSourceIntegrity(createCompleteSources(), 'darwin', 'arm64', { assets: {} }))
      .toThrow(/资产锁/)
  })

  it('把已验证二进制的真实版本和构建参数写入资源目录', () => {
    const sources = createCompleteSources()
    const outputDir = path.join(root, 'output')
    const run = vi.fn((_binary, args) => {
      if (args.includes('-encoders')) return REQUIRED_ENCODERS.join(' ')
      if (args.includes('-filters')) return REQUIRED_FILTERS.join(' ')
      if (_binary === sources.ffprobePath) return 'ffprobe version test-build'
      return 'ffmpeg version test-build\nconfiguration: --enable-gpl --enable-version3'
    })

    stageMediaTools({
      outputDir,
      platform: 'win32',
      arch: 'x64',
      hostPlatform: 'win32',
      hostArch: 'x64',
      sources,
      run,
      assetLock: createAssetLock(sources),
    })

    expect(fs.readFileSync(path.join(outputDir, 'FFMPEG-BUILD.txt'), 'utf8'))
      .toContain('configuration: --enable-gpl --enable-version3')
    expect(JSON.parse(fs.readFileSync(path.join(outputDir, 'MEDIA-TOOLS-LOCK.json'), 'utf8')))
      .toHaveProperty('assets.win32-x64')
    expect(run).toHaveBeenCalledWith(sources.ffprobePath, ['-hide_banner', '-version'])
  })

  it('桌面打包合同声明 media-tools extraResources', () => {
    const packageJson = require('../../package.json')
    const mediaTools = packageJson.build.extraResources.find((entry) => entry.to === 'media-tools')

    expect(mediaTools).toMatchObject({ from: '.media-tools', to: 'media-tools' })
  })

  it('桌面打包合同排除依赖目录中的重复媒体二进制', () => {
    const files = require('../../package.json').build.files

    expect(files).toContain('!node_modules/ffmpeg-ffprobe-static/ffmpeg*')
    expect(files).toContain('!node_modules/ffmpeg-ffprobe-static/ffprobe*')
  })

  it.skipIf(skipNativeMediaTests)('直接生产依赖同时提供真实 ffmpeg、ffprobe 和许可证材料', () => {
    const sources = resolveSources()

    for (const source of Object.values(sources)) {
      expect(fs.existsSync(source), source).toBe(true)
    }
    assertSourceIntegrity(sources, process.platform, process.arch)
    assertFfmpegCapabilities(sources.ffmpegPath)
    expect(execFileSync(sources.ffprobePath, ['-hide_banner', '-version'], {
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
    })).toMatch(/ffprobe version/)
  }, 60000)
})
