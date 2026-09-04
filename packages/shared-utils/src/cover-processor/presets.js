const logger = require('../logger')
/**
 * 各平台封面图预设 — 从 PlatformConfig 加载
 */
const PlatformConfig = require('../platform-config')
const { resolvePlatformConfigPath } = require('../platform-config-path')

const configPath = resolvePlatformConfigPath()
let config = null
try {
  config = new PlatformConfig(configPath)
} catch (e) {
  logger.error('presets', 'Failed to load platform config: ' + e.message)
}

const PRESETS = {}

if (config) {
  for (const p of config.listPlatforms()) {
    const size = config.getCoverSize(p.id)
    if (size) {
      PRESETS[p.id] = {
        width: size.width,
        height: size.height,
        format: 'jpeg',
        maxSize: 10 * 1024 * 1024,  // 默认 10MB
        quality: 85,
        label: `${size.width}x${size.height}`,
      }
    }
  }
}

module.exports = { PRESETS }
