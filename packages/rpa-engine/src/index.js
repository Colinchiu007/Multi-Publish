/**
 * @multi-publish/rpa-engine — 入口
 * 导出 RPA 发布器引擎的公共 API
 */
const playwrightManager = require('./playwright-manager')
const BaseRPAPublisher = require('./publishers/base-rpa-publisher')
const registry = require('./publishers/registry')
const cookieStore = require('./cookie-store')

module.exports = {
  ...playwrightManager,
  BaseRPAPublisher,
  registry,
  cookieStore,
  // 便捷访问
  getPublisherClass: registry.getPublisherClass,
  listPlatforms: registry.listPlatforms
}
