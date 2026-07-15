/**
 * @multi-publish/rpa-engine — 入口
 *
 * P2-E: 移除了 Playwright 模块导出，仅保留存活模块。
 * 发布引擎已迁移到 apps/desktop/electron/rpa-view-manager.js。
 *
 * SubTask 15.1: publishers/registry.js 空壳死代码已删除
 * （registry={} 无注册逻辑，所有平台已走 RpaViewManager）。
 */
const platformSelectors = require('./platform-selectors')
const browserData = require('./browser-data')

module.exports = {
  platformSelectors,
  browserData,
}
