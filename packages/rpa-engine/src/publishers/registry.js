/**
 * 发布器注册中心（已废弃）
 *
 * P2-E: 所有平台已迁移到 RpaViewManager（executeJavaScript 引擎），
 * 不再使用独立 *-rpa.js 文件发布器。
 * 此模块仅保持 require 兼容，新代码请直接使用 RpaViewManager。
 */
const { ApiModePublisher } = require('./api-mode-publisher')

const registry = {
  wechat_mp:    ApiModePublisher,
  zhihu:        ApiModePublisher,
  weibo:        ApiModePublisher,
  douyin:       ApiModePublisher,
  xiaohongshu:  ApiModePublisher,
  tencent_video:ApiModePublisher,
  kuaishou:     ApiModePublisher,
  toutiao:      ApiModePublisher,
  youtube:      ApiModePublisher,
  tiktok:       ApiModePublisher,
  bilibili:     ApiModePublisher,
  baijiahao:    ApiModePublisher,
  twitter:      ApiModePublisher,
  instagram:    ApiModePublisher,
  facebook:     ApiModePublisher,
}

function getPublisherClass (platform) {
  const Cls = registry[platform]
  if (!Cls) throw new Error(`未知平台: ${platform}`)
  return Cls
}

function listPlatforms () {
  return Object.keys(registry)
}

module.exports = { registry, getPublisherClass, listPlatforms }
