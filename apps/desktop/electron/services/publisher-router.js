// @ts-check
/**
 * PublisherRouter 鈥?缁熶竴鍙戝竷璺敱
 *
 * 鏇夸唬 main.js 涓夋 if/else 璺敱锛岄泦涓鐞嗗钩鍙板埌鍙戝竷寮曟搸鐨勬槧灏勩€?
 * 骞冲彴淇℃伅浠?config/platforms.yaml 鍔犺浇锛堝崟鏁版嵁婧愶級銆?
 *
 * 鍙戝竷妯″紡锛?
 *   rpa_vm     鈥?RpaViewManager锛坋xecuteJavaScript 闅愯棌娴忚鍣級
 *   backend    鈥?Python FastAPI 鍚庣锛堥鐣欙級
 *
 * 鏂囦欢浣嶇疆: apps/desktop/electron/publisher-router.js
 */
const path = require('path')
const PlatformConfig = require('@multi-publish/shared-utils/src/platform-config')

// 鈹€鈹€鈹€ 璺敱琛紙纭害鏉燂級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// mode: 鍙戝竷寮曟搸
//   'rpa_vm'  鈫?RpaViewManager锛坋xecuteJavaScript 寮曟搸锛屽綋鍓嶅敮涓€妯″紡锛?
//   'backend' 鈫?Python 鍚庣锛堥鐣欙級
const ROUTE_TABLE = {
  wechat_mp:    { mode: 'rpa_vm', timeout: 120000 },
  zhihu:        { mode: 'rpa_vm', timeout: 120000 },
  weibo:        { mode: 'rpa_vm', timeout: 120000 },
  douyin:       { mode: 'rpa_vm', timeout: 300000 },
  xiaohongshu:  { mode: 'rpa_vm', timeout: 120000 },
  tencent_video:{ mode: 'rpa_vm', timeout: 300000 },
  kuaishou:     { mode: 'rpa_vm', timeout: 300000 },
  toutiao:      { mode: 'rpa_vm', timeout: 120000 },
  bilibili:     { mode: 'rpa_vm', timeout: 300000 },
  baijiahao:    { mode: 'rpa_vm', timeout: 120000 },
  youtube:      { mode: 'rpa_vm', timeout: 300000 },
  tiktok:       { mode: 'rpa_vm', timeout: 300000 },
  twitter:      { mode: 'rpa_vm', timeout: 120000 },
  instagram:    { mode: 'rpa_vm', timeout: 120000 },
  facebook:     { mode: 'rpa_vm', timeout: 120000 },
  // 鈹€鈹€ 棰勭暀 鈹€鈹€
  // shipinhao: { mode: 'backend', timeout: 300000 },
}

// 鈹€鈹€鈹€ 涓ょ Publisher 绛栫暐 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

class RpaVmPublisher {
  constructor (route, deps) {
    this.route = route
    this.rpaViewManager = deps.rpaViewManager
    this.store = deps.store
  }

  async publish (task) {
    const platform = this.route.platform

    // 鍔犺浇璐﹀彿 Cookie
    const accountId = task.article?.accountId || task.accountId
    let authData = { cookies: [] }
    if (accountId) {
      const account = this.store.getAccount(accountId)
      if (account?.cookies?.length > 0) {
        authData = { cookies: account.cookies, localStorage: account.local_storage }
      }
    } else {
      const defaultAccount = this.store.getDefaultAccount(platform)
      if (defaultAccount?.cookies) {
        authData = { cookies: defaultAccount.cookies, localStorage: defaultAccount.local_storage }
      }
    }

    const article = {
      title: task.article?.title || '',
      content: task.article?.content || '',
      video_path: task.article?.video_path || (task.article?.media_paths?.[0] ?? null),
      cover_path: task.article?.cover_url || task.article?.cover_path || null,
      tags: task.article?.tags || [],
      draft: task.article?.draft || false,
    }

    const result = await this.rpaViewManager.publish(platform, article, authData, this.route.timeout)
    if (result.success) {
      return { success: true, url: result.url || '', postId: task.id, platform }
    }
    throw new Error(result.error || 'RPA 鍙戝竷澶辫触')
  }
}

class BackendPublisher {
  constructor (route, deps) {
    this.route = route
    this.pythonBridge = deps.pythonBridge
  }

  async publish (task) {
    const platform = this.route.platform
    const body = {
      title: task.article?.title || '',
      content: task.article?.content || '',
      platform,
      media_paths: task.article?.video_path
        ? [task.article.video_path]
        : (task.article?.media_paths || []),
      cover_path: task.article?.cover_url || task.article?.cover_path || null,
      tags: task.article?.tags || [],
      draft: task.article?.draft || false,
    }

    const result = await this.pythonBridge.requestBackend('POST', '/api/publish', body)
    if (result.code === 0 && result.data?.success) {
      return { success: true, url: result.data.url || '', postId: result.data.task_id || task.id, platform }
    }
    throw new Error(result.message || (result.data?.error || '鍙戝竷澶辫触'))
  }
}

// 鈹€鈹€鈹€ Router 涓荤被 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

class PublisherRouter {
  /**
   * @param {string} [configPath] - platforms.yaml 璺緞锛岄粯璁や粠椤圭洰鏍圭洰褰曞姞杞?
   */
  constructor (configPath) {
    const resolvedPath = configPath || path.join(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')
    this._platformConfig = new PlatformConfig(resolvedPath)
    this._routeTable = ROUTE_TABLE
  }

  /**
   * 鑾峰彇骞冲彴鐨勮矾鐢变俊鎭?
   * @param {string} platform
   * @returns {{ platform: string, mode: string, timeout: number, type: string, publishUrl: string }}
   */
  getRoute (platform) {
    const cfg = this._platformConfig.getPlatform(platform)
    if (!cfg) throw new Error("Platform not configured: " + platform)

    const route = this._routeTable[platform]
    if (!route) throw new Error('Platform ' + platform + ' no route defined, please add in ROUTE_TABLE')

    return {
      platform,
      mode: route.mode,
      timeout: route.timeout,
      type: cfg.type || 'article',
      publishUrl: cfg.publish_url || '',
    }
  }

  /**
   * 鑾峰彇骞冲彴閰嶇疆
   */
  getPlatformConfig (platform) {
    return this._platformConfig.getPlatform(platform)
  }

  /**
   * 鍒楀嚭鎵€鏈夊钩鍙?
   */
  listPlatforms () {
    return this._platformConfig.listPlatforms()
  }

  /**
   * 鍒涘缓骞冲彴瀵瑰簲鐨勫彂甯冨櫒瀹炰緥
   *
   * @param {string} platform
   * @param {object} deps - { rpaViewManager, store, pythonBridge }
   * @returns {object} { publish(task): Promise<object> }
   */
  createPublisher (platform, deps) {
    const route = this.getRoute(platform)

    switch (route.mode) {
      case 'rpa_vm':
        return new RpaVmPublisher(route, deps)
      case 'backend':
        return new BackendPublisher(route, deps)
      default:
        throw new Error("Unknown publish mode: " + route.mode + " (" + platform + ")")
    }
  }

  /**
   * 鑾峰彇璺敱琛紙鍙锛岀敤浜庤皟璇曪級
   */
  getRouteTable () {
    return { ...this._routeTable }
  }
}

module.exports = { PublisherRouter, ROUTE_TABLE }


