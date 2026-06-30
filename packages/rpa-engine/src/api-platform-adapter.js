/**
 * APIPlatformAdapter — API 模式发布适配器
 * 
 * 基于蚁小二逆向工程的 API 模式发布：
 * - 使用 axios + FormData 直接 HTTP 发布
 * - 适用于微博、抖音、B站、知乎等提供 API 的平台
 * - 与 RPA 模式并行，根据平台配置自动选择
 * 
 * 文件位置: packages/rpa-engine/src/api-platform-adapter.js（规范源）
 */
const axios = require('axios')
const FormData = require('form-data')
const fs = require('fs')
const path = require('path')
const log = require('@multi-publish/shared-utils/src/logger')

// 平台 API 配置
const PLATFORM_API_CONFIG = {
  weibo: {
    name: '微博',
    baseUrl: 'https://weibo.com',
    uploadUrl: 'https://weibo.com/aj/welady/upload',
    publishUrl: 'https://weibo.com/ajax.php/statuses/post',
    authHeader: 'Cookie',
  },
  douyin: {
    name: '抖音',
    baseUrl: 'https://creator.douyin.com',
    uploadUrl: 'https://creator.douyin.com/web/api/media/upload/auth/v5/',
    publishUrl: 'https://creator.douyin.com/web/api/media/aweme/post/',
    authHeader: 'Cookie',
  },
  bilibili: {
    name: 'B站',
    baseUrl: 'https://member.bilibili.com',
    uploadUrl: 'https://member.bilibili.com/preupload',
    publishUrl: 'https://member.bilibili.com/x4/web-interface/archive/create',
    authHeader: 'Cookie',
  },
  zhihu: {
    name: '知乎',
    baseUrl: 'https://www.zhihu.com',
    publishUrl: 'https://www.zhihu.com/api/v4/articles',
    authHeader: 'Cookie',
  },
}

/**
 * 执行 API 模式发布
 * 
 * @param {string} platform - 平台名
 * @param {object} params - { cookies, title, content, images[], video?, tags[] }
 * @returns {Promise<{success: boolean, postId?: string, message: string}>}
 */
async function publishViaApi (platform, params) {
  const config = PLATFORM_API_CONFIG[platform]
  if (!config) {
    return { success: false, message: `不支持的 API 平台: ${platform}` }
  }
  
  try {
    log.info('APIPlatformAdapter', `Starting API publish for ${config.name}`)
    
    const formData = new FormData()
    formData.append('title', params.title || '')
    formData.append('content', params.content || '')
    if (params.tags && params.tags.length) {
      formData.append('tags', JSON.stringify(params.tags))
    }
    
    // 上传文件
    if (params.images && params.images.length) {
      for (const img of params.images) {
        const fileBuffer = fs.readFileSync(img)
        formData.append('images', fileBuffer, {
          filename: path.basename(img),
          contentType: 'image/jpeg',
        })
      }
    }
    
    // 上传视频
    if (params.video) {
      const videoBuffer = fs.readFileSync(params.video)
      formData.append('video', videoBuffer, {
        filename: path.basename(params.video),
        contentType: 'video/mp4',
      })
    }
    
    // 构建请求头
    const headers = {
      ...formData.getHeaders(),
      [config.authHeader]: params.cookies || '',
    }
    
    // 发送请求
    const response = await axios.post(
      config.publishUrl,
      formData,
      {
        headers,
        timeout: 60000,
        maxContentLength: 100 * 1024 * 1024, // 100MB
      }
    )
    
    if (response.data?.code === 0 || response.data?.success) {
      const postId = response.data?.data?.id || response.data?.data?.article_id || response.data?.id
      log.info('APIPlatformAdapter', `${config.name} publish success, postId=${postId}`)
      return { success: true, postId, message: '发布成功' }
    }
    
    return {
      success: false,
      message: response.data?.message || response.data?.error || '发布失败',
      raw: response.data,
    }
  } catch (e) {
    log.error('APIPlatformAdapter', `${config.name} publish failed: ${e.message}`)
    if (e.response) {
      log.error('APIPlatformAdapter', `HTTP ${e.response.status}: ${e.response.data?.message}`)
      // 401/403 = 登录失效
      if (e.response.status === 401 || e.response.status === 403) {
        return { success: false, message: '登录已失效，请重新登录', needRelogin: true }
      }
    }
    return { success: false, message: `发布失败: ${e.message}` }
  }
}

/**
 * 大文件分片上传
 * 
 * @param {string} platform - 平台
 * @param {string} filePath - 文件路径
 * @param {object} params - { cookies, chunkSize, ... }
 * @returns {Promise<{success: boolean, fileId?: string, message: string}>}
 */
async function uploadChunked (platform, filePath, params = {}) {
  const config = PLATFORM_API_CONFIG[platform]
  if (!config) {
    return { success: false, message: `不支持的平台: ${platform}` }
  }
  
  try {
    const fileSize = fs.statSync(filePath).size
    const chunkSize = params.chunkSize || 10 * 1024 * 1024 // 10MB default
    const chunks = Math.ceil(fileSize / chunkSize)
    
    log.info('APIPlatformAdapter', `Chunked upload: ${filePath} (${(fileSize / 1024 / 1024).toFixed(1)}MB, ${chunks} chunks)`)
    
    // 创建上传任务
    const initResponse = await axios.post(
      config.uploadUrl + '/init',
      { filename: path.basename(filePath), size: fileSize },
      {
        headers: { [config.authHeader]: params.cookies || '' },
        timeout: 30000,
      }
    )
    
    const fileId = initResponse.data?.fileId || initResponse.data?.data?.file_id
    
    // 分片上传
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, fileSize)
      const chunkData = fs.readFileSync(filePath, { start, end })
      
      const chunkForm = new FormData()
      chunkForm.append('chunk', chunkData, {
        filename: `${path.basename(filePath)}.chunk.${i}`,
        contentType: 'application/octet-stream',
      })
      chunkForm.append('fileId', fileId)
      chunkForm.append('chunkIndex', i)
      chunkForm.append('totalChunks', chunks)
      
      await axios.post(config.uploadUrl + '/chunk', chunkForm, {
        headers: {
          ...chunkForm.getHeaders(),
          [config.authHeader]: params.cookies || '',
        },
        timeout: 30000,
      })
    }
    
    log.info('APIPlatformAdapter', `Chunked upload complete: ${fileId}`)
    return { success: true, fileId, message: '上传完成' }
  } catch (e) {
    log.error('APIPlatformAdapter', `Chunked upload failed: ${e.message}`)
    return { success: false, message: `上传失败: ${e.message}` }
  }
}

/**
 * 检查 API 平台是否可用
 */
function isApiPlatform (platform) {
  return !!PLATFORM_API_CONFIG[platform]
}

/**
 * 获取所有 API 平台列表
 */
function getApiPlatforms () {
  return Object.keys(PLATFORM_API_CONFIG)
}

module.exports = {
  publishViaApi,
  uploadChunked,
  isApiPlatform,
  getApiPlatforms,
  PLATFORM_API_CONFIG,
}
