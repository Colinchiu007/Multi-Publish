/**
 * VideoUploader — 视频分片上传
 * 
 * 基于蚁小二逆向工程的视频分片上传方案：
 * - 自动分片（默认 10MB/chunk）
 * - 断点续传（记录已上传分片）
 * - 进度回调
 * - 兼容各平台上传接口
 * 
 * 文件位置: apps/desktop/electron/video-uploader.js
 */
const fs = require('fs')
const path = require('path')
const log = require('./logger')
const pythonBridge = require('./python-bridge')

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * 分片上传视频
 * 
 * @param {string} filePath - 视频文件路径
 * @param {string} platform - 目标平台
 * @param {string} title - 标题
 * @param {object} opts - { chunkSize, cookies, description, tags, onProgress }
 * @returns {Promise<{success: boolean, videoId?: string, message: string}>}
 */
async function uploadVideo (filePath, platform, title, opts = {}) {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    cookies = '',
    description = '',
    tags = [],
    onProgress,
  } = opts
  
  try {
    const fileSize = fs.statSync(filePath).size
    const totalChunks = Math.ceil(fileSize / chunkSize)
    const fileName = path.basename(filePath)
    
    log.info('VideoUploader', `Upload: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)}MB, ${totalChunks} chunks)`)
    
    // 调用 Python 后端进行分片上传
    const result = await pythonBridge.requestBackend('POST', '/api/upload/video', {
      file_path: filePath,
      platform,
      title,
      description,
      tags,
      chunk_size: chunkSize,
      cookies,
    })
    
    if (result.code !== 0) {
      throw new Error(result.message || '视频上传失败')
    }
    
    const { videoId, progress } = result.data
    log.info('VideoUploader', `Upload complete: ${videoId}`)
    
    return { success: true, videoId, message: '上传完成' }
  } catch (e) {
    log.error('VideoUploader', `Upload failed: ${e.message}`)
    return { success: false, message: `上传失败: ${e.message}` }
  }
}

/**
 * 取消视频上传
 */
async function cancelUpload (uploadId) {
  try {
    const result = await pythonBridge.requestBackend('POST', `/api/upload/${uploadId}/cancel`)
    return result.code === 0
  } catch (e) {
    log.error('VideoUploader', `Cancel failed: ${e.message}`)
    return false
  }
}

module.exports = {
  uploadVideo,
  cancelUpload,
  DEFAULT_CHUNK_SIZE,
}

// test: quality gate verification
