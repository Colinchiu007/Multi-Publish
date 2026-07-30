'use strict'

const { execFileSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const MEDIA_TOOL_ASSET_LOCK = require('../media-tools-lock.json')

const REQUIRED_ENCODERS = Object.freeze(['libx264', 'aac', 'libmp3lame', 'png'])
const REQUIRED_FILTERS = Object.freeze([
  'scale',
  'pad',
  'zoompan',
  'rotate',
  'boxblur',
  'drawtext',
  'fade',
  'xfade',
  'acrossfade',
  'anullsrc',
  'amix',
])

function runTool (binary, args) {
  return execFileSync(binary, args, {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30000,
    windowsHide: true,
  })
}

function missingCapabilities (output, required) {
  return required.filter((name) => !new RegExp('(^|\\s)' + name + '(\\s|$)', 'm').test(output))
}

function assertFfmpegCapabilities (ffmpegPath, options = {}) {
  const run = options.run || runTool
  const encoders = run(ffmpegPath, ['-hide_banner', '-encoders'])
  const filters = run(ffmpegPath, ['-hide_banner', '-filters'])
  const missing = [
    ...missingCapabilities(encoders, REQUIRED_ENCODERS),
    ...missingCapabilities(filters, REQUIRED_FILTERS),
  ]
  if (missing.length > 0) {
    throw new Error('FFmpeg 缺少 Story2Video 必需能力: ' + missing.join(', '))
  }
}

function resolveSources () {
  const bundled = require('ffmpeg-ffprobe-static')
  const packageRoot = path.dirname(require.resolve('ffmpeg-ffprobe-static'))
  return {
    ffmpegPath: bundled.ffmpegPath,
    ffprobePath: bundled.ffprobePath,
    licensePath: bundled.ffmpegPath ? bundled.ffmpegPath + '.LICENSE' : null,
    wrapperLicensePath: path.join(packageRoot, 'LICENSE'),
    packageReadmePath: path.join(packageRoot, 'README.md'),
    noticePath: path.join(__dirname, '..', 'THIRD-PARTY-NOTICES.md'),
    gplTextPath: path.join(__dirname, '..', 'licenses', 'GPL-3.0.txt'),
  }
}

function copyRequiredFile (source, destination, label, executable = false) {
  if (!source || !fs.existsSync(source)) throw new Error(label + ' 不存在: ' + String(source))
  fs.copyFileSync(source, destination)
  if (executable && process.platform !== 'win32') fs.chmodSync(destination, 0o755)
}

function assertNativeBuildTarget (platform, arch, hostPlatform, hostArch) {
  if (platform !== hostPlatform || arch !== hostArch) {
    throw new Error(
      'ffmpeg-ffprobe-static 只安装构建主机的二进制；请使用与目标匹配的原生构建主机。' +
      '目标=' + platform + '/' + arch + '，主机=' + hostPlatform + '/' + hostArch,
    )
  }
}

function sha256File (filePath) {
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  const descriptor = fs.openSync(filePath, 'r')
  try {
    let bytesRead
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead))
    } while (bytesRead > 0)
  } finally {
    fs.closeSync(descriptor)
  }
  return hash.digest('hex')
}

function assertSourceIntegrity (sources, platform, arch, assetLock = MEDIA_TOOL_ASSET_LOCK) {
  const target = assetLock && assetLock.assets && assetLock.assets[platform + '-' + arch]
  if (!target) {
    throw new Error('媒体工具资产锁未声明目标平台/架构: ' + platform + '/' + arch)
  }

  for (const tool of ['ffmpeg', 'ffprobe']) {
    const source = sources[tool + 'Path']
    const expected = target[tool]
    if (!expected) throw new Error('媒体工具资产锁缺少 ' + tool + ' 条目')
    const actualSize = fs.statSync(source).size
    if (actualSize !== expected.size) {
      throw new Error(tool + ' 字节数与资产锁不一致: expected=' + expected.size + ', actual=' + actualSize)
    }
    const actualHash = sha256File(source)
    if (actualHash !== String(expected.sha256).toLowerCase()) {
      throw new Error(tool + ' SHA-256 与资产锁不一致: expected=' + expected.sha256 + ', actual=' + actualHash)
    }
  }
}

