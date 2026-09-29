// 渲染端（vite dev / build）使用的 ESM 审核状态机孪生文件。
// 主进程仍使用 publish-audit-status.js（CommonJS），避免改变 Node 端契约。
// 函数层与 CJS 版逐字对齐；漂移由
// packages/shared-utils/src/__tests__/publish-audit-status.test.js 的 parity 回归拦截
// （对齐 publish-capabilities / safe-http-url 孪生先例）。
// 口径与存在理由见 publish-audit-status.js 头注释与
// 01-docs/PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md §四 P0-1。

export const AUDIT_STATUSES = Object.freeze([
  'published',
  'inAudit',
  'prePublish',
  'deny',
  'notPublic',
  'withdrawn',
  'transferFail',
])

export const AUDIT_ALERT_STATUSES = Object.freeze(['deny', 'withdrawn', 'transferFail'])

const MONITOR_STATUS_TO_AUDIT = Object.freeze({
  published: 'published',
  reviewed: 'inAudit',
  rejected: 'deny',
  draft: 'prePublish',
})

export function mapMonitorStatusToAuditStatus (monitorStatus) {
  const key = typeof monitorStatus === 'string' ? monitorStatus.trim().toLowerCase() : ''
  if (!key) return null
  return Object.prototype.hasOwnProperty.call(MONITOR_STATUS_TO_AUDIT, key)
    ? MONITOR_STATUS_TO_AUDIT[key]
    : null
}

export function normalizeAuditStatus (value) {
  const key = typeof value === 'string' ? value.trim() : ''
  return AUDIT_STATUSES.includes(key) ? key : null
}

export function isAuditAlertStatus (value) {
  const key = normalizeAuditStatus(value)
  return key !== null && AUDIT_ALERT_STATUSES.includes(key)
}

export function auditStatusLabelKey (value) {
  const key = normalizeAuditStatus(value)
  return key === null ? null : 'historyPage.auditStatus.' + key
}

export const AUDIT_PATCH_KEYS = Object.freeze(['auditStatus', 'monitorStatus', 'platformWorkId', 'auditedAt'])

export function buildAuditPatch (monitorResult, nowIso) {
  const result = monitorResult && typeof monitorResult === 'object' ? monitorResult : {}
  const auditStatus = mapMonitorStatusToAuditStatus(result.status)
  if (auditStatus === null) return null
  const postId = result.postId == null ? '' : String(result.postId).trim()
  return {
    auditStatus,
    monitorStatus: String(result.status || '').trim(),
    platformWorkId: postId,
    auditedAt: typeof nowIso === 'string' && nowIso ? nowIso : new Date().toISOString(),
  }
}
