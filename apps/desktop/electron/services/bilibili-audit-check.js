'use strict'
/**
 * bilibili-audit-check.js — B 站发布后审核状态查询（取证驱动的实现）
 *
 * 唯一真源取证：docs/audit-requery-evidence-bilibili-2026-10-05.md（2026-10-05，真实已登录账号，全程只读；索引在 01-docs/AUDIT-REQUERY-EVIDENCE-CHECKLIST-2026-10-09.md §九）
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
 *  4. `status` 是**真过滤**，且桶名词表由端点自己在 `data.class` 里回报（2026-10-07 只读复测：
 *     `status=not_pubed`/`is_pubing` 返回明显更小的空桶响应，未知值与 `pubed` 逐字节同形）。
 *     因此主桶未命中时按 `data.class` 的计数决定是否扇出 —— 见
 *     docs/PRD-BILIBILI-AUDIT-BUCKET-QUERY-2026-10-07.md。
 *     扇出的目的不是给「审核中」下结论（桶名中文语义未实测，禁止映射成 rejected），
 *     而是把「稿件存在但不在已发布桶」与「稿件不存在」分开，并把该桶真实回报的
 *     state/primary_state/state_desc 原样带进结果与日志 —— 那是 §四.1 缺的那格现场唯一的取证通道。
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

/** 实测观测到的「已上线」取值集合（本机 7 篇稿件全部为此值）；其余取值一律无定论。 */
const BILIBILI_OBSERVED_ONLINE_STATES = Object.freeze([0])

/**
 * 主桶（已发布）键名。2026-10-07 只读复测：不带 status 的请求与 status=pubed 逐字节同形，
 * 因此「URL 里没有 status」时按 pubed 处理是实测结论，不是猜测。
 */
const BILIBILI_PRIMARY_BUCKET = 'pubed'

/**
 * 非主桶命中时的 reason。
 * ⛔ 这些标签是**存在性证据**（「稿件在这个桶里」），不是状态结论 —— 桶名的中文语义
 * （not_pubed 到底是「审核未通过」还是「未发布」）本机无现场，一律 pending，
 * 不得据此改写真源，也不得映射成 rejected/deny —— 由 A3/A3b/M7/M8 锁住。
 */
const BILIBILI_BUCKET_REASONS = Object.freeze({
  is_pubing: 'in-review-bucket',
  not_pubed: 'in-not-pubed-bucket',
})

// 桶键来自第三方响应（data.class 的键集），要进 URL 就必须先过形态白名单，
// 否则一个带 `#`/`&`/空格的键就能往查询串里塞任意内容。
const BUCKET_KEY_SHAPE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/

/**
 * 单次轮询最多补查几个非主桶。本仓对「给创作中心接口送量」高度敏感（见扇出循环注释），
 * 而桶表由端点自己回报 —— 没有上限就等于把放大面交给对方决定。超限即截断并在结果里
 * 出声（`bucketsTruncated`），禁止静默。
 */
const MAX_BUCKET_PROBES = 3

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
  // aid 是 15 位整数（远小于 Number.MAX_SAFE_INTEGER，无精度丢失），但响应里是 number
  // 而调用方/历史记录里常存字符串，类型不一致会漏 ⇒ 统一 String 化比较（纵深防御）
  if (archive.aid !== undefined && archive.aid !== null && String(archive.aid) === want) return true
  return false
}

