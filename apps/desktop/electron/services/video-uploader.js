// @ts-check
/**
 * VideoUploader 鈥?瑙嗛鍒嗙墖涓婁紶
 * 
 * 鍩轰簬铓佸皬浜岄€嗗悜宸ョ▼鐨勮棰戝垎鐗囦笂浼犳柟妗堬細
 * - 鑷姩鍒嗙墖锛堥粯璁?10MB/chunk锛?
 * - 鏂偣缁紶锛堣褰曞凡涓婁紶鍒嗙墖锛?
 * - 杩涘害鍥炶皟
 * - 鍏煎鍚勫钩鍙颁笂浼犳帴鍙?
 * 
 * 鏂囦欢浣嶇疆: apps/desktop/electron/video-uploader.js
 */
const fs = require('fs')
const path = require('path')
const log = require('./logger')
const pythonBridge = require('./python-bridge')

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * 鍒嗙墖涓婁紶瑙嗛
 * 
 * @param {string} filePath - 瑙嗛鏂囦欢璺緞
 * @param {string} platform - 鐩爣骞冲彴
 * @param {string} title - 鏍囬
 * @param {{ chunkSize?: number, cookies?: any, description?: string, tags?: string[], onProgress?: Function }} opts
 * @returns {Promise<{success: boolean, videoId?: string, message: string}>}
 */
async function uploadVideo (filePath, platform, title, opts = {}) {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    cookies = '',
    description = '',
    tags = [],
    // eslint-disable-next-line no-unused-vars
    onProgress,
  } = opts
  
  try {
    const fileSize = fs.statSync(filePath).size
    const totalChunks = Math.ceil(fileSize / chunkSize)
    const fileName = path.basename(filePath)
    
    log.info('VideoUploader', `Upload: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)}MB, ${totalChunks} chunks)`)
    
    // 璋冪敤 Python 鍚庣杩涜鍒嗙墖涓婁紶
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
      throw new Error(result.message || '瑙嗛涓婁紶澶辫触')
    }
    
    // eslint-disable-next-line no-unused-vars
    const { videoId, progress } = result.data
    log.info('VideoUploader', `Upload complete: ${videoId}`)
    
    return { success: true, videoId, message: '涓婁紶瀹屾垚' }
  } catch (/** @type {any} */ e) {
    log.error('VideoUploader', `Upload failed: ${e.message}`)
    return { success: false, message: `涓婁紶澶辫触: ${e.message}` }
  }
}

/**
 * 鍙栨秷瑙嗛涓婁紶
 */
/** @param {string} uploadId */
async function cancelUpload (uploadId) {
  try {
    const result = await pythonBridge.requestBackend('POST', `/api/upload/${uploadId}/cancel`)
    return result.code === 0
  } catch (/** @type {any} */ e) {
    log.error('VideoUploader', `Cancel failed: ${e.message}`)
    return false
  }
}

module.exports = {
  uploadVideo,
  cancelUpload,
  DEFAULT_CHUNK_SIZE,
}

