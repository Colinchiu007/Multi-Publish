/**
 * ApiModePublisher — API 模式发布适配器包装器
 * 
 * 为 RPA 引擎提供 API 模式发布支持：
 * - 当平台支持 API 模式时，直接使用 HTTP 发布
 * - API 失败时回退到 RPA 模式
 * - 统一接口：所有发布器类共享 publish 方法
 */
const { isApiPlatform, publishViaApi, getApiPlatforms } = require('../api-platform-adapter')
const { getPublisherClass } = require('./registry')
const log = require('./logger')

/**
 * 创建混合发布器（API + RPA 回退）
 * 
 * @param {string} platform - 平台标识
 * @returns {class} 发布器类
 */
class ApiModePublisher {
  constructor (options = {}) {
    this.platform = options.platform
    this.rpaPublisherClass = getPublisherClass(options.platform)
    this.useApi = isApiPlatform(options.platform)
  }
  
  /**
   * 发布文章（先尝试 API，失败回退 RPA）
   */
  async publish (task) {
    const { article, account } = task
    
    if (this.useApi && account?.cookies) {
      try {
        log.info('ApiModePublisher', `Trying API mode for ${this.platform}`)
        const result = await publishViaApi(this.platform, {
          title: article.title,
          content: article.content || article.description || '',
          images: article.images || [],
          video: article.video,
          tags: article.tags || [],
          cookies: account.cookies,
        })
        
        if (result.success) {
          log.info('ApiModePublisher', `API mode success for ${this.platform}`)
          return {
            success: true,
            postId: result.postId,
            message: result.message,
            mode: 'api',
          }
        }
      } catch (e) {
        log.warn('ApiModePublisher', `API mode failed, falling back to RPA: ${e.message}`)
      }
    }
    
    // 回退到 RPA 模式
    log.info('ApiModePublisher', `Using RPA mode for ${this.platform}`)
    const RpaPublisher = this.rpaPublisherClass
    const rpaInstance = new RpaPublisher()
    return await rpaInstance.publish(task)
  }
}

/**
 * 获取混合发布器
 */
function getApiModePublisher (platform) {
  return new ApiModePublisher({ platform })
}

module.exports = {
  ApiModePublisher,
  getApiModePublisher,
  isApiPlatform,
  getApiPlatforms,
}
