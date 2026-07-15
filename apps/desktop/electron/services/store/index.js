// @ts-check
/**
 * Store — 统一数据存储 facade
 *
 * 物理拆分（Phase 3 Task 9）：
 *   - 基础设施（db 连接/生命周期/JSONL 迁移）→ BaseStore
 *   - 8 个功能域方法 → store/<domain>-store.js mixin
 *
 * 通过 Object.assign 把所有 mixin 方法注入 Store.prototype，
 * 保证 require('./store') 返回的接口与拆分前完全一致。
 *
 *   ┌──────────────┐
 *   │  BaseStore   │  init / _createTables / close / _safeJson / migrateFromJsonl
 *   └──────┬───────┘
 *          ▲
 *          │ extends
 *          │
 *   ┌──────┴───────┐  Object.assign(Store.prototype, ...)
 *   │    Store     │  ← account / history / scheduler / settings / callback
 *   └──────────────┘    batch / rate-limit / model-log
 */

const BaseStore = require('./base-store')
const accountMethods = require('./account-store')
const historyMethods = require('./history-store')
const schedulerMethods = require('./scheduler-store')
const settingsMethods = require('./settings-store')
const callbackMethods = require('./callback-store')
const batchMethods = require('./batch-store')
const rateLimitMethods = require('./rate-limit-store')
const modelLogMethods = require('./model-log-store')

class Store extends BaseStore {}

// 把 8 个功能域的方法 mixin 到 Store.prototype
Object.assign(
  Store.prototype,
  accountMethods,
  historyMethods,
  schedulerMethods,
  settingsMethods,
  callbackMethods,
  batchMethods,
  rateLimitMethods,
  modelLogMethods,
)

module.exports = Store
