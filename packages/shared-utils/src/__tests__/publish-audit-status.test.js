import { describe, expect, it } from 'vitest'
import * as cjs from '../publish-audit-status.js'
import * as esm from '../publish-audit-status.browser.js'

/**
 * publish-audit-status 回归（PRD-PUBLISH-PAGE-OPTIMIZATION §四 P0-1）
 *
 * 核心口径：只有**平台给出明确结论**的监控状态才映射为审核状态；无定论
 * （error/timeout/skipped/pending/unknown/failed）返回 null，调用点保持原记录不变
 * ——「没拿到新证据」不是反证（与 login-state 单向证据规则同族）。
 */
describe('publish-audit-status — 枚举与映射', () => {
  it('枚举覆盖 7 态且无重复', () => {
    expect(cjs.AUDIT_STATUSES).toEqual([
      'published', 'inAudit', 'prePublish', 'deny', 'notPublic', 'withdrawn', 'transferFail',
    ])
    expect(new Set(cjs.AUDIT_STATUSES).size).toBe(cjs.AUDIT_STATUSES.length)
  })

  it('监控明确结论映射为审核状态', () => {
    expect(cjs.mapMonitorStatusToAuditStatus('published')).toBe('published')
    expect(cjs.mapMonitorStatusToAuditStatus('reviewed')).toBe('inAudit')
    expect(cjs.mapMonitorStatusToAuditStatus('rejected')).toBe('deny')
    expect(cjs.mapMonitorStatusToAuditStatus('draft')).toBe('prePublish')
    // 大小写与空白容忍（监控侧历史取值形态不一）
    expect(cjs.mapMonitorStatusToAuditStatus('  REJECTED ')).toBe('deny')
  })

  it('无定论状态一律返回 null（不构成改写真源的证据）', () => {
    for (const status of ['error', 'timeout', 'skipped', 'pending', 'unknown', 'failed', '', 'bogus']) {
      expect(cjs.mapMonitorStatusToAuditStatus(status), status + ' 必须为 null').toBeNull()
    }
    expect(cjs.mapMonitorStatusToAuditStatus(null)).toBeNull()
    expect(cjs.mapMonitorStatusToAuditStatus(undefined)).toBeNull()
    expect(cjs.mapMonitorStatusToAuditStatus(123)).toBeNull()
  })

  it('normalizeAuditStatus 白名单校验（非法返回 null）', () => {
    expect(cjs.normalizeAuditStatus('deny')).toBe('deny')
    expect(cjs.normalizeAuditStatus(' notPublic ')).toBe('notPublic')
    expect(cjs.normalizeAuditStatus('nonexistent')).toBeNull()
    expect(cjs.normalizeAuditStatus('')).toBeNull()
    expect(cjs.normalizeAuditStatus(null)).toBeNull()
    expect(cjs.normalizeAuditStatus({})).toBeNull()
  })

  it('醒目提醒状态只含拒绝/下线/转码失败', () => {
    expect(cjs.AUDIT_ALERT_STATUSES).toEqual(['deny', 'withdrawn', 'transferFail'])
    expect(cjs.isAuditAlertStatus('deny')).toBe(true)
    expect(cjs.isAuditAlertStatus('withdrawn')).toBe(true)
    expect(cjs.isAuditAlertStatus('transferFail')).toBe(true)
    // 正常态不提醒（避免噪音）
    for (const ok of ['published', 'inAudit', 'prePublish', 'notPublic']) {
      expect(cjs.isAuditAlertStatus(ok), ok + ' 不应提醒').toBe(false)
    }
    expect(cjs.isAuditAlertStatus('bogus')).toBe(false)
  })

  it('label key 由本层单一持有（主进程与渲染层同一约定）', () => {
    expect(cjs.auditStatusLabelKey('inAudit')).toBe('historyPage.auditStatus.inAudit')
    expect(cjs.auditStatusLabelKey('bogus')).toBeNull()
  })
})

