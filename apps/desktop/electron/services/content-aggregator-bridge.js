/**
 * ContentAggregatorBridge — 内容采集桥接
 * 
 * 对接 shared_modules 的 Python 内容采集引擎：
 * - 调用 Python API 采集文章/视频
 * - 自动过滤重复内容
 * - 支持多平台内容聚合
 * 
 * 文件位置: apps/desktop/electron/content-aggregator-bridge.js
 */
const log = require('./logger')
const pythonBridge = require('./python-bridge')

/**
 * 采集指定平台的内容
 * 
 * @param {object} params - { platform, keyword, maxResults, dateRange }
 * @returns {Promise<Array>} 内容列表
 */
async function collectContent (params) {
  try {
    log.info('ContentAggregatorBridge', `Collecting from ${params.platform}: ${params.keyword}`)
    
    const result = await pythonBridge.requestBackend('POST', '/api/content/collect', {
      platform: params.platform,
      keyword: params.keyword,
      max_results: params.maxResults || 20,
      date_range: params.dateRange || '7d',
    })
    
    if (result.code !== 0) {
      throw new Error(result.message || '采集失败')
    }
    
    const items = result.data?.items || result.data?.results || []
    log.info('ContentAggregatorBridge', `Collected ${items.length} items from ${params.platform}`)
    return items
  } catch (e) {
    log.error('ContentAggregatorBridge', `Collection failed: ${e.message}`)
    throw e
  }
}

/**
 * 获取已采集的内容列表
 */
async function getCollectedContent (params = {}) {
  try {
    const result = await pythonBridge.requestBackend('GET', '/api/content/history', {
      params: {
        platform: params.platform,
        limit: params.limit || 50,
        offset: params.offset || 0,
      },
    })
    
    if (result.code !== 0) {
      return { items: [], total: 0 }
    }
    
    return {
      items: result.data?.items || [],
      total: result.data?.total || 0,
    }
  } catch (e) {
    log.error('ContentAggregatorBridge', `Failed to get history: ${e.message}`)
    return { items: [], total: 0 }
  }
}

/**
 * 删除已采集的内容
 */
async function deleteCollectedContent (contentId) {
  try {
    const result = await pythonBridge.requestBackend('DELETE', `/api/content/${contentId}`)
    return result.code === 0
  } catch (e) {
    log.error('ContentAggregatorBridge', `Failed to delete: ${e.message}`)
    return false
  }
}

/**
 * 检查采集服务是否可用
 */
async function isAvailable () {
  try {
    const result = await pythonBridge.requestBackend('GET', '/api/content/status')
    return result.code === 0
  } catch {
    return false
  }
}

module.exports = {
  collectContent,
  getCollectedContent,
  deleteCollectedContent,
  isAvailable,
}
