/**
 * Test: chunked-uploader.js — 通用分片上传器
 * 测试: 文件分片、逐块上传、进度回调、取消、事件
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const ChunkedUploader = require('../src/chunked-uploader')

describe('ChunkedUploader', () => {
  let uploader
  let tmpDir
  let testFilePath

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chunked-uploader-test-'))
    // Create a test file of ~12MB (3 chunks of 5MB)
    testFilePath = path.join(tmpDir, 'test-video.mp4')
    const buf = Buffer.alloc(12 * 1024 * 1024, 'A')
    fs.writeFileSync(testFilePath, buf)
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    uploader = new ChunkedUploader()
  })

  // ── Constructor ─────────────────────────────────────────────────

  test('uses default chunk size of 5MB', () => {
    expect(uploader.chunkSize).toBe(5 * 1024 * 1024)
  })

  test('extends EventEmitter', () => {
    expect(typeof uploader.on).toBe('function')
    expect(typeof uploader.emit).toBe('function')
  })

  test('accepts custom chunk size', () => {
    const custom = new ChunkedUploader({ chunkSize: 2 * 1024 * 1024 })
    expect(custom.chunkSize).toBe(2 * 1024 * 1024)
  })

  test('accepts custom concurrency', () => {
    const custom = new ChunkedUploader({ concurrency: 3 })
    expect(custom.concurrency).toBe(3)
  })

  // ── splitFile ───────────────────────────────────────────────────

  test('splitFile returns correct number of chunks for exact division', () => {
    const uploader5 = new ChunkedUploader({ chunkSize: 4 * 1024 * 1024 }) // 4MB
    const chunks = uploader5.splitFile(testFilePath)
    // 12MB / 4MB = 3 chunks
    expect(chunks).toHaveLength(3)
  })

  test('splitFile returns extra chunk for remainder', () => {
    const uploader5 = new ChunkedUploader({ chunkSize: 5 * 1024 * 1024 }) // 5MB
    const chunks = uploader5.splitFile(testFilePath)
    // 12MB / 5MB = 2 full + 1 partial = 3 chunks
    expect(chunks).toHaveLength(3)
  })

  test('splitFile chunk sizes sum to total file size', () => {
    const uploader5 = new ChunkedUploader({ chunkSize: 5 * 1024 * 1024 })
    const chunks = uploader5.splitFile(testFilePath)
    const total = chunks.reduce((sum, c) => sum + c.length, 0)
    expect(total).toBe(12 * 1024 * 1024)
  })

  test('splitFile throws on non-existent file', () => {
    expect(() => uploader.splitFile('/nonexistent/path.mp4')).toThrow()
  })

  // ── upload ──────────────────────────────────────────────────────

  test('upload calls uploadChunkFn for each chunk', async () => {
    const uploader5 = new ChunkedUploader({ chunkSize: 6 * 1024 * 1024 }) // 2 chunks
    const uploadChunkFn = jest.fn().mockResolvedValue({ success: true })
    const onProgress = jest.fn()

    const result = await uploader5.upload(testFilePath, uploadChunkFn, onProgress)

    expect(uploadChunkFn).toHaveBeenCalledTimes(2)
    expect(result.success).toBe(true)
    expect(result.chunksTotal).toBe(2)
  })

  test('upload passes chunk data, index, and total to uploadChunkFn', async () => {
    const uploader5 = new ChunkedUploader({ chunkSize: 12 * 1024 * 1024 }) // 1 chunk
    const uploadChunkFn = jest.fn().mockResolvedValue({ success: true })

    await uploader5.upload(testFilePath, uploadChunkFn, jest.fn())

    expect(uploadChunkFn).toHaveBeenCalledWith(
      expect.any(Buffer),
      0,        // index (0-based)
      1,        // total
      expect.any(String)  // uploadId
    )
  })

  test('upload calls onProgress with 0% and 100%', async () => {
    const uploader5 = new ChunkedUploader({ chunkSize: 12 * 1024 * 1024 })
    const onProgress = jest.fn()

    await uploader5.upload(testFilePath, () => ({ success: true }), onProgress)

    expect(onProgress).toHaveBeenCalledWith(0, 0, 12 * 1024 * 1024)
    expect(onProgress).toHaveBeenCalledWith(100, 12 * 1024 * 1024, 12 * 1024 * 1024)
  })

  test('upload emits chunk:uploaded for each chunk', async () => {
    const uploader5 = new ChunkedUploader({ chunkSize: 6 * 1024 * 1024 })
    const emitted = []
    uploader5.on('chunk:uploaded', (data) => emitted.push(data))

    await uploader5.upload(testFilePath, () => ({ success: true }), jest.fn())

    expect(emitted).toHaveLength(2)
    expect(emitted[0].index).toBe(0)
    expect(emitted[1].index).toBe(1)
  })

  test('upload emits upload:complete on success', async () => {
    const emitted = []
    const u = new ChunkedUploader({ chunkSize: 12 * 1024 * 1024 })
    u.on('upload:complete', (data) => emitted.push(data))

    await u.upload(testFilePath, () => ({ success: true }), jest.fn())

    expect(emitted).toHaveLength(1)
    expect(emitted[0].bytesUploaded).toBe(12 * 1024 * 1024)
  })

  test('upload emits upload:error and returns failed result on chunk failure', async () => {
    const errors = []
    uploader.on('upload:error', (data) => errors.push(data))

    const result = await uploader.upload(
      testFilePath,
      () => { throw new Error('upload failed') },
      jest.fn()
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('upload failed')
    expect(errors.length).toBeGreaterThanOrEqual(1)
  })

  // ── cancel ──────────────────────────────────────────────────────

  test('cancel stops upload and returns partial result', async () => {
    const uploader5 = new ChunkedUploader({ chunkSize: 4 * 1024 * 1024 })
    let callCount = 0

    const result = await uploader5.upload(
      testFilePath,
      async () => {
        callCount++
        if (callCount === 2) {
          uploader5.cancel()
        }
        return { success: true }
      },
      jest.fn()
    )

    expect(result.success).toBe(false)
    expect(result.cancelled).toBe(true)
    expect(callCount).toBe(2)  // 1st + 2nd (which triggers cancel)
  })

  test('cancel resets cancelled flag', () => {
    uploader.cancel()
    expect(uploader._cancelled).toBe(true)
  })

  // ── cancelUpload (static/reset) ─────────────────────────────────

  test('cancelUpload generates unique upload ID', () => {
    const id1 = ChunkedUploader.generateUploadId()
    const id2 = ChunkedUploader.generateUploadId()
    expect(id1).not.toBe(id2)
  })
})
