/**
 * ChunkedUploader — 通用分片上传器
 *
 * 平台无关的文件分片上传基础类。
 * 各平台提供 uploadChunkFn 实现具体上传协议。
 * 
 * 功能:
 * - 文件自动分片（可配置片大小）
 * - 逐块上传（可配置并发数）
 * - 进度回调 + EventEmitter 事件
 * - 支持取消
 */
const fs = require('fs')
const crypto = require('crypto')
const path = require('path')
const EventEmitter = require('events')

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024  // 5MB
const DEFAULT_CONCURRENCY = 1

class ChunkedUploader extends EventEmitter {
  constructor (options = {}) {
    super()
    this.chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE
    this.concurrency = options.concurrency || DEFAULT_CONCURRENCY
    this._cancelled = false
  }

  /**
   * 将文件拆分为 Buffer 分片
   * @param {string} filePath
   * @returns {Buffer[]}
   */
  splitFile (filePath) {
    const fd = fs.openSync(filePath, 'r')
    try {
      const stat = fs.fstatSync(fd)
      const chunks = []
      let offset = 0

      while (offset < stat.size) {
        const size = Math.min(this.chunkSize, stat.size - offset)
        const buf = Buffer.alloc(size)
        fs.readSync(fd, buf, 0, size, offset)
        chunks.push(buf)
        offset += size
      }

      return chunks
    } finally {
      fs.closeSync(fd)
    }
  }

  /**
   * 执行分片上传
   *
   * @param {string} filePath - 本地文件路径
   * @param {Function} uploadChunkFn - async (chunk, index, total, uploadId) => { success }
   * @param {Function} onProgress - (percent, bytesUploaded, totalBytes) => void
   * @returns {Promise<{success, bytesUploaded, chunksTotal, error?, cancelled?}>}
   */
  async upload (filePath, uploadChunkFn, onProgress) {
    this._cancelled = false
    const stat = fs.statSync(filePath)
    const totalBytes = stat.size
    const chunks = this.splitFile(filePath)
    const totalChunks = chunks.length
    const uploadId = ChunkedUploader.generateUploadId()
    let bytesUploaded = 0

    // 初始回调
    if (typeof onProgress === 'function') {
      onProgress(0, 0, totalBytes)
    }

    try {
      // 串行上传（默认 concurrency = 1）
      for (let i = 0; i < totalChunks; i++) {
        if (this._cancelled) {
          this.emit('upload:error', { uploadId, index: i, error: '用户取消' })
          return { success: false, bytesUploaded, chunksTotal: totalChunks, cancelled: true }
        }

        const chunk = chunks[i]

        try {
          await uploadChunkFn(chunk, i, totalChunks, uploadId)
        } catch (err) {
          const errorMsg = err.message || '分片上传失败'
          this.emit('upload:error', { uploadId, index: i, error: errorMsg })
          return { success: false, bytesUploaded, chunksTotal: totalChunks, error: errorMsg }
        }

        bytesUploaded += chunk.length

        // 进度回调
        if (typeof onProgress === 'function') {
          const percent = Math.round((bytesUploaded / totalBytes) * 100)
          onProgress(percent, bytesUploaded, totalBytes)
        }

        this.emit('chunk:uploaded', { uploadId, index: i, total: totalChunks, bytes: chunk.length })
      }

      this.emit('upload:complete', { uploadId, bytesUploaded, chunksTotal: totalChunks })
      return { success: true, bytesUploaded, chunksTotal: totalChunks }
    } catch (err) {
      const errorMsg = err.message || '上传异常'
      this.emit('upload:error', { uploadId, error: errorMsg })
      return { success: false, bytesUploaded, chunksTotal: totalChunks, error: errorMsg }
    }
  }

  /**
   * 取消当前上传
   */
  cancel () {
    this._cancelled = true
  }

  /**
   * 生成唯一上传 ID
   */
  static generateUploadId () {
    return `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
  }
}

module.exports = ChunkedUploader
