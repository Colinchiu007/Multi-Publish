// @ts-check
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { Story2VideoComposeEngine, findFfmpeg } = require('../services/story2video-compose-engine')
const ffprobePath = require('ffmpeg-ffprobe-static').ffprobePath

const log = { info () {}, warn () {}, error () {} }

function assertDecodable (ffmpeg, filePath) {
  const stat = fs.statSync(filePath)
  assert.ok(stat.isFile() && stat.size > 0, 'output must be non-empty file')
  execFileSync(ffmpeg, ['-v', 'error', '-i', filePath, '-map', '0:v:0', '-f', 'null', '-'], {
    stdio: 'pipe', timeout: 60000,
  })
}

function getDuration (ffmpeg, filePath) {
  const out = execFileSync(ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
  ], { encoding: 'utf8', timeout: 30000 })
  return parseFloat(out.trim())
}

function createTestVideo (ffmpeg, root, durationSec, filename) {
  const out = path.join(root, filename)
  execFileSync(ffmpeg, [
    '-y', '-f', 'lavfi',
    '-i', 'color=c=blue:s=640x360:d=' + durationSec + ':r=24',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out,
  ], { stdio: 'pipe', timeout: 30000 })
  return out
}

function createSilence (ffmpeg, root, durationSec, filename) {
  const out = path.join(root, filename)
  execFileSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', String(durationSec), '-c:a', 'libmp3lame', '-b:a', '96k', out,
  ], { stdio: 'pipe', timeout: 30000 })
  return out
}

function createTestImage (ffmpeg, root, filename) {
  const out = path.join(root, filename)
  execFileSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', 'color=c=red:s=640x360:d=1',
    '-frames:v', '1', out,
  ], { stdio: 'pipe', timeout: 30000 })
  return out
}

// Create engine with allowedMediaRoots including the temp root
function makeEngine (root) {
  const outputDir = path.join(root, 'output')
  fs.mkdirSync(outputDir, { recursive: true })
  return new Story2VideoComposeEngine({
    outputDir,
    log,
    allowedMediaRoots: [root],
  })
}

