// @ts-check
'use strict'

/**
 * publish-helpers.js — 发布 IPC handlers 的局部工具闭包工厂。
 *
 * 从 ipc-handlers/publish.js 抽离的纯函数式工具：路径段校验、统一 IPC 日志、
 * 文章摘要。它们只依赖注入的 log，无其它模块副作用，便于复用与压低 publish.js
 * 行数（维持债务熔断门禁 <500 行）。
 *
 * 不破坏既有导出面：publish.js 仍导出 registerHandlers；
 * helpers.js（wrapIpcHandler / withSenderCheck / EC）保持不变，本工厂是独立文件。
 *
 * 归属主体判定（getOwnerSubject）**不在本工厂**：它的唯一实现是
 * helpers.resolveIpcOwnerSubject（QM-6 后端轴 FB5，曾有三份逐字同逻辑的拷贝），
 * 抽取本模块时若在工厂里再写一份就变成第四份，由
 * owner-subject-single-source.test.js 的结构锁拦截。调用点在 publish.js 直接转发。
 */

/**
 * @param {object} deps
 * @param {object} [deps.log] 提供 info/warn/error 方法的日志对象
 * @returns {{
 *   isSafePathSegment: (value: unknown) => boolean,
 *   ipcLog: (level: string, channel: string, stage: string, detail?: string) => void,
 *   summarizeArticle: (article: unknown) => string,
 * }}
 */
function createPublishHelpers({ log } = {}) {
  // 平台和账号标识会进入发布路由及下游 URL，只允许单一路径段。
  function isSafePathSegment(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value)
  }

  // 统一 IPC 日志标准：每个 handler 记录进入/校验/结果/错误，含耗时与关键参数（脱敏由 logger 统一处理）
  function ipcLog(level, channel, stage, detail) {
    if (log && typeof log[level] === 'function') {
      log[level]('PublishIPC', `${channel} ${stage}${detail ? ' :: ' + detail : ''}`)
    }
  }

  function summarizeArticle(article) {
    if (!article || typeof article !== 'object') return 'article=<缺失>'
    const parts = []
    if (typeof article.title === 'string' && article.title) parts.push(`title="${article.title.slice(0, 50)}"`)
    if (typeof article.video_path === 'string' && article.video_path) parts.push(`video="${article.video_path.slice(-60)}"`)
    if (typeof article.cover_path === 'string' && article.cover_path) parts.push(`cover="${article.cover_path.slice(-60)}"`)
    if (typeof article.accountId === 'string' && article.accountId) parts.push(`accountId=${article.accountId}`)
    if (Array.isArray(article.tags) && article.tags.length) parts.push(`tags=${article.tags.length}`)
    if (!parts.length) parts.push('无关键字段')
    return parts.join(' | ')
  }

  return { isSafePathSegment, ipcLog, summarizeArticle }
}

module.exports = { createPublishHelpers }
