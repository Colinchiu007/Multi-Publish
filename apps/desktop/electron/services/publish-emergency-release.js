// @ts-check
/**
 * 发布紧急放行服务（publish-frequency-policy-v2 P2-2）
 *
 * 职责边界（刻意收窄，便于无 store 环境复用与测试）：
 *   本服务只做 **策略与合规**：每日每账号上限、跨账号冷却、追加式审计落盘。
 *   「取消防守定时器 → 清窗 → 重新入队」的**机制**在 TaskQueue.emergencyRelease。
 *
 * 三态回显是硬要求：成功 / 超上限 / 冷却中 / 无等待窗口 四类结果都必须如实回报，
 * 不得静默成功也不得静默失败 —— 用户点了按钮却什么都不发生，比报错更伤。
 *
 * 状态持久化：settings 键 `publishEmergencyRelease` = { dayKey, perAccount:{key:n}, lastAt }
 *   · perAccount 按**本机运营日**归零（dayKey 变化即视为新的一天）
 *   · lastAt 是**跨账号**冷却（与「每账号每日 1 次」正交：前者防同一账号连环点，
 *     后者防用多个账号把出口当常规通道刷）
 * 审计：追加式 JSONL，**无 UI 编辑入口**，只由本服务 append。
 */
const fs = require('fs')
const path = require('path')
const { resolveEmergencyMaxPerDay, resolvePolicyOverrides } = require('@multi-publish/shared-utils/src/publish-frequency-policy')

const SETTING_KEY = 'publishEmergencyRelease'
const POLICY_SETTING_KEY = 'publishFrequencyPolicy'
const AUDIT_FILE = 'publish-emergency-audit.jsonl'
/** 跨账号冷却：与「每账号每日 1 次」正交 */
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000
/** reason 落盘长度上限（避免把长文本写进审计） */
const MAX_REASON_LEN = 200

