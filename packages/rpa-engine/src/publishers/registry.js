/**
 * 发布器注册中心（已废弃）
 *
 * P2-E: 所有平台已迁移到 RpaViewManager（executeJavaScript 引擎），
 * 不再使用独立 *-rpa.js 文件发布器。
 * 此模块仅保持 require 兼容，新代码请直接使用 RpaViewManager。
 */

// ApiModePublisher 已在 P2-E 清理中移除，所有平台统一走 RpaViewManager
const registry = {}

function getPublisherClass (platform) {
  const Cls = registry[platform]
  if (!Cls) throw new Error(`未知平台: ${platform}`)
  return Cls
}

function listPlatforms () {
  return Object.keys(registry)
}

module.exports = { registry, getPublisherClass, listPlatforms }
