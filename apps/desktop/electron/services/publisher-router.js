/**
 * PublisherRouter — 统一发布路由
 *
 * 替代 main.js 三段 if/else 路由，集中管理平台到发布引擎的映射。
 * 平台信息从 config/platforms.yaml 加载（单数据源）。
 *
 * 发布模式：
 *   rpa_vm     — RpaViewManager（executeJavaScript 隐藏浏览器）
 *   backend    — Python FastAPI 后端（预留）
 *
 * 文件位置: apps/desktop/electron/publisher-router.js
 */
const path = require('path')
const PlatformConfig = require('@multi-publish/shared-utils/src/platform-config')

// ─── 路由表（硬约束）────────────────────────────────────
// mode: 发布引擎
//   'rpa_vm'  → RpaViewManager（executeJavaScript 引擎，当前唯一模式）
//   'backend' → Python 后端（预留）
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
  // ── 预留 ──
  // shipinhao: { mode: 'backend', timeout: 300000 },
}

// ─── 两种 Publisher 策略 ─────────────────────────────────

class RpaVmPublisher {
  constructor (route, deps) {
    this.route = route
    this.rpaViewManager = deps.rpaViewManager
    this.store = deps.store
  }

  async publish (task) {
    const platform = this.route.platform

    // 加载账号 Cookie
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
    throw new Error(result.error || 'RPA 发布失败')
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
    throw new Error(result.message || (result.data?.error || '发布失败'))
  }
}

// ─── Router 主类 ─────────────────────────────────────────

class PublisherRouter {
  /**
   * @param {string} [configPath] - platforms.yaml 路径，默认从项目根目录加载
   */
  constructor (configPath) {
    const resolvedPath = configPath || path.join(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')
    this._platformConfig = new PlatformConfig(resolvedPath)
    this._routeTable = ROUTE_TABLE
  }

  /**
   * 获取平台的路由信息
   * @param {string} platform
   * @returns {{ platform: string, mode: string, timeout: number, type: string, publishUrl: string }}
   */
  getRoute (platform) {
    const cfg = this._platformConfig.getPlatform(platform)
    if (!cfg) throw new Error(`平台未配置: ${platform}`)

    const route = this._routeTable[platform]
    if (!route) throw new Error(`平台 ${platform} 无路由定义，请在 ROUTE_TABLE 中添加`)

    return {
      platform,
      mode: route.mode,
      timeout: route.timeout,
      type: cfg.type || 'article',
      publishUrl: cfg.publish_url || '',
    }
  }

  /**
   * 获取平台配置
   */
  getPlatformConfig (platform) {
    return this._platformConfig.getPlatform(platform)
  }

  /**
   * 列出所有平台
   */
  listPlatforms () {
    return this._platformConfig.listPlatforms()
  }

  /**
   * 创建平台对应的发布器实例
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
        throw new Error(`未知发布模式: ${route.mode} (${platform})`)
    }
  }

  /**
   * 获取路由表（只读，用于调试）
   */
  getRouteTable () {
    return { ...this._routeTable }
  }
}

module.exports = { PublisherRouter, ROUTE_TABLE }