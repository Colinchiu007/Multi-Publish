// @ts-check
/**
 * 视频克隆 assetGenerator adapter（切片 4c）
 * - createVideoCloneAssetGenerator：走既有 AssetGenerator.generateImage（provider 或离线占位）
 * - createPlaceholderImageGenerator：无服务时的离线占位（ffmpeg 纯色图，degraded=true，诚实标注）
 * 错误：无服务 → VIDEOCLONE_PROVIDER_UNAVAILABLE；生成失败 → VIDEOCLONE_ASSET_GENERATION_FAILED
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { resolveBinary, runCommand } = require('@multi-publish/video-clone-engine')

function providerError(reason) {
  const e = new Error(reason || '生成服务不可用')
  e.code = 'VIDEOCLONE_PROVIDER_UNAVAILABLE'
  return e
}
function genError(message) {
  const e = new Error(message || '素材生成失败')
  e.code = 'VIDEOCLONE_ASSET_GENERATION_FAILED'
  return e
}

/** 走 AssetGenerator 服务（data.path） */
function createVideoCloneAssetGenerator({ assetGenerator }) {
  return async (spec, report) => {
    if (!assetGenerator || typeof assetGenerator.generateImage !== 'function') throw providerError()
    const aspect = (report && report.platformParams && report.platformParams.aspect) || '16:9'
    const result = await assetGenerator.generateImage(spec.promptSeed, {
      style: 'cinematic', index: spec.index, aspect_ratio: aspect,
    })
    if (!result || result.code !== 0 || !result.data || typeof result.data.path !== 'string') {
      throw genError(result && result.message)
    }
    return { path: result.data.path, kind: 'image' }
  }
}

/** 离线占位（无 AssetGenerator 服务时的诚实降级）：ffmpeg 纯色 PNG */
function createPlaceholderImageGenerator({ outputDir = null } = {}) {
  const dir = outputDir || path.join(os.tmpdir(), 'vc-assets')
  fs.mkdirSync(dir, { recursive: true })
  const colors = ['0x1a1a2e', '0x2d4a2d', '0x4a90d9', '0xe91e63', '0x6a1b9a', '0x7aa7b8']
  return async (spec, report) => {
    const bin = resolveBinary('VC_FFMPEG_PATH', 'FFMPEG_PATH', 'ffmpeg')
    const out = path.join(dir, 'shot_' + spec.index + '.png')
    const color = colors[spec.index % colors.length]
    const ratio = (report && report.platformParams && report.platformParams.aspect) || '16:9'
    const size = ratio === '9:16' ? '540x960' : ratio === '1:1' ? '720x720' : '960x540'
    try {
      await runCommand(bin, ['-y', '-f', 'lavfi', '-i', 'color=c=' + color + ':s=' + size + ':d=1', '-frames:v', '1', out], { timeoutMs: 60000 })
    } catch (err) { throw genError('占位图生成失败: ' + (err && err.message)) }
    return { path: out, kind: 'image', degraded: true, source: 'ffmpeg-placeholder' }
  }
}

module.exports = { createVideoCloneAssetGenerator, createPlaceholderImageGenerator }
