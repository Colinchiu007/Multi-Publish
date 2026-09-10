const { CollectionStrategy } = require('./collection-strategy')
const { RateLimiter } = require('./rate-limiter')
const { CircuitBreaker } = require('./circuit-breaker')
const { CoolDownPool } = require('./cool-down-pool')
const { ContentCache } = require('./content-cache')
const { AuditLogger } = require('./audit-logger')
const { HealthMonitor } = require('./health-monitor')
const { IdentityBinder } = require('./identity-binder')
const { BaseAdapter } = require('./platform-adapters/base-adapter')
const { WechatMpAdapter } = require('./platform-adapters/wechatmp-adapter')
const { ZhihuAdapter } = require('./platform-adapters/zhihu-adapter')
const { BilibiliAdapter } = require('./platform-adapters/bilibili-adapter')
const { XiaohongshuAdapter } = require('./platform-adapters/xiaohongshu-adapter')
const { DouyinAdapter } = require('./platform-adapters/douyin-adapter')
const { BehaviorSimulator } = require('./behavior-simulator')

module.exports = {
  CollectionStrategy,
  RateLimiter,
  CircuitBreaker,
  CoolDownPool,
  ContentCache,
  AuditLogger,
  HealthMonitor,
  IdentityBinder,
  BaseAdapter,
  WechatMpAdapter,
  ZhihuAdapter,
  BilibiliAdapter,
  XiaohongshuAdapter,
  DouyinAdapter,
  BehaviorSimulator,
}
