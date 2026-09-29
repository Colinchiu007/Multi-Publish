'use strict'
/**
 * publish-audit-status.js — 发布后审核状态机（单一真源，主进程侧 CJS）
 *
 * 存在理由（01-docs/PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md §四 P0-1）：
 * 发布「成功」只代表平台受理了提交，之后内容仍可能被审核拒绝（deny）、
 * 转码失败（transferFail）或下线（withdrawn）——当前发布历史只有 success/failed
 * 两态，「发布后的世界」对用户完全不可见。本模块定义审核状态枚举与
 * 监控状态→审核状态的映射，作为主进程与渲染层共用的唯一真源
 * （渲染端消费 publish-audit-status.browser.js 孪生版）。
 *
 * 枚举裁剪自参考产品 16 态审核模型（published/inAudit/prePublish/deny/
 * notPublic/notSuitableForPublicity/customWithdrawn/draft/executeFail/waitExecute
 * 等），只保留本仓有取证路径的子集；未取证的状态不造字段。
 *
 * ⛔ 单向证据规则（与 packages/shared-utils/src/login-state.js 同族）：
 * 只有**平台给出明确结论**的监控状态才映射为审核状态；`null` 表示本轮无定论
 * （error/timeout/skipped/pending/unknown），调用点必须**保持原记录不变**——
 * 「没拿到新证据」不是反证，不得把既有 auditStatus 抹成 unknown。
 */

/** 审核状态枚举（本仓有取证路径的子集）。 */
const AUDIT_STATUSES = Object.freeze([
  'published', // 已发布/已上线
  'inAudit', // 审核中
  'prePublish', // 待发布（草稿/定时未到）
  'deny', // 审核不通过/被拒
  'notPublic', // 未公开（仅自己可见）
  'withdrawn', // 已下线/已删除
  'transferFail', // 转码/处理失败（视频类）
])

/** 需要醒目提醒的状态（拒绝/下线/转码失败）：历史列表标红并给出处置指引。 */
const AUDIT_ALERT_STATUSES = Object.freeze(['deny', 'withdrawn', 'transferFail'])

/**
 * 监控状态 → 审核状态映射（只含**平台明确结论**）。
 * 监控侧可能取值（见 electron/services/publish-monitor.js）：published /
 * reviewed / rejected / draft / failed / timeout / error / skipped /
 * pending / unknown。未列入本表的取值一律返回 null（无定论，不改写真源）。
 */
const MONITOR_STATUS_TO_AUDIT = Object.freeze({
  published: 'published',
  reviewed: 'inAudit',
  rejected: 'deny',
  draft: 'prePublish',
})

/**
 * 监控状态映射为审核状态。
 * @param {unknown} monitorStatus
 * @returns {'published'|'inAudit'|'prePublish'|'deny'|null} null 表示本轮无定论
 *   （含 error/timeout/skipped/pending/unknown/failed 及一切未知取值）
 */
function mapMonitorStatusToAuditStatus (monitorStatus) {
  const key = typeof monitorStatus === 'string' ? monitorStatus.trim().toLowerCase() : ''
  if (!key) return null
  return Object.prototype.hasOwnProperty.call(MONITOR_STATUS_TO_AUDIT, key)
    ? MONITOR_STATUS_TO_AUDIT[key]
    : null
}

/**
 * 校验并归一审核状态（白名单）。非法值返回 null（fail-closed，不落未知态）。
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeAuditStatus (value) {
  const key = typeof value === 'string' ? value.trim() : ''
  return AUDIT_STATUSES.includes(key) ? key : null
}

/**
 * 该审核状态是否需要醒目提醒（拒绝/下线/转码失败）。
 * @param {unknown} value
 * @returns {boolean}
 */
function isAuditAlertStatus (value) {
  const key = normalizeAuditStatus(value)
  return key !== null && AUDIT_ALERT_STATUSES.includes(key)
}

/**
 * 审核状态的 i18n key（主进程与渲染层共用同一约定，避免两侧各写一份映射）。
 * @param {unknown} value
 * @returns {string|null} 非法状态返回 null（调用点不渲染徽标）
 */
function auditStatusLabelKey (value) {
  const key = normalizeAuditStatus(value)
  return key === null ? null : 'historyPage.auditStatus.' + key
}

/**
 * 历史记录可被监控回写更新的字段白名单。
 * 监控回调的 payload 来自网络响应，只允许这些键落库（防越权改写
 * status/result/error 等主流程字段——发布成功与否只能由发布链路改写）。
 */
const AUDIT_PATCH_KEYS = Object.freeze(['auditStatus', 'monitorStatus', 'platformWorkId', 'auditedAt'])

/** 落库字符串字段上限：值来自网络响应，截断防超长内容污染历史文件与渲染。 */
const AUDIT_STRING_MAX = Object.freeze({ monitorStatus: 32, platformWorkId: 128, auditedAt: 40 })

/**
 * 从监控回调结果构造**安全**的审核增量补丁（只取白名单键 + 归一状态 + 长度上限）。
 * @param {{status?: unknown, postId?: unknown}} monitorResult
 * @param {string} [nowIso]
 * @returns {{auditStatus: string, monitorStatus: string, platformWorkId: string, auditedAt: string}|null}
 *   auditStatus 无定论（null 映射）时返回 null——调用点不得落库
 */
function buildAuditPatch (monitorResult, nowIso) {
  const result = monitorResult && typeof monitorResult === 'object' ? monitorResult : {}
  const auditStatus = mapMonitorStatusToAuditStatus(result.status)
  if (auditStatus === null) return null
  const cut = (value, max) => {
    const text = value == null ? '' : String(value).trim()
    return text.length > max ? text.slice(0, max) : text
  }
  return {
    auditStatus,
    monitorStatus: cut(result.status, AUDIT_STRING_MAX.monitorStatus),
    platformWorkId: cut(result.postId, AUDIT_STRING_MAX.platformWorkId),
    auditedAt: cut(typeof nowIso === 'string' && nowIso ? nowIso : new Date().toISOString(), AUDIT_STRING_MAX.auditedAt),
  }
}

module.exports = {
  AUDIT_STATUSES,
  AUDIT_ALERT_STATUSES,
  mapMonitorStatusToAuditStatus,
  normalizeAuditStatus,
  isAuditAlertStatus,
  auditStatusLabelKey,
  AUDIT_PATCH_KEYS,
  AUDIT_STRING_MAX,
  buildAuditPatch,
}
