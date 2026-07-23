// @vitest-environment node
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { createZipFromFiles } = require('./story2video-export')

describe('Story2Video ZIP 导出', () => {
  let root

  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 's2v-export-')) })
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })

  it('将多个本地视频打包为可读取的 ZIP，并清理临时目标文件', async () => {
    const first = path.join(root, 'first.mp4')
    const second = path.join(root, 'second.webm')
    const destination = path.join(root, 'result.zip')
    fs.writeFileSync(first, 'first-video')
    fs.writeFileSync(second, 'second-video')

    const result = await createZipFromFiles([
      { path: first, name: '第一段.mp4' },
      { path: second, name: '第二段.webm' },
    ], destination, { allowedRoots: [root] })

    const archive = fs.readFileSync(destination)
    expect(result).toMatchObject({ path: destination, fileCount: 2 })
    expect(archive.readUInt32LE(0)).toBe(0x04034b50)
    expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50)
    expect(archive.toString('utf8')).toContain('第一段.mp4')
    expect(archive.toString('utf8')).toContain('第二段.webm')
  })

  it('拒绝越界文件和带目录穿越的归档名', async () => {
    const allowed = path.join(root, 'video.mp4')
    const outside = path.join(os.tmpdir(), 's2v-export-outside-' + Date.now() + '.mp4')
    fs.writeFileSync(allowed, 'ok')
    fs.writeFileSync(outside, 'outside')
    try {
      await expect(createZipFromFiles([{ path: outside, name: 'ok.mp4' }], path.join(root, 'bad.zip'), { allowedRoots: [root] }))
        .rejects.toThrow(/不允许|目录|path/i)
      await expect(createZipFromFiles([{ path: allowed, name: '../escape.mp4' }], path.join(root, 'bad-name.zip'), { allowedRoots: [root] }))
        .rejects.toThrow(/文件名|name|目录/i)
    } finally {
      fs.rmSync(outside, { force: true })
    }
  })

  it('流式导出，不通过 readFile 把所有视频载入内存', async () => {
    const video = path.join(root, 'stream.mp4')
    const destination = path.join(root, 'stream.zip')
    fs.writeFileSync(video, Buffer.alloc(256 * 1024, 7))
    const readFileSpy = vi.spyOn(fs.promises, 'readFile')

    try {
      const result = await createZipFromFiles([
        { path: video, name: 'stream.mp4' },
      ], destination, { allowedRoots: [root] })
      expect(result.totalBytes).toBe(fs.statSync(destination).size)
      expect(readFileSpy).not.toHaveBeenCalled()
    } finally {
      readFileSpy.mockRestore()
    }
  })

  it('在创建临时 ZIP 前按 stat 拒绝超过总大小上限的导出', async () => {
    const first = path.join(root, 'first.mp4')
    const second = path.join(root, 'second.mp4')
    const destination = path.join(root, 'too-large.zip')
    fs.writeFileSync(first, '12345')
    fs.writeFileSync(second, '67890')

    await expect(createZipFromFiles([
      { path: first, name: 'first.mp4' },
      { path: second, name: 'second.mp4' },
    ], destination, { allowedRoots: [root], maxTotalBytes: 9 }))
      .rejects.toThrow(/总大小|上限/)
    expect(fs.existsSync(destination)).toBe(false)
    expect(fs.readdirSync(root).some(name => name.includes('.tmp-'))).toBe(false)
  })
})
