/**
 * @multi-publish/rpa-engine — 入口
 *
 * P2-E: 移除了 Playwright 模块导出，仅保留存活模块。
 * 发布引擎已迁移到 apps/desktop/electron/rpa-view-manager.js。
 */
const registry = require('./publishers/registry')
const platformSelectors = require('./platform-selectors')
const browserData = require('./browser-data')

module.exports = {
  registry,
  platformSelectors,
  browserData,
  // 便捷访问
  getPublisherClass: registry.getPublisherClass,
  listPlatforms: registry.listPlatforms,
}