function stageMediaTools (options = {}) {
  const platform = options.platform || process.platform
  const arch = options.arch || process.arch
  const hostPlatform = options.hostPlatform || process.platform
  const hostArch = options.hostArch || process.arch
  const outputDir = options.outputDir || path.join(__dirname, '..', '.media-tools')
  const sources = options.sources || resolveSources()
  assertNativeBuildTarget(platform, arch, hostPlatform, hostArch)

  const requiredSources = [
    [sources.ffmpegPath, 'ffmpeg 二进制'],
    [sources.ffprobePath, 'ffprobe 二进制'],
    [sources.licensePath, 'FFmpeg 二进制许可证'],
    [sources.wrapperLicensePath, 'npm 包装层许可证'],
    [sources.packageReadmePath, '依赖来源说明'],
    [sources.noticePath, '第三方声明'],
    [sources.gplTextPath, 'GPLv3 许可证原文'],
  ]
  for (const [source, label] of requiredSources) {
    if (!source || !fs.existsSync(source)) throw new Error(label + ' 不存在: ' + String(source))
  }

  let buildInfo = null
  let verifiedAssetLock = null
  if (options.verify !== false) {
    const run = options.run || runTool
    verifiedAssetLock = options.assetLock || MEDIA_TOOL_ASSET_LOCK
    assertSourceIntegrity(sources, platform, arch, verifiedAssetLock)
    assertFfmpegCapabilities(sources.ffmpegPath, { ...options, run })
    const ffmpegVersion = run(sources.ffmpegPath, ['-hide_banner', '-version'])
    const ffprobeVersion = run(sources.ffprobePath, ['-hide_banner', '-version'])
    buildInfo = ffmpegVersion.trim() + '\n\n' + ffprobeVersion.trim() + '\n'
  }

  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })
  const extension = platform === 'win32' ? '.exe' : ''
  const ffmpegPath = path.join(outputDir, 'ffmpeg' + extension)
  const ffprobePath = path.join(outputDir, 'ffprobe' + extension)
  copyRequiredFile(sources.ffmpegPath, ffmpegPath, 'ffmpeg', true)
  copyRequiredFile(sources.ffprobePath, ffprobePath, 'ffprobe', true)
  copyRequiredFile(sources.licensePath, path.join(outputDir, 'FFMPEG-LICENSE.txt'), 'FFmpeg 二进制许可证')
  copyRequiredFile(
    sources.wrapperLicensePath,
    path.join(outputDir, 'FFMPEG-WRAPPER-LICENSE.txt'),
    'npm 包装层许可证',
  )
  copyRequiredFile(
    sources.packageReadmePath,
    path.join(outputDir, 'FFMPEG-PACKAGE-README.md'),
    '依赖来源说明',
  )
  copyRequiredFile(
    sources.noticePath,
    path.join(outputDir, 'THIRD-PARTY-NOTICES.md'),
    '第三方声明',
  )
  copyRequiredFile(
    sources.gplTextPath,
    path.join(outputDir, 'GPL-3.0.txt'),
    'GPLv3 许可证原文',
  )
  if (buildInfo) fs.writeFileSync(path.join(outputDir, 'FFMPEG-BUILD.txt'), buildInfo, 'utf8')
  if (verifiedAssetLock) {
    fs.writeFileSync(
      path.join(outputDir, 'MEDIA-TOOLS-LOCK.json'),
      JSON.stringify(verifiedAssetLock, null, 2) + '\n',
      'utf8',
    )
  }
  return { outputDir, ffmpegPath, ffprobePath }
}

module.exports = {
  REQUIRED_ENCODERS,
  REQUIRED_FILTERS,
  assertFfmpegCapabilities,
  assertNativeBuildTarget,
  assertSourceIntegrity,
  resolveSources,
  stageMediaTools,
}
