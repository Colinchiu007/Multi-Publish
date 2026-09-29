'use strict'
// @ts-check
/**
 * publish-audit-requery.js — 发布后审核状态回查的「能不能查」策略层（P0-1 第二切片）
 *
 * 背景（01-docs/PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md §四 P0-1 残余限制）：
 * 第一切片交付了审核状态机 + 原记录回写 + 展示，但回查通道实测不可用，两处根因：
 *
 *   1. **凭证恒空**：phase4-events 建监控任务时传 `task.article?.cookies || ''`，
 *      而全仓**从未有任何代码写入 `article.cookies`**（只此一处读取）——监控历来
 *      用空 cookie 轮询，必然 401/重定向，12 次重试后 timeout（切片一之前还会把
 *      这个 error 伪造成一条 status='error' 的历史记录）。
 *      正解：登录态落在 Electron auth 分区（credential store 只存 localStorage +
 *      accountInfo，不含 cookie），复用既有 `collectAuthPartitionCookies`（auth-partition.js，
 *      含平台域过滤 + 同名去重 + 失败降级空）。
 *
 *   2. **端点未验证**：publish-monitor 的 CHECK_URLS 是通用 `GET ?id=<postId>` 形态，
 *      与各平台真实接口并不一致（抖音是需签名的 POST、快手是 graphql 且已诚实跳过、
 *      YouTube 需 OAuth 而非 cookie、头条那条其实是 HTML 页面）。本模块把「端点是否
 *      已被证据验证」显式分级，避免「代码在跑」被误读成「能力可用」。
 *
 * 分级（诚实标注，与 AGENTS.md「未取证的状态宁缺勿造」同族）：
 *   - `verified`   ：端点 + 参数名 + 鉴权方式已由真机证据确认 → 可自动轮询
 *   - `candidate`  ：端点存在但形状/鉴权未验证 → 轮询属**探索**，可经开关关闭
 *   - `unsupported`：无端点（不在候选表内）→ 不轮询
 *
 * 当前 `verified` 为空（本仓尚无任何平台的审核回查真机证据）。candidate 默认仍参与
 * 轮询（保持既有意图；凭证修复后至少不再是必然失败），可用
 * `MP_AUDIT_REQUERY_CANDIDATES=0` 关闭探索性轮询。
 */

/** 已被证据验证的平台（端点 + 参数名 + 鉴权方式三项齐备）。当前为空。 */
const AUDIT_REQUERY_VERIFIED_PLATFORMS = Object.freeze([])

/**
 * 候选平台：publish-monitor 的 CHECK_URLS 有端点，但形状/鉴权未经真机验证。
 * 与 publish-monitor.CHECK_URLS 的键集必须一致（parity 测试锁，防两表漂移）。
 */
const AUDIT_REQUERY_CANDIDATE_PLATFORMS = Object.freeze([
  'weibo', 'douyin', 'bilibili', 'zhihu', 'xiaohongshu', 'toutiao', 'youtube',
])

/** 凭证来源（日志与诊断用，避免「猜是不是没凭证」）。 */
const COOKIE_SOURCE = Object.freeze({
  PROVIDED: 'provided', // 任务自带（当前链路恒空，保留以兼容将来）
  AUTH_PARTITION: 'auth-partition', // 从 Electron auth 分区只读补齐
  NONE: 'none', // 两处都拿不到
})

/**
 * 解析审核回查所需 cookie：优先任务自带（非空才用），否则只读 auth 分区补齐。
 * 绝不写凭证 store；任何异常降级为 none（由调用方决定跳过回查）。
 *
 * @param {object} params
 * @param {string} params.platform
 * @param {string|null|undefined} params.accountId
 * @param {string} [params.providedCookies]
 * @param {(platform: string, accountId: string|null|undefined) => Promise<{cookieString?: string}>} [params.readAuthCookies]
 *   auth 分区读取实现（默认走 collectAuthPartitionCookies；测试注入假实现）
 * @returns {Promise<{cookies: string, source: string}>}
 */
async function resolveAuditRequeryCookies (params) {
  const p = params && typeof params === 'object' ? params : {}
  const platform = String(p.platform || '').trim()
  const provided = typeof p.providedCookies === 'string' ? p.providedCookies.trim() : ''
  if (provided) return { cookies: provided, source: COOKIE_SOURCE.PROVIDED }
  if (!platform) return { cookies: '', source: COOKIE_SOURCE.NONE }

  const reader = typeof p.readAuthCookies === 'function' ? p.readAuthCookies : defaultAuthCookieReader
  if (!reader) return { cookies: '', source: COOKIE_SOURCE.NONE }
  try {
    const result = await reader(platform, p.accountId == null ? null : p.accountId)
    const cookieString = result && typeof result.cookieString === 'string' ? result.cookieString.trim() : ''
    return cookieString
      ? { cookies: cookieString, source: COOKIE_SOURCE.AUTH_PARTITION }
      : { cookies: '', source: COOKIE_SOURCE.NONE }
  } catch (e) {
    return { cookies: '', source: COOKIE_SOURCE.NONE }
  }
}

/** 默认 auth 分区读取器（惰性 require，避免测试环境强依赖 electron）。 */
function defaultAuthCookieReader (platform, accountId) {
  try {
    const { collectAuthPartitionCookies } = require('./auth-partition')
    return collectAuthPartitionCookies(platform, accountId)
  } catch (_) {
    return Promise.resolve({ cookieString: '' })
  }
}

/**
 * 是否允许对候选平台做**探索性**轮询（默认允许；`MP_AUDIT_REQUERY_CANDIDATES=0` 关闭）。
 * @param {object} [env]
 * @returns {boolean}
 */
function allowCandidateRequery (env) {
  const source = env && typeof env === 'object' ? env : process.env
  const raw = source && source.MP_AUDIT_REQUERY_CANDIDATES
  if (raw === undefined || raw === null || raw === '') return true
  return !['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase())
}

/**
 * 决定是否为该平台启动审核回查（策略单一入口）。
 * @param {object} params
 * @param {string} params.platform
 * @param {string} params.cookies 已解析出的凭证（空则一律不查——不发起必然失败的轮询）
 * @param {object} [params.env] 环境变量源（测试注入）
 * @returns {{ start: boolean, reason: string }}
 *   reason: no-cookies | unsupported-platform | candidates-disabled | verified | candidate
 */
function decideAuditRequery (params) {
  const p = params && typeof params === 'object' ? params : {}
  const platform = String(p.platform || '').trim()
  const cookies = typeof p.cookies === 'string' ? p.cookies.trim() : ''
  if (!cookies) return { start: false, reason: 'no-cookies' }
  if (AUDIT_REQUERY_VERIFIED_PLATFORMS.includes(platform)) return { start: true, reason: 'verified' }
  if (AUDIT_REQUERY_CANDIDATE_PLATFORMS.includes(platform)) {
    return allowCandidateRequery(p.env)
      ? { start: true, reason: 'candidate' }
      : { start: false, reason: 'candidates-disabled' }
  }
  return { start: false, reason: 'unsupported-platform' }
}

module.exports = {
  AUDIT_REQUERY_VERIFIED_PLATFORMS,
  AUDIT_REQUERY_CANDIDATE_PLATFORMS,
  COOKIE_SOURCE,
  resolveAuditRequeryCookies,
  allowCandidateRequery,
  decideAuditRequery,
}
