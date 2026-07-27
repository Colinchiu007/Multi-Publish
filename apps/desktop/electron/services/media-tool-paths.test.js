// @vitest-environment node
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findFfmpeg, findFfprobe } = require('./media-tool-paths')

describe('媒体工具路径解析', () => {
  let root

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'media-tool-paths-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function createFile(relativePath) {
    const target = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'binary')
    return target
  }

  function isolatedOptions(overrides = {}) {
    return {
      env: {},
      platform: 'win32',
      resourcesPath: root,
      installedPaths: {},
      commandAvailable: () => false,
      commonPaths: [],
      ...overrides,
    }
  }

  it('打包资源优先于可控环境变量和开发依赖', () => {
    const configured = createFile('configured/ffmpeg.exe')
    const packaged = createFile('media-tools/ffmpeg.exe')
    const installed = createFile('installed/ffmpeg.exe')

    expect(findFfmpeg(isolatedOptions({
      env: { FFMPEG_PATH: configured },
      installedPaths: { ffmpeg: installed },
    }))).toBe(packaged)
  })

  it('没有打包资源时允许开发环境使用显式环境变量', () => {
    const configured = createFile('configured/ffmpeg.exe')
    const installed = createFile('installed/ffmpeg.exe')

    expect(findFfmpeg(isolatedOptions({
      env: { FFMPEG_PATH: configured },
      resourcesPath: null,
      installedPaths: { ffmpeg: installed },
    }))).toBe(configured)
  })

  it('显式 FFPROBE_PATH 优先于 FFMPEG_PATH 同目录探测', () => {
    const configured = createFile('configured/ffprobe-custom.exe')
    const ffmpeg = createFile('suite/ffmpeg.exe')
    createFile('suite/ffprobe.exe')

    expect(findFfprobe(isolatedOptions({
      env: { FFMPEG_PATH: ffmpeg, FFPROBE_PATH: configured },
    }))).toBe(configured)
  })

  it('按当前宿主平台语义从绝对 FFMPEG_PATH 的同目录解析 ffprobe', () => {
    const executableExtension = process.platform === 'win32' ? '.exe' : ''
    const ffmpeg = createFile(`suite/ffmpeg${executableExtension}`)
    const ffprobe = createFile(`suite/ffprobe${executableExtension}`)

    expect(findFfprobe(isolatedOptions({
      env: { FFMPEG_PATH: ffmpeg },
      platform: process.platform,
    }))).toBe(ffprobe)
  })

  it('按目标 Windows 语义解析 drive 路径中的 ffprobe sibling', () => {
    const ffmpeg = 'C:\\media-tools\\ffmpeg.exe'
    const ffprobe = 'C:\\media-tools\\ffprobe.exe'

    expect(findFfprobe(isolatedOptions({
      env: { FFMPEG_PATH: ffmpeg },
      resourcesPath: null,
      existsSync: candidate => candidate === ffprobe,
    }))).toBe(ffprobe)
  })

  it('打包应用从 resources/media-tools 解析 ffmpeg 和 ffprobe', () => {
    const ffmpeg = createFile('media-tools/ffmpeg.exe')
    const ffprobe = createFile('media-tools/ffprobe.exe')

    expect(findFfmpeg(isolatedOptions())).toBe(ffmpeg)
    expect(findFfprobe(isolatedOptions())).toBe(ffprobe)
  })

  it('开发环境在没有打包资源时回退到直接依赖的二进制', () => {
    const ffmpeg = createFile('installed/ffmpeg.exe')
    const ffprobe = createFile('installed/ffprobe.exe')
    const options = isolatedOptions({
      resourcesPath: null,
      installedPaths: { ffmpeg, ffprobe },
    })

    expect(findFfmpeg(options)).toBe(ffmpeg)
    expect(findFfprobe(options)).toBe(ffprobe)
  })

  it('直接依赖缺失时依次回退到 PATH 命令和常见安装路径', () => {
    const common = createFile('common/ffmpeg.exe')
    const base = isolatedOptions({ resourcesPath: null })

    expect(findFfmpeg({ ...base, commandAvailable: command => command === 'ffmpeg' })).toBe('ffmpeg')
    expect(findFfmpeg({ ...base, commonPaths: [common] })).toBe(common)
  })

  it('忽略不存在的环境变量路径并在没有候选项时返回 null', () => {
    expect(findFfmpeg(isolatedOptions({
      env: { FFMPEG_PATH: path.join(root, 'missing.exe') },
      resourcesPath: null,
    }))).toBeNull()
  })

  it('不会把 Playwright 裁剪版 FFmpeg 当作通用媒体工具', () => {
    createFile('playwright-browsers/ffmpeg-1011/ffmpeg-win64.exe')

    expect(findFfmpeg(isolatedOptions())).toBeNull()
    expect(findFfprobe(isolatedOptions())).toBeNull()
  })
})
