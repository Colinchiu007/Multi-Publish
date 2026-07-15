// @ts-check
/**
 * Store — 统一数据存储（SQLite, sql.js via sqlite-wrapper）
 *
 * 替代零散 JSONL 文件，统一管理：
 *   - accounts    账号信息（Cookie/localStorage/账号名）
 *   - publish_history  发布历史
 *   - scheduled_tasks  定时任务
 *   - settings    应用设置
 *   - callback_logs    回调日志（评论/通知等）
 *   - batch_jobs  批量任务
 *   - publish_timeline 发布频率控制
 *   - model_provider_logs 模型供应商调用日志
 *
 * 文件路径: {userData}/multi-publish.db
 *
 * ────────────────────────────────────────────────────────────
 * Phase 3 Task 9 拆分说明（2026-07）：
 *   本文件现仅为 thin re-export，保持 require('./store') 向后兼容。
 *   实际实现按功能域拆分到 store/ 子目录：
 *
 *     store.js                 ← 本文件（facade 入口）
 *     store/index.js           ← Store 类组合（BaseStore + mixins）
 *     store/base-store.js      ← 基础设施：db/生命周期/_safeJson/migrateFromJsonl
 *     store/account-store.js   ← 账号功能域
 *     store/history-store.js   ← 发布历史功能域
 *     store/scheduler-store.js ← 定时任务功能域
 *     store/settings-store.js  ← 设置功能域
 *     store/callback-store.js  ← 回调日志功能域
 *     store/batch-store.js     ← 批量任务功能域
 *     store/rate-limit-store.js ← 发布频率功能域
 *     store/model-log-store.js ← 模型日志功能域
 *
 *   SQLite schema 与数据完全不变；公共 API 通过 Object.assign
 *   mixin 到 prototype，行为与拆分前一致。
 * ────────────────────────────────────────────────────────────
 */
module.exports = require('./store/index')
