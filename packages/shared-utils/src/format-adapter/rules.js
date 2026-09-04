const logger = require('../logger')
/**
 * 各平台限制常量 — 从 PlatformConfig 加载
 */
const PlatformConfig = require('../platform-config')
const { resolvePlatformConfigPath } = require('../platform-config-path')

// 初始化配置（从 config/platforms.yaml 加载）
const configPath = resolvePlatformConfigPath()
let config = null
try {
  config = new PlatformConfig(configPath)
} catch (e) {
  logger.error('rules', 'Failed to load platform config: ' + e.message)
}

const LIMITS = {}

if (config) {
  for (const p of config.listPlatforms()) {
    LIMITS[p.id] = {
      maxTitle: p.max_title,
      maxContent: p.max_content,
      coverSize: p.cover_size || null,
    }
  }
}

module.exports = { LIMITS }