/** 取 URL 上现有的 status 参数值（无则返回 ''，由调用方回落主桶）。 */
function statusOf (url) {
  const m = /[?&]status=([^&#]*)/.exec(String(url || ''))
  return m ? m[1] : ''
}

/**
 * 只改 status，其余 query 与顺序原样保留；没有 status 就追加。
 * 单一实现 —— 禁止在别处再拼一份列表 URL。
 *
 * 形态校验落在**函数边界上**而不是只落在调用点：本函数是导出的公开原语，
 * 若不变量只写在调用方注释里，下一个新增调用方就能整条绕过白名单把任意串拼进 URL
 * （QM-6 前端轴 W1）。非法 status 一律抛错 —— 宁可经外层 catch 变成 error/无定论，
 * 也不静默产出一个「看着像补查其实打回主桶」的请求。
 */
function withStatusParam (url, status) {
  const key = String(status == null ? '' : status)
  if (!BUCKET_KEY_SHAPE.test(key)) {
    throw new Error('BILIBILI_BUCKET_KEY_INVALID: ' + key.length)
  }
  const u = String(url || '')
  if (!/[?&]status=/.test(u)) return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'status=' + key
  return u.replace(/([?&]status=)[^&#]*/, '$1' + key)
}

/** data.class 是端点自己回报的桶计数；非对象（含数组）一律视为不可用。 */
function normalizeClassCounts (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value
}

/**
 * 一跳列表请求，收敛信封/容器判据到一处 —— 扇出时每一跳都必须过同一套判据，
 * 否则「第二跳拿到了 code:0 但容器形状不对」会被当成命中失败下结论。
 */
async function fetchArchiveList (axios, headers, url) {
  const res = await axios.get(url, { headers, timeout: REQUEST_TIMEOUT_MS })
  const body = res && res.data
  if (!body || body.code !== 0 || !body.data) {
    // 信封错误（风控/失效）与「稿件不存在」同形 ⇒ 只能无定论
    return { ok: false, reason: 'envelope-not-ok', classCounts: null }
  }
  const audits = body.data.arc_audits
  const classCounts = normalizeClassCounts(body.data.class)
  if (!Array.isArray(audits)) {
    // 实测：分页越界 / 空桶时该字段整体缺席，而 page.count 仍是总数 ⇒ 不得拿 count 当命中证据
    return { ok: false, reason: 'no-audit-array', classCounts }
  }
  return { ok: true, entries: audits, classCounts }
}

function findEntry (entries, postId) {
  for (const entry of entries) {
    if (matchById(entry && entry.Archive, postId)) return entry
  }
  return null
}

/**
 * @param {object} p
 * @param {string} p.postId 平台作品标识（bvid 或 aid 字符串）
 * @param {string} p.cookies 账号分区解出的 Cookie 串；空则一请求不发
 * @param {object} [p.axios] 注入的传输层（默认 require('axios')）
 * @param {string} [p.listUrl] 列表端点覆盖（默认 BILIBILI_LIST_URL；由 checkPublishStatus 透传 pollUrl）
 * @returns {Promise<{status: 'published'|'pending'|'error', postId: string, reason?: string, bucket?: string, state?: *, primaryState?: *, stateDesc?: *, bucketsProbed?: string[], classCounts?: object|null, raw?: object, message?: string}>}
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
  // 声明在 try **之外**：catch 要读它才能说得出「探到第几跳挂了」，
  // 放在 try 里则是块级 const，catch 引用会抛 ReferenceError 把无定论变成裸抛
  const probed = []

  try {
    // 第一跳：确认这是谁的会话。nav 拿不到 mid 就不去猜列表主体（宁可无定论）
    const navRes = await axios.get(BILIBILI_NAV_URL, { headers, timeout: REQUEST_TIMEOUT_MS })
    const nav = navRes && navRes.data
    if (!nav || nav.code !== 0 || !nav.data || !nav.data.mid) {
      return { status: 'pending', postId, reason: 'nav-not-established' }
    }

    const primaryUrl = o.listUrl || BILIBILI_LIST_URL
    const primaryBucket = statusOf(primaryUrl) || BILIBILI_PRIMARY_BUCKET

    const first = await fetchArchiveList(axios, headers, primaryUrl)
    probed.push(primaryBucket)
    if (!first.ok) return { status: 'pending', postId, reason: first.reason, bucketsProbed: probed, classCounts: first.classCounts }

    const primaryHit = findEntry(first.entries, postId)
    if (primaryHit) {
      const archive = primaryHit.Archive
      // published 只能由主桶命中产出：非主桶里 state=0 是矛盾形态，不得当成上线（A3b）
      if (isObservedOnline(archive)) {
        return { status: 'published', postId, raw: primaryHit, bucket: primaryBucket, bucketsProbed: probed }
      }
      return {
        status: 'pending', postId, reason: 'state-unobserved', bucket: primaryBucket,
        state: archive.state, primaryState: archive.primary_state, stateDesc: archive.state_desc,
        bucketsProbed: probed, classCounts: first.classCounts,
      }
    }

    // 主桶没有 ⇒ 只在端点自己回报「别的桶非空」时才补查。
    // 常见路径（账号只有已发布稿件）因此仍是 1 次列表请求；无条件三桶是给风控送量。
    const counts = first.classCounts || {}
    // 只收「非主桶 + 计数为正 + 键合形态」三项同时成立的桶，再按上限截断。
    // 判据先算完再探，是为了让 truncated 这个事实可判定（边探边判会把上限变成软提示）。
    const candidates = Object.keys(counts).filter((key) =>
      key !== primaryBucket
      && BUCKET_KEY_SHAPE.test(key)
      && typeof counts[key] === 'number'
      && counts[key] > 0)
    const targets = candidates.slice(0, MAX_BUCKET_PROBES)
    const truncated = candidates.length > targets.length

    for (const key of targets) {
      // 先记账再发请求：传输层抛错时 catch 才能说出「当时正探哪个桶」（QM-6 前端轴 I3）。
      probed.push(key)
      const res = await fetchArchiveList(axios, headers, withStatusParam(primaryUrl, key))
      // 该桶不可用（信封/容器）不等于「稿件不在这里」⇒ 继续探，但绝不据此下结论
      if (!res.ok) continue
      const hit = findEntry(res.entries, postId)
      if (!hit) continue
      const archive = hit.Archive
      return {
        status: 'pending', postId, reason: BILIBILI_BUCKET_REASONS[key] || ('in-' + key + '-bucket'), bucket: key,
        // 原样带出该桶回报的状态字段：这是「审核中/不通过的 state 取值」唯一的取证通道
        state: archive.state, primaryState: archive.primary_state, stateDesc: archive.state_desc,
        bucketsProbed: probed, classCounts: counts, bucketsTruncated: truncated,
      }
    }

    return {
      status: 'pending', postId, reason: 'not-in-list',
      bucketsProbed: probed, classCounts: first.classCounts, bucketsTruncated: truncated,
    }
  } catch (e) {
    // 中途抛错也要说得出探到哪一步：error 出口不带 bucketsProbed 会让「第几跳挂的」不可归因
    return { status: 'error', postId, message: (e && e.message) || String(e), bucketsProbed: probed }
  }
}

module.exports = {
  checkBilibiliAuditStatus,
  BILIBILI_LIST_URL,
  BILIBILI_NAV_URL,
  BILIBILI_REFERER,
  BILIBILI_OBSERVED_ONLINE_STATES,
  BILIBILI_PRIMARY_BUCKET,
  BILIBILI_BUCKET_REASONS,
  MAX_BUCKET_PROBES,
  withStatusParam,
}
