/**
 * PlatformConfig — 平台配置加载器
 *
 * 从 config/platforms.yaml 加载所有平台信息，
 * 替代散落在各处的硬编码平台数据。
 *
 * 用法:
 *   const PlatformConfig = require('./platform-config')
 *   const config = new PlatformConfig('/path/to/platforms.yaml')
 *   config.listPlatforms()       // → 所有平台列表
 *   config.getPlatform('weibo') // → { id, name, type, ... }
 *   config.getCoverSize('weibo') // → { width, height }
 */
const fs = require('fs')
const path = require('path')

class PlatformConfig {
  /**
   * @param {string} configPath - 配置文件路径
   */
  constructor (configPath) {
    if (!configPath) {
      throw new Error('PlatformConfig: configPath is required')
    }
    if (!fs.existsSync(configPath)) {
      throw new Error(`PlatformConfig: 配置文件不存在: ${configPath}`)
    }

    this._configPath = configPath
    this._platforms = null
    this._load()
  }

  /**
   * 加载 YAML 配置文件
   */
  _load () {
    const yaml = require('js-yaml')
    const content = fs.readFileSync(this._configPath, 'utf-8')
    const doc = yaml.load(content)

    if (!doc || !doc.platforms || typeof doc.platforms !== 'object') {
      throw new Error('PlatformConfig: 配置格式错误，缺少 platforms 字段')
    }

    this._platforms = new Map()

    for (const [id, cfg] of Object.entries(doc.platforms)) {
      cfg.id = id
      // 解析 cover_size "900x500" → { width: 900, height: 500 }
      if (cfg.cover_size && typeof cfg.cover_size === 'string') {
        const parts = cfg.cover_size.split('x').map(Number)
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          cfg._coverSizeParsed = { width: parts[0], height: parts[1] }
        }
      }
      this._platforms.set(id, cfg)
    }

    if (this._platforms.size === 0) {
      throw new Error('PlatformConfig: 配置中没有定义任何平台')
    }
  }

  /**
   * 获取所有平台列表
   * @returns {Array<object>}
   */
  listPlatforms () {
    return Array.from(this._platforms.values())
  }

  /**
   * 获取单个平台配置
   * @param {string} id - 平台标识
   * @returns {object|null}
   */
  getPlatform (id) {
    return this._platforms.get(id) || null
  }

  /**
   * 获取平台数据同步 URL
   * @param {string} platform
   * @returns {string|null}
   */
  getDataUrl (platform) {
    const p = this.getPlatform(platform)
    return p ? (p.data_url || null) : null
  }

  /**
   * 获取平台评论管理 URL
   * @param {string} platform
   * @returns {string|null}
   */
  getCommentUrl (platform) {
    const p = this.getPlatform(platform)
    return p ? (p.comment_url || null) : null
  }

  /**
   * 获取平台封面图推荐尺寸
   * @param {string} platform
   * @returns {{ width: number, height: number }|null}
   */
  getCoverSize (platform) {
    const p = this.getPlatform(platform)
    return p ? (p._coverSizeParsed || null) : null
  }

  /**
   * 获取平台标题最大长度
   * @param {string} platform
   * @returns {number|null}
   */
  getMaxTitle (platform) {
    const p = this.getPlatform(platform)
    return p ? (p.max_title || null) : null
  }

  /**
   * 获取平台内容最大长度
   * @param {string} platform
   * @returns {number|null}
   */
  getMaxContent (platform) {
    const p = this.getPlatform(platform)
    return p ? (p.max_content || null) : null
  }

  /**
   * 获取平台分类
   * @returns {Array<string>}
   */
  getCategories () {
    const cats = new Set()
    for (const p of this._platforms.values()) {
      if (p.category) cats.add(p.category)
    }
    return Array.from(cats)
  }

  /**
   * 按分类获取平台列表
   * @param {string} category
   * @returns {Array<object>}
   */
  getPlatformsByCategory (category) {
    return this.listPlatforms().filter(p => p.category === category)
  }
}

module.exports = PlatformConfig
