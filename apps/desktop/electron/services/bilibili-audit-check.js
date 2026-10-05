'use strict'
/**
 * bilibili-audit-check.js — B 站发布后审核状态查询（取证驱动的实现）
 *
 * 唯一真源取证：01-docs/AUDIT-REQUERY-EVIDENCE-BILIBILI-2026-10-05.md（2026-10-05，真实已登录账号，全程只读）
 *
 * 三条由实测决定的硬口径，改任何一条都必须同步该文档：
 *  1. 端点是 `member.bilibili.com/x/web/archives`（创作中心），**不是** `api.bilibili.com/x/web-interface/archive/space`；
 *     后者是通用层当年按「候选端点」猜的，实测不可能命中稿件 ⇒ 监控只会一路 pending 到 timeout。
 *  2. 列表条目在 `data.arc_audits[]`（每项 `{Archive, Videos, stat, ...}`）；
 *     `data.archives` 实测是**空对象**，按它解析会恒得 0 条。
 *  3. 只有 `state=0 且 primary_state=0` 是**本机实测观测到**的「已上线」（`state_desc="开放浏览"`）。
 *     审核中/不通过的取值本机无现场 ⇒ 其余一切取值产出 `pending`（无定论），
 *     依 AGENTS.md 单向证据规则不得改写真源；「HTTP 200 + code 0」不是结论
 *     （实测未知 `status` 参数被静默忽略并返回默认列表）。
 *
 * 凭证：Cookie 会话即可（实测无签名/无 wbi/无 OAuth）。Referer 按页面实况带上；
 * 是否为必需**未做对照组**，不得据此断言"必需"。
 *
 * 网络层可注入（`axios` 参数）：测试禁止真实出站（AGENTS.md QM-3），且本仓没有 nock/msw。
 */

const BILIBILI_NAV_URL = 'https://api.bilibili.com/x/web-interface/nav'
const BILIBILI_LIST_URL = 'https://member.bilibili.com/x/web/archives?status=pubed&pn=1&ps=20&platform=web'
const BILIBILI_REFERER = 'https://member.bilibili.com/'
const REQUEST_TIMEOUT_MS = 15000

/** 实测观测到的「已上线」取值集合（本机 6 篇稿件全部为此值）；其余取值一律无定论。 */
const BILIBILI_OBSERVED_ONLINE_STATES = Object.freeze([0])

function isObservedOnline (archive) {
  if (!archive || typeof archive !== 'object') return false
  // 严格类型，禁止隐式转换：Number(null)===0、Number('')===0 会让「字段缺失/为 null」
  // 被判成已上线（回归 T5 实测抓到）。取值必须是数字且落在**实测观测到的**集合内。
  return typeof archive.state === 'number'
    && BILIBILI_OBSERVED_ONLINE_STATES.includes(archive.state)
    && archive.primary_state === 0
}

function matchById (archive, postId) {
  if (!archive) return false
  const want = String(postId).trim()
  if (!want) return false
  if (archive.bvid && String(archive.bvid) === want) return true
  // aid 是 15 位整数，响应里是 number，必须按字符串比较，否则精度/类型不一致会漏
  if (archive.aid !== undefined && archive.aid !== null && String(archive.aid) === want) return true
  return false
}

/**
 * @param {object} p
 * @param {string} p.postId 平台作品标识（bvid 或 aid 字符串）
 * @param {string} p.cookies 账号分区解出的 Cookie 串；空则一请求不发
 * @param {object} [p.axios] 注入的传输层（默认 require('axios')）
 * @returns {Promise<{status: 'published'|'pending'|'error', postId: string, raw?: object, message?: string}>}
 */
async function checkBilibiliAuditStatus (p) {
  const o = p && typeof p === 'object' ? p : {}
  const postId = o.postId
  const cookies = typeof o.cookies === 'string' ? o.cookies : ''

  if (!postId) return { status: 'pending', postId, reason: 'no-post-id' }
  // 凭证缺失不是反证：不发起必然失败的请求，也不产出任何可写状态
  if (!cookies) return { status: 'pending', postId, reason: 'no-cookies' }

  const axios = o.axios || require('axios')
  const headers = { Cookie: cookies, Referer: BILIBILI_REFERER }

  try {
    // 第一跳：确认这是谁的会话。nav 拿不到 mid 就不去猜列表主体（宁可无定论）
    const navRes = await axios.get(BILIBILI_NAV_URL, { headers, timeout: REQUEST_TIMEOUT_MS })
    const nav = navRes && navRes.data
    if (!nav || nav.code !== 0 || !nav.data || !nav.data.mid) {
      return { status: 'pending', postId, reason: 'nav-not-established' }
    }

    const listRes = await axios.get(BILIBILI_LIST_URL, { headers, timeout: REQUEST_TIMEOUT_MS })
    const body = listRes && listRes.data
    if (!body || body.code !== 0 || !body.data) {
      // 信封错误（风控/失效）与「稿件不存在」同形 ⇒ 只能无定论
      return { status: 'pending', postId, reason: 'envelope-not-ok' }
    }

    const audits = body.data.arc_audits
    if (!Array.isArray(audits)) {
      // 实测：分页越界 / 空桶时该字段整体缺席，而 page.count 仍是总数 ⇒ 不得拿 count 当命中证据
      return { status: 'pending', postId, reason: 'no-audit-array' }
    }

    for (const entry of audits) {
      const archive = entry && entry.Archive
      if (!matchById(archive, postId)) continue
      if (isObservedOnline(archive)) return { status: 'published', postId, raw: entry }
      // 命中了但 state 未观测 ⇒ 无定论，绝不猜 inAudit/deny
      return { status: 'pending', postId, reason: 'state-unobserved', state: archive.state, primaryState: archive.primary_state }
    }

    return { status: 'pending', postId, reason: 'not-in-list' }
  } catch (e) {
    return { status: 'error', postId, message: (e && e.message) || String(e) }
  }
}

module.exports = {
  checkBilibiliAuditStatus,
  BILIBILI_LIST_URL,
  BILIBILI_NAV_URL,
  BILIBILI_REFERER,
  BILIBILI_OBSERVED_ONLINE_STATES
}
