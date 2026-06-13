/**
 * 各平台限制常量 — 从 PlatformConfig 加载
 */
const path = require('path')
const PlatformConfig = require('../platform-config')

// 初始化配置（从 config/platforms.yaml 加载）
const configPath = path.resolve(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')
let config = null
try {
  config = new PlatformConfig(configPath)
} catch (e) {
  console.error('[rules] Failed to load platform config:', e.message)
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