describe('publish-audit-status — buildAuditPatch（落库增量）', () => {
  const NOW = '2026-10-09T12:00:00.000Z'

  it('明确结论产出白名单增量（含 workId 与时间）', () => {
    expect(cjs.buildAuditPatch({ status: 'rejected', postId: 'aweme-1' }, NOW)).toEqual({
      auditStatus: 'deny',
      monitorStatus: 'rejected',
      platformWorkId: 'aweme-1',
      auditedAt: NOW,
    })
  })

  it('无定论返回 null（调用点不得落库）', () => {
    expect(cjs.buildAuditPatch({ status: 'error', postId: 'x' }, NOW)).toBeNull()
    expect(cjs.buildAuditPatch({ status: 'timeout' }, NOW)).toBeNull()
    expect(cjs.buildAuditPatch(null, NOW)).toBeNull()
    expect(cjs.buildAuditPatch({}, NOW)).toBeNull()
  })

  it('只产出白名单键（监控响应不得越权改写 status/result）', () => {
    const patch = cjs.buildAuditPatch(
      { status: 'published', postId: 'p1', url: 'https://evil.example', success: false },
      NOW,
    )
    expect(Object.keys(patch).sort()).toEqual(['auditStatus', 'auditedAt', 'monitorStatus', 'platformWorkId'])
    expect(cjs.AUDIT_PATCH_KEYS).toEqual(['auditStatus', 'monitorStatus', 'platformWorkId', 'auditedAt'])
  })

  it('缺 postId 时 platformWorkId 为空串（不写 undefined）', () => {
    expect(cjs.buildAuditPatch({ status: 'draft' }, NOW).platformWorkId).toBe('')
  })
})

describe('publish-audit-status — CJS/ESM 孪生 parity', () => {
  // CJS 被 ESM 加载时命名空间会多出一个 `default`（其值为 module.exports 那个对象）。
  // 沿用 safe-http-url parity 的先例：只在 `default` 确实是「同一组导出的镜像」时剔除，
  // 若有人真写了 `export default …`，等价条件不成立 ⇒ 断言当场变红。
  function apiKeys (ns) {
    const d = ns.default
    const isInteropDefault = !!d && typeof d === 'object' &&
      Object.keys(ns).filter(k => k !== 'default').every(k => d[k] === ns[k]) &&
      Object.keys(d).every(k => ns[k] === d[k])
    return Object.keys(ns).filter(k => !(k === 'default' && isInteropDefault)).sort()
  }

  it('导出集合一致', () => {
    expect(apiKeys(esm)).toEqual(apiKeys(cjs))
    // 且两侧都必须真的暴露核心 API（键集相同但都缺映射函数也算漂移）
    expect(apiKeys(esm)).toContain('mapMonitorStatusToAuditStatus')
    expect(apiKeys(esm)).toContain('AUDIT_STATUSES')
  })

  it('枚举与映射逐项同结论（穷举全部监控取值 × 归一边界）', () => {
    expect([...esm.AUDIT_STATUSES]).toEqual([...cjs.AUDIT_STATUSES])
    expect([...esm.AUDIT_ALERT_STATUSES]).toEqual([...cjs.AUDIT_ALERT_STATUSES])
    expect([...esm.AUDIT_PATCH_KEYS]).toEqual([...cjs.AUDIT_PATCH_KEYS])
    const monitorValues = ['published', 'reviewed', 'rejected', 'draft', 'failed', 'error', 'timeout', 'skipped', 'pending', 'unknown', 'bogus', '', null, undefined, 42]
    for (const value of monitorValues) {
      expect(esm.mapMonitorStatusToAuditStatus(value), String(value)).toEqual(cjs.mapMonitorStatusToAuditStatus(value))
      expect(esm.buildAuditPatch({ status: value, postId: 'p' }, 'T'), String(value))
        .toEqual(cjs.buildAuditPatch({ status: value, postId: 'p' }, 'T'))
    }
    for (const value of [...cjs.AUDIT_STATUSES, 'bogus', null, 42]) {
      expect(esm.normalizeAuditStatus(value)).toEqual(cjs.normalizeAuditStatus(value))
      expect(esm.isAuditAlertStatus(value)).toEqual(cjs.isAuditAlertStatus(value))
      expect(esm.auditStatusLabelKey(value)).toEqual(cjs.auditStatusLabelKey(value))
    }
  })

  it('规模下界：枚举不得退化成空集（空集会让 parity 恒真）', () => {
    expect(cjs.AUDIT_STATUSES.length).toBeGreaterThanOrEqual(7)
    expect(Object.keys(cjs).length).toBeGreaterThanOrEqual(8)
  })
})
