// @ts-check
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { AssetGenerator, findFfmpeg: findAssetFfmpeg } = require('../services/asset-generator')
const { Story2VideoComposeEngine, findFfmpeg } = require('../services/story2video-compose-engine')

const log = { info () {}, warn () {}, error () {} }

function assertDecodable (ffmpeg, filePath) {
  const stat = fs.statSync(filePath)
  assert.ok(stat.isFile() && stat.size > 0, '输出必须是非空普通文件')
  execFileSync(ffmpeg, ['-v', 'error', '-i', filePath, '-map', '0:v:0', '-f', 'null', '-'], {
    stdio: 'pipe',
    timeout: 60000,
  })
}

test('真实 ffmpeg：图片/TTS → xfade → BGM/水印 → MP4/WebM', { timeout: 240000 }, async (t) => {
  const ffmpeg = findFfmpeg() || findAssetFfmpeg()
  if (!ffmpeg) return t.skip('ffmpeg 不可用')

  const controlledTempRoot = path.join(os.tmpdir(), 'story2video')
  fs.mkdirSync(controlledTempRoot, { recursive: true })
  const root = fs.mkdtempSync(path.join(controlledTempRoot, 'real-ffmpeg-'))
  const assetGenerator = new AssetGenerator({ outputDir: path.join(root, 'assets'), log })
  const composeEngine = new Story2VideoComposeEngine({ outputDir: path.join(root, 'output'), log })

  try {
    const images = await Promise.all([
      assetGenerator.generateImage('长安城夜景，灯火与宫殿', { runId: 'real', index: 0, aspect_ratio: '16:9', style: 'cinematic' }),
      assetGenerator.generateImage('清晨海边，远处的帆船', { runId: 'real', index: 1, aspect_ratio: '16:9', style: 'watercolor' }),
    ])
    assert.ok(images.every(result => result.code === 0), '真实图片生成必须成功')

    const audioDir = path.join(root, 'audio')
    fs.mkdirSync(audioDir, { recursive: true })
    const audio = await Promise.all([
      assetGenerator._generateSilence(path.join(audioDir, 'scene-0.mp3'), 0, 2),
      assetGenerator._generateSilence(path.join(audioDir, 'scene-1.mp3'), 1, 2),
    ])
    assert.ok(audio.every(result => result.code === 0), '真实音频生成必须成功')

    const bgmPath = path.join(root, 'bgm.mp3')
    execFileSync(ffmpeg, [
      '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
      '-c:a', 'libmp3lame', '-b:a', '96k', bgmPath,
    ], { stdio: 'pipe', timeout: 30000 })

    const manifest = {
      scenes: [0, 1].map(index => ({
        index,
        text: index === 0 ? '长安城夜景' : '清晨海边',
        imagePath: images[index].data.path,
        audioPath: audio[index].data.path,
        duration: 2,
      })),
    }
    const baseOptions = {
      transition: 'slide-left',
      transitionDuration: 0.3,
      imageEffect: 'zoom-in',
      subtitleEnabled: true,
      subtitleStyle: { size: 'sm', style: 'style2' },
      watermark: true,
      watermarkText: 'Multi-Publish',
      bgmPath,
      bgmVolume: 0.2,
      resolution: '640x360',
      fps: 24,
    }

    const mp4 = await composeEngine.compose(manifest, { ...baseOptions, format: 'mp4' })
    assert.equal(mp4.code, 0, mp4.message)
    assert.equal(mp4.data.segmentCount, 2)
    assert.equal(mp4.data.bgmApplied, true)
    assertDecodable(ffmpeg, mp4.data.videoPath)

    const webm = await composeEngine.compose({ scenes: [manifest.scenes[0]] }, {
      ...baseOptions,
      transition: 'none',
      bgmPath: null,
      format: 'webm',
    })
    assert.equal(webm.code, 0, webm.message)
    assert.match(webm.data.videoPath, /\.webm$/)
    assertDecodable(ffmpeg, webm.data.videoPath)

    // 缺少 duration 且片段短于默认转场时长时，仍应按真实媒体时长完成合成。
    const shortAudio = await Promise.all([0, 1].map(index => {
      const output = path.join(audioDir, 'short-' + index + '.mp3')
      execFileSync(ffmpeg, [
        '-y', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-t', '0.25', '-c:a', 'libmp3lame', '-b:a', '96k', output,
      ], { stdio: 'pipe', timeout: 30000 })
      return output
    }))
    const shortResult = await composeEngine.compose({
      scenes: shortAudio.map((audioPath, index) => ({
        index,
        imagePath: images[index].data.path,
        audioPath,
        text: '短片段 ' + index,
      })),
    }, {
      transition: 'slide-left',
      transitionDuration: 1.2,
      bgmPath: null,
      format: 'mp4',
      resolution: '320x180',
      fps: 24,
    })
    assert.equal(shortResult.code, 0, shortResult.message)
    assertDecodable(ffmpeg, shortResult.data.videoPath)
    assert.ok(shortResult.data.duration > 0 && shortResult.data.duration < 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