test('shortVideoHandling: loop mode - 4s video loops to fill 8s scene', { timeout: 120000 }, async () => {
  const ffmpeg = findFfmpeg()
  if (!ffmpeg) return

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-svh-loop-'))
  try {
    const videoPath = createTestVideo(ffmpeg, root, 4, 'video.mp4')
    const audioPath = createSilence(ffmpeg, root, 8, 'audio.mp3')
    const imagePath = createTestImage(ffmpeg, root, 'img.png')

    const engine = makeEngine(root)
    const manifest = { scenes: [
      { index: 0, text: 'test', subtitleBlocks: ['test'], imagePath, audioPath, videoPath, duration: 8 },
    ]}
    const result = await engine.compose(manifest, {
      transition: 'none', imageEffect: 'none', bgmPath: null,
      resolution: '640x360', fps: 24, videoMode: 'fixed', shortVideoHandling: 'loop',
    })

    assert.equal(result.code, 0, 'loop compose failed: ' + result.message)
    assertDecodable(ffmpeg, result.data.videoPath)
    const duration = getDuration(ffmpeg, result.data.videoPath)
    assert.ok(duration >= 7 && duration <= 10, 'loop duration should be ~8s, got ' + duration)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('shortVideoHandling: stop-at-end - 4s video + 4s zoom-in freeze = 8s', { timeout: 120000 }, async () => {
  const ffmpeg = findFfmpeg()
  if (!ffmpeg) return

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-svh-stop-'))
  try {
    const videoPath = createTestVideo(ffmpeg, root, 4, 'video.mp4')
    const audioPath = createSilence(ffmpeg, root, 8, 'audio.mp3')
    const imagePath = createTestImage(ffmpeg, root, 'img.png')

    const engine = makeEngine(root)
    const manifest = { scenes: [
      { index: 0, text: 'test', subtitleBlocks: ['test'], imagePath, audioPath, videoPath, duration: 8 },
    ]}
    const result = await engine.compose(manifest, {
      transition: 'none', imageEffect: 'none', bgmPath: null, subtitleEnabled: false,
      resolution: '640x360', fps: 24, videoMode: 'fixed', shortVideoHandling: 'stop-at-end',
    })

    assert.equal(result.code, 0, 'stop-at-end compose failed: ' + result.message)
    assertDecodable(ffmpeg, result.data.videoPath)
    const duration = getDuration(ffmpeg, result.data.videoPath)
    assert.ok(duration >= 7 && duration <= 10, 'stop-at-end duration should be ~8s, got ' + duration)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('shortVideoHandling: stop-at-end - 8s video trimmed to 4s scene, no tail', { timeout: 120000 }, async () => {
  const ffmpeg = findFfmpeg()
  if (!ffmpeg) return

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-svh-long-'))
  try {
    const videoPath = createTestVideo(ffmpeg, root, 8, 'video.mp4')
    const audioPath = createSilence(ffmpeg, root, 4, 'audio.mp3')
    const imagePath = createTestImage(ffmpeg, root, 'img.png')

    const engine = makeEngine(root)
    const manifest = { scenes: [
      { index: 0, text: 'test', subtitleBlocks: ['test'], imagePath, audioPath, videoPath, duration: 4 },
    ]}
    const result = await engine.compose(manifest, {
      transition: 'none', imageEffect: 'none', bgmPath: null,
      resolution: '640x360', fps: 24, videoMode: 'fixed', shortVideoHandling: 'stop-at-end',
    })

    assert.equal(result.code, 0, 'long video compose failed: ' + result.message)
    assertDecodable(ffmpeg, result.data.videoPath)
    const duration = getDuration(ffmpeg, result.data.videoPath)
    assert.ok(duration >= 3 && duration <= 6, 'long video should be trimmed to ~4s, got ' + duration)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('shortVideoHandling: mixed - video scene stop-at-end + image scene', { timeout: 120000 }, async () => {
  const ffmpeg = findFfmpeg()
  if (!ffmpeg) return

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-svh-mixed-'))
  try {
    const videoPath = createTestVideo(ffmpeg, root, 3, 'video.mp4')
    const audioPath1 = createSilence(ffmpeg, root, 6, 'audio1.mp3')
    const audioPath2 = createSilence(ffmpeg, root, 4, 'audio2.mp3')
    const imagePath = createTestImage(ffmpeg, root, 'img.png')

    const engine = makeEngine(root)
    const manifest = { scenes: [
      { index: 0, text: 'scene1', subtitleBlocks: ['scene1'], imagePath, audioPath: audioPath1, videoPath, duration: 6 },
      { index: 1, text: 'scene2', subtitleBlocks: ['scene2'], imagePath, audioPath: audioPath2, duration: 4 },
    ]}
    const result = await engine.compose(manifest, {
      transition: 'fade', transitionDuration: 0.3, imageEffect: 'zoom-in',
      bgmPath: null, resolution: '640x360', fps: 24, subtitleEnabled: false,
      videoMode: 'fixed', shortVideoHandling: 'stop-at-end',
    })

    assert.equal(result.code, 0, 'mixed compose failed: ' + result.message)
    assert.equal(result.data.segmentCount, 2)
    assertDecodable(ffmpeg, result.data.videoPath)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('shortVideoHandling: enum validation - invalid throws, valid preserved, missing defaults', { timeout: 30000 }, async () => {
  const { normalizeStory2VideoTextParams } = require('../services/story2video-text-config')

  // Invalid enum value should throw
  assert.throws(() => normalizeStory2VideoTextParams({
    text: 'test',
    story2videoTextConfig: { video: { shortVideoHandling: 'invalid-value' } },
  }), /短视频处理.*无效|shortVideoHandling.*invalid/i, 'invalid enum should throw')

  // Valid stop-at-end should be preserved
  const config2 = normalizeStory2VideoTextParams({
    text: 'test',
    story2videoTextConfig: { video: { shortVideoHandling: 'stop-at-end' } },
  })
  assert.equal(config2.shortVideoHandling, 'stop-at-end', 'valid stop-at-end should be preserved')

  // Missing field should default to loop
  const config3 = normalizeStory2VideoTextParams({ text: 'test' })
  assert.equal(config3.shortVideoHandling, 'loop', 'missing field should default to loop')
})
