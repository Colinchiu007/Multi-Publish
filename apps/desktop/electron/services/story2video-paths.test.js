// @vitest-environment node
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  isPathWithin,
  resolveReadableFile,
  resolveReadableMediaFile,
  importUserSelectedMedia,
  cleanupImportedMediaPaths,
  getAllowedMediaRoots,
  writeDataImage,
  getRunInputDir,
  cleanupRunInputDir,
  MAX_IMAGE_FILE_BYTES,
  MAX_AUDIO_FILE_BYTES,
  MAX_BGM_FILE_BYTES,
  MAX_INPUT_FILE_BYTES,
} = require('./story2video-paths')

describe('Story2Video 输入路径边界', () => {
  let root
  let outside

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-paths-'))
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-outside-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })

  it('只接受允许根目录内的真实文件，并解析为 canonical path', () => {
    const file = path.join(root, 'scene.png')
    fs.writeFileSync(file, 'image')

    expect(resolveReadableFile(file, { allowedRoots: [root] })).toBe(fs.realpathSync.native(file))
    expect(resolveReadableFile(path.join(outside, 'missing.png'), { allowedRoots: [root] })).toBeNull()
  })

  it('默认白名单只接受受控的 Story2Video 目录', () => {
    const external = path.join(outside, 'external.mp4')
    fs.writeFileSync(external, 'external-video')

    const roots = getAllowedMediaRoots()
    expect(roots).not.toContain(path.resolve(os.homedir()))
    expect(roots).not.toContain(path.resolve(os.tmpdir()))
    expect(resolveReadableFile(external)).toBeNull()
  })

  it('拒绝通过符号链接越界的文件', () => {
    const target = path.join(outside, 'secret.txt')
    fs.writeFileSync(target, 'secret')
    const link = path.join(root, 'link.txt')
    try {
      fs.symlinkSync(target, link, 'file')
    } catch {
      return
    }

    expect(resolveReadableFile(link, { allowedRoots: [root] })).toBeNull()
  })

  it('拒绝通过目录连接访问允许根目录之外的文件', () => {
    const target = path.join(outside, 'secret.txt')
    fs.writeFileSync(target, 'secret')
    const link = path.join(root, 'linked-directory')
    try {
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      return
    }

    expect(isPathWithin(path.join(link, 'secret.txt'), [root])).toBe(false)
    expect(resolveReadableFile(path.join(link, 'secret.txt'), { allowedRoots: [root] })).toBeNull()
  })

  it('拒绝超出单文件大小上限的媒体', () => {
    const file = path.join(root, 'large.bin')
    const handle = fs.openSync(file, 'w')
    try {
      fs.ftruncateSync(handle, MAX_INPUT_FILE_BYTES + 1)
    } finally {
      fs.closeSync(handle)
    }
    expect(resolveReadableFile(file, { allowedRoots: [root] })).toBeNull()
  })

  it('data URL 写入运行目录并可在运行结束后清理', () => {
    const runId = 'run-cleanup-test'
    const output = writeDataImage('data:image/png;base64,aW1hZ2U=', runId, 0, { baseDir: root })
    expect(output).toMatch(/image_0000\.png$/)
    expect(fs.existsSync(output)).toBe(true)
    expect(getRunInputDir(runId, { baseDir: root })).toBe(path.dirname(output))

    cleanupRunInputDir(runId, { baseDir: root })
    expect(fs.existsSync(path.dirname(output))).toBe(false)
  })

  it('图片只接受 JPEG、PNG、WebP，且沿用旧项目 10MB 上限', () => {
    const jpeg = path.join(root, 'scene.jpg')
    const gif = path.join(root, 'scene.gif')
    fs.writeFileSync(jpeg, 'image')
    fs.writeFileSync(gif, 'image')

    expect(resolveReadableMediaFile(jpeg, { kind: 'image', allowedRoots: [root] })).toBe(fs.realpathSync.native(jpeg))
    expect(resolveReadableMediaFile(gif, { kind: 'image', allowedRoots: [root] })).toBeNull()

    const large = path.join(root, 'large.png')
    const handle = fs.openSync(large, 'w')
    try { fs.ftruncateSync(handle, MAX_IMAGE_FILE_BYTES + 1) } finally { fs.closeSync(handle) }
    expect(resolveReadableMediaFile(large, { kind: 'image', allowedRoots: [root] })).toBeNull()
  })

  it('旁白与 BGM 使用各自大小上限，并拒绝 PRD 之外的音频格式', () => {
    const mp3 = path.join(root, 'voice.mp3')
    const aac = path.join(root, 'voice.aac')
    fs.writeFileSync(mp3, 'audio')
    fs.writeFileSync(aac, 'audio')

    expect(resolveReadableMediaFile(mp3, { kind: 'audio', allowedRoots: [root] })).toBe(fs.realpathSync.native(mp3))
    expect(resolveReadableMediaFile(aac, { kind: 'audio', allowedRoots: [root] })).toBeNull()
    expect(MAX_AUDIO_FILE_BYTES).toBe(50 * 1024 * 1024)
    expect(MAX_BGM_FILE_BYTES).toBe(15 * 1024 * 1024)
  })

  it('将用户明确选择的外部媒体复制到受控临时目录，并可按运行终态清理', () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-selected-'))
    const importRoot = path.join(root, 'imports')
    const source = path.join(sourceRoot, 'narration.m4a')
    fs.writeFileSync(source, 'selected-audio')

    try {
      const imported = importUserSelectedMedia(source, 'audio', { baseDir: importRoot })
      expect(imported.path).toMatch(/\.m4a$/)
      expect(fs.readFileSync(imported.path, 'utf8')).toBe('selected-audio')
      expect(resolveReadableMediaFile(imported.path, {
        kind: 'audio',
        allowedRoots: [importRoot],
      })).toBe(fs.realpathSync.native(imported.path))

      expect(cleanupImportedMediaPaths({
        audio: [{ path: imported.path }],
        bgmPath: path.join(outside, 'do-not-delete.mp3'),
      }, { baseDir: importRoot })).toBe(1)
      expect(fs.existsSync(imported.path)).toBe(false)
    } finally {
      fs.rmSync(sourceRoot, { recursive: true, force: true })
    }
  })
})