/** 本机运营日 'YYYY-MM-DD'（与守卫 today() 同口径） */
function localDayKey (ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 紧急放行的状态键：accountId 缺席用哨兵 '*'（与守卫的平台档哨兵同形，但语义独立） */
function accountKey (platform, accountId) {
  const acc = typeof accountId === 'string' && accountId.trim() ? accountId.trim() : '*'
  return `${platform}:${acc}`
}

function createPublishEmergencyReleaseService (deps = {}) {
  const { store, log, app, identityService } = deps
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
  const cooldownMs = Number.isFinite(deps.cooldownMs) && deps.cooldownMs >= 0
    ? deps.cooldownMs
    : DEFAULT_COOLDOWN_MS

  const warn = (msg) => {
    if (log && typeof log.warn === 'function') log.warn('[PublishEmergencyRelease] ' + msg)
    else console.warn('[PublishEmergencyRelease] ' + msg)
  }

  function readState () {
    try {
      const s = store && typeof store.getSettingObject === 'function'
        ? store.getSettingObject(SETTING_KEY, {})
        : {}
      return s && typeof s === 'object' && !Array.isArray(s) ? s : {}
    } catch (e) {
      warn('读取状态失败（按全新状态处理）：' + (e && e.message))
      return {}
    }
  }

  function writeState (state) {
    try {
      if (store && typeof store.setSetting === 'function') store.setSetting(SETTING_KEY, state)
    } catch (e) {
      warn('写入状态失败（本次放行不会被计数到每日上限）：' + (e && e.message))
    }
  }

  /** 上限来源：设置页覆盖 > 环境变量 > 默认 1 */
  function resolveMax () {
    let overrides = null
    try {
      const raw = store && typeof store.getSettingObject === 'function'
        ? store.getSettingObject(POLICY_SETTING_KEY, null)
        : null
      overrides = resolvePolicyOverrides(raw, { warn })
    } catch (e) {
      warn('读取策略覆盖失败（按 env/默认处理）：' + (e && e.message))
    }
    const n = resolveEmergencyMaxPerDay({ overrides, warn })
    return Number.isInteger(n) && n >= 0 ? n : 1
  }

  function resolveAuditPath () {
    if (deps.auditPath) return deps.auditPath
    try {
      if (app && typeof app.getPath === 'function') {
        return path.join(app.getPath('userData'), AUDIT_FILE)
      }
    } catch (e) {
      warn('解析审计路径失败（本次放行不落审计文件）：' + (e && e.message))
    }
    return null
  }

  function appendAudit (line) {
    const file = resolveAuditPath()
    if (!file) {
      warn('无可用审计路径，已跳过审计落盘（放行仍执行，但审计缺失）')
      return false
    }
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.appendFileSync(file, JSON.stringify(line) + '\n', 'utf8')
      return true
    } catch (e) {
      warn('审计落盘失败：' + (e && e.message))
      return false
    }
  }

  /** 操作者标识：优先生效用户 subject，取不到则如实写 'unknown'（不假装是某人） */
  function resolveOperator () {
    try {
      if (identityService && typeof identityService.getOwnerSubject === 'function') {
        const s = identityService.getOwnerSubject()
        if (typeof s === 'string' && s) return s
      }
      if (identityService && typeof identityService.getCurrentUser === 'function') {
        const u = identityService.getCurrentUser()
        if (u && typeof u === 'object' && u.subject) return String(u.subject)
      }
    } catch (_) { /* 降级 */ }
    return 'unknown'
  }

  return {
    /** 供设置页展示当前用量（不产生副作用） */
    getStatus () {
      const day = localDayKey(now())
      const s = readState()
      const sameDay = s.dayKey === day
      const max = resolveMax()
      const lastAt = sameDay ? Number(s.lastAt) || 0 : 0
      const retryAfterMs = lastAt > 0 ? Math.max(0, cooldownMs - (now() - lastAt)) : 0
      return {
        dayKey: day,
        max,
        cooldownMs,
        retryAfterMs,
        perAccount: sameDay && s.perAccount ? s.perAccount : {},
      }
    },

    /**
     * 判定是否允许放行（只读，不写状态、不写审计）。
     * @returns {{allowed: boolean, code: (null|'disabled'|'exhausted'|'cooldown'), used: number, max: number, retryAfterMs?: number, dayKey: string}}
     */
    check (platform, accountId) {
      const day = localDayKey(now())
      const s = readState()
      const sameDay = s.dayKey === day
      const perAccount = sameDay && s.perAccount ? s.perAccount : {}
      const used = sameDay ? (Number(perAccount[accountKey(platform, accountId)]) || 0) : 0
      const max = resolveMax()

      if (max <= 0) return { allowed: false, code: 'disabled', used, max, dayKey: day }

      if (used >= max) return { allowed: false, code: 'exhausted', used, max, dayKey: day }

      const lastAt = sameDay ? Number(s.lastAt) || 0 : 0
      if (lastAt > 0) {
        const wait = cooldownMs - (now() - lastAt)
        if (wait > 0) return { allowed: false, code: 'cooldown', used, max, retryAfterMs: wait, dayKey: day }
      }
      return { allowed: true, code: null, used, max, dayKey: day }
    },

    /**
     * 记一次放行：累加当日该账号次数 + 刷新跨账号冷却 + 追加审计。
     * @param {string} platform
     * @param {string|null} accountId
     * @param {{result: string, reason?: string, operator?: string}} detail
     */
    record (platform, accountId, detail = {}) {
      const at = now()
      const day = localDayKey(at)
      const s = readState()
      const sameDay = s.dayKey === day
      const perAccount = sameDay && s.perAccount && typeof s.perAccount === 'object'
        ? { ...s.perAccount }
        : {}
      const key = accountKey(platform, accountId)
      perAccount[key] = (Number(perAccount[key]) || 0) + 1
      writeState({ dayKey: day, perAccount, lastAt: at })

      const reason = typeof detail.reason === 'string' ? detail.reason.slice(0, MAX_REASON_LEN) : null
      const operator = detail.operator || resolveOperator()
      // 评审 i5：审计必须记下**清掉了哪些键** —— clearWindow 会连带清 `platform:*`，
      // 即该平台**其他账号**的跨账号保护也失效一次。不记下来，事后无法解释
      // 「为什么另一个账号那次没被拦」。
      const clearedKeys = Array.isArray(detail.clearedKeys) ? detail.clearedKeys.slice(0, 8) : []
      const audited = appendAudit({
        ts: new Date(at).toISOString(),
        platform,
        accountId: typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null,
        operator,
        reason,
        result: detail.result || 'ok',
        clearedKeys,
      })
      return { at, operator, audited, clearedKeys }
    },
  }
}

module.exports = { createPublishEmergencyReleaseService, localDayKey, accountKey, DEFAULT_COOLDOWN_MS, SETTING_KEY, AUDIT_FILE, MAX_REASON_LEN }
