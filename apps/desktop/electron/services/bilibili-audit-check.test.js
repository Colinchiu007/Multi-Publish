'use strict'
/**
 * B 站审核回查取证回归（docs/audit-requery-evidence-bilibili-2026-10-05.md）
 *
 * 夹具是**真机只读取证的真实响应片段**（字段名与本机账号自有值，未编造）。
 * 纪律：
 *  - 未观测的 state 取值一律「无定论」（pending），不得映射成任何可写状态；
 *  - 「HTTP 200 + code 0」不是结论——未知 status 参数会被静默忽略并返回默认列表（实测反例）；
 *  - 列表容器是 data.arc_audits[]，不是 data.archives（后者实测为空对象）。
 * 不发真实出站：axios 由注入提供（AGENTS.md「测试层禁止真实出站」）。
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { createRequire } from 'module'

// 被测模块是主进程 CJS（ipc-handlers 先例同款），在 ESM 测试里必须用 createRequire 载入，
// 否则 "Cannot find module 'bilibili-audit-check'"（本仓已记：ipc.test 必须 createRequire）
const require$ = createRequire(import.meta.url)
const MOD_PATH = './bilibili-audit-check'
const MONITOR_PATH = './publish-monitor'

// 实测片段：6 篇稿件里的两条（state=0 / 开放浏览）
function fixtureList (overrides) {
  const mk = (o) => Object.assign({
    aid: 117319246288101,
    bvid: 'BV1y1ht6PEfM',
    mid: 3747542357510297,
    tid: 21,
    title: '热门选题 3',
    state: 0,
    primary_state: 0,
    state_desc: '开放浏览',
    reject_reason: '',
    reject_reason_id: 0,
    online_time: 0,
    duration: 247
  }, o)
  const a = mk({})
  const b = mk({ aid: 117318189325002, bvid: 'BV1YNh46kE8T', title: '热门选题 2' })
  const list = overrides && typeof overrides === 'function' ? [a, b].map((x) => mk(Object.assign({}, x, overrides(x)))) : [a, b]
  return {
    code: 0,
    message: 'OK',
    ttl: 1,
    data: {
      class: { pubed: 6, not_pubed: 0, is_pubing: 0 },
      apply_count: { neglected: 0, pending: 0, processed: 0, expired: 0 },
      archives: {},                       // 实测：空对象，条目不在这里
      arc_audits: list.map((Archive) => ({ Archive, Videos: [], stat: { view: 1 } })),
      page: { pn: 1, ps: 20, count: 6 }
    }
  }
}

function fakeAxios (routes) {
  return {
    get: vi.fn(async (url) => {
      const hit = routes.find((r) => url.startsWith(r.match))
      if (!hit) return { data: { code: -404, message: 'no route in fixture' } }
      return { data: typeof hit.data === 'function' ? hit.data(url) : hit.data }
    })
  }
}

const NAV_OK = { match: 'https://api.bilibili.com/x/web-interface/nav', data: { code: 0, data: { mid: 3747542357510297, isLogin: true, uname: '某某某' } } }
const LIST_OK = { match: 'https://member.bilibili.com/x/web/archives', data: () => fixtureList() }

describe('B 站审核回查（取证驱动）', () => {
  it('T1 实测片段：bvid 命中且 state=0 ⇒ published', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const r = await checkBilibiliAuditStatus({
      postId: 'BV1y1ht6PEfM', cookies: 'SESSDATA=fake', axios: fakeAxios([NAV_OK, LIST_OK])
    })
    expect(r.status).toBe('published')
    expect(r.postId).toBe('BV1y1ht6PEfM')
    expect(r.raw.Archive.bvid).toBe('BV1y1ht6PEfM')
  })

  it('T2 aid 是 15 位数字，按字符串比较也要命中 ⇒ published', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const r = await checkBilibiliAuditStatus({
      postId: '117318189325002', cookies: 'SESSDATA=fake', axios: fakeAxios([NAV_OK, LIST_OK])
    })
    expect(r.status).toBe('published')
  })

  it('T3 bvid 不在列表 ⇒ pending（无定论，绝不产出 published）', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const r = await checkBilibiliAuditStatus({
      postId: 'BV0000000000', cookies: 'SESSDATA=fake', axios: fakeAxios([NAV_OK, LIST_OK])
    })
    expect(r.status).toBe('pending')
    expect(r.raw).toBeUndefined()
  })

  it('T4 分页越界时 arc_audits 缺失 ⇒ pending，且不得把 page.count 当成命中证据', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const noAudits = {
      match: 'https://member.bilibili.com/x/web/archives',
      data: { code: 0, data: { class: { pubed: 6 }, archives: {}, page: { pn: 9999, ps: 20, count: 6 } } }
    }
    const r = await checkBilibiliAuditStatus({ postId: 'BV1y1ht6PEfM', cookies: 'x', axios: fakeAxios([NAV_OK, noAudits]) })
    expect(r.status).toBe('pending')
  })

  it('T5 未观测的 state 取值一律 pending（inAudit/deny 本机无现场，不许外推）', async () => {
    const { checkBilibiliAuditStatus, BILIBILI_OBSERVED_ONLINE_STATES } = require$(MOD_PATH)
    // 取证只观测到 state=0；任何其它值都必须走无定论分支
    expect(BILIBILI_OBSERVED_ONLINE_STATES).toEqual([0])
    for (const st of [1, 2, -2, 5, 10001, '0x', null, undefined]) {
      const routes = [NAV_OK, {
        match: 'https://member.bilibili.com/x/web/archives',
        data: () => fixtureList((x) => ({ state: st }))
      }]
      const r = await checkBilibiliAuditStatus({ postId: 'BV1y1ht6PEfM', cookies: 'x', axios: fakeAxios(routes) })
      expect(st + '⇒' + r.status).toBe(st + '⇒pending')
    }
  })

  it('T6 判据必须读 arc_audits[]，按 data.archives 解析会恒 0 条（已实测其为空对象）', async () => {
    // vite 的 SSR transform 下 import.meta.url 不是 file: URL（The URL must be of scheme file），
    // 取被测文件路径一律走 createRequire().resolve —— 它与 require 用同一套解析域。
    const src = fs.readFileSync(require$.resolve(MOD_PATH + '.js'), 'utf8')
    expect(src).toMatch(/arc_audits/)
    expect(src).not.toMatch(/data\.archives\b[\s\S]{0,60}(foreach|\.map\(|for \()/)
  })

  it('T7 state=0 但 primary_state 非 0 ⇒ pending（两态都要成立才算上线）', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const routes = [NAV_OK, {
      match: 'https://member.bilibili.com/x/web/archives',
      data: () => fixtureList(() => ({ primary_state: 2 }))
    }]
    const r = await checkBilibiliAuditStatus({ postId: 'BV1y1ht6PEfM', cookies: 'x', axios: fakeAxios(routes) })
    expect(r.status).toBe('pending')
  })

  it('T8 nav 取不到 mid ⇒ 不发起列表请求（不硬猜主体）', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const axios = fakeAxios([{ match: 'https://api.bilibili.com/x/web-interface/nav', data: { code: -101, message: '未登录' } }, LIST_OK])
    const r = await checkBilibiliAuditStatus({ postId: 'BV1y1ht6PEfM', cookies: 'x', axios })
    expect(r.status).toBe('pending')
    const listCalls = axios.get.mock.calls.filter((c) => String(c[0]).includes('archives'))
    expect(listCalls.length).toBe(0)
  })

  it('T9 无凭证 ⇒ 一次请求都不发（凭证缺失不是反证，也不该白跑）', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const axios = fakeAxios([NAV_OK, LIST_OK])
    const r = await checkBilibiliAuditStatus({ postId: 'BV1y1ht6PEfM', cookies: '', axios })
    expect(r.status).toBe('pending')
    expect(axios.get.mock.calls.length).toBe(0)
  })

  it('T10 信封 code!=0（风控/失效）⇒ pending，不得当作「稿件不存在」', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const routes = [NAV_OK, { match: 'https://member.bilibili.com/x/web/archives', data: { code: -352, message: '风控' } }]
    const r = await checkBilibiliAuditStatus({ postId: 'BV1y1ht6PEfM', cookies: 'x', axios: fakeAxios(routes) })
    expect(r.status).toBe('pending')
  })

  it('T11 请求形状锁：列表必须打真实端点并带 status=pubed/pn/ps/platform=web', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const axios = fakeAxios([NAV_OK, LIST_OK])
    await checkBilibiliAuditStatus({ postId: 'BV1y1ht6PEfM', cookies: 'SESSDATA=fake', axios })
    const listUrl = String(axios.get.mock.calls.find((c) => String(c[0]).includes('archives'))[0])
    expect(listUrl).toBe('https://member.bilibili.com/x/web/archives?status=pubed&pn=1&ps=20&platform=web')
    const headers = axios.get.mock.calls.find((c) => String(c[0]).includes('archives'))[1].headers
    expect(headers.Cookie).toBe('SESSDATA=fake')
    expect(headers.Referer).toBe('https://member.bilibili.com/')
  })

  it('T12 结构锁：CHECK_URLS.bilibili 不得再是取证前的虚构端点，且与实现同一真源', () => {
    const { CHECK_URLS } = require$(MONITOR_PATH)
    const { BILIBILI_LIST_URL } = require$(MOD_PATH)
    expect(CHECK_URLS.bilibili).toBe(BILIBILI_LIST_URL)
    expect(CHECK_URLS.bilibili).toBe('https://member.bilibili.com/x/web/archives?status=pubed&pn=1&ps=20&platform=web')
    expect(CHECK_URLS.bilibili).not.toMatch(/web-interface\/archive\/space/)
  })

  it('T13 路由锁：checkPublishStatus 对 bilibili 走取证分支，不套通用 id 猜测', async () => {
    const monitor = require$(MONITOR_PATH)
    const axios = fakeAxios([NAV_OK, LIST_OK])
    // 注入 axios：publish-monitor 走 require('axios')，测试用 vi.mock 不便，改为通过参数注入
    const r = await monitor.checkPublishStatus('bilibili', 'BV1y1ht6PEfM', 'SESSDATA=fake', undefined, { axios })
    expect(r.status).toBe('published')
  })

  it('T15 listUrl 载重锁：pollUrl 透传必须真的改变请求目标（防死参数回归）', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const custom = 'https://member.bilibili.com/x/web/archives?status=pubed&pn=9&ps=20&platform=web'
    const seenUrls = []
    const axios = {
      get: async (url) => {
        seenUrls.push(url)
        return { data: url.startsWith('https://api.bilibili.com') ? NAV_OK.data : LIST_OK.data() }
      }
    }
    const r = await checkBilibiliAuditStatus({ postId: 'BV1y1ht6PEfM', cookies: 'SESSDATA=fake', axios, listUrl: custom })
    expect(r.status).toBe('published')
    expect(seenUrls).toContain(custom)
  })

  it('T14 已验证名单仍不含 bilibili（§四 验收未凑齐，不许提前进档）', () => {
    const { AUDIT_REQUERY_VERIFIED_PLATFORMS, AUDIT_REQUERY_CANDIDATE_PLATFORMS } = require$('./publish-audit-requery')
    expect(AUDIT_REQUERY_VERIFIED_PLATFORMS).not.toContain('bilibili')
    expect(AUDIT_REQUERY_CANDIDATE_PLATFORMS).toContain('bilibili')
  })
})

/**
 * 分桶查询（docs/PRD-BILIBILI-AUDIT-BUCKET-QUERY-2026-10-07.md）
 *
 * 动机：只查 status=pubed 时，「稿件在审核中」与「稿件不存在」走同一个 not-in-list 出口，
 * 于是那一次真机投稿也换不到 §四.1 缺的 state 取值。
 * 夹具里的桶名与 data.class 形态来自 2026-10-07 只读复测（真机回报的键集）；
 * 桶**内**的 state 数值是构造占位 —— 它正是要去观测的东西，测试锁的是「原样带出」，不是某个具体值。
 */
describe('B 站审核回查分桶查询', () => {
  const TARGET = 'BV9newvideo01'
  const PUBED_URL = 'https://member.bilibili.com/x/web/archives?status=pubed&pn=1&ps=20&platform=web'

  const entry = (over) => ({
    Archive: Object.assign({
      aid: 117000000000001, bvid: TARGET, mid: 3747542357510297, tid: 21,
      title: '新稿件', state: 0, primary_state: 0, state_desc: '开放浏览',
      reject_reason: '', reject_reason_id: 0, online_time: 0, duration: 12
    }, over),
    Videos: [], stat: { view: 0 }
  })

  const listBody = (cls, entries) => ({
    code: 0, message: 'OK', ttl: 1,
    data: {
      class: cls, archives: {},
      arc_audits: entries.map((Archive) => entry(Archive)),
      page: { pn: 1, ps: 20, count: entries.length }
    }
  })

  // 按 status 参数分派的多桶路由：真实端点对未知 status 会回落 pubed（2026-10-07 实测），
  // 夹具必须同形，否则「按桶区分」这一整类缺陷对测试结构性免疫。
  function bucketAxios (buckets, spy) {
    return {
      get: vi.fn(async (url) => {
        const u = String(url)
        if (u.startsWith('https://api.bilibili.com/x/web-interface/nav')) {
          return { data: { code: 0, data: { mid: 3747542357510297, isLogin: true } } }
        }
        const m = /[?&]status=([^&]*)/.exec(u)
        const status = m ? m[1] : ''
        if (!u.includes('/x/web/archives')) return { data: { code: -404 } }
        const hit = buckets[status] || buckets.__fallback
        if (spy) spy.push(status)
        return { data: hit }
      })
    }
  }

  // A1/A4：pubed 命中 → published，且一桶都不多查
  it('A1 pubed 桶命中且 state 已观测 ⇒ published', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const seen = []
    const axios = bucketAxios({ pubed: listBody({ pubed: 1, not_pubed: 0, is_pubing: 0 }, [{}]) }, seen)
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.status).toBe('published')
    expect(seen).toEqual(['pubed'])
  })

  it('A4 其他桶计数为 0 ⇒ 不扇出（列表请求恰好 1 次）', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const seen = []
    // 目标不存在，且 class 明确回报另两桶为空 ⇒ 扇出严格无收益，不得给风控送量
    const axios = bucketAxios({ pubed: listBody({ pubed: 7, not_pubed: 0, is_pubing: 0 }, [{ bvid: 'BVother000001' }]) }, seen)
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.status).toBe('pending')
    expect(r.reason).toBe('not-in-list')
    expect(seen).toEqual(['pubed'])
  })

  // A2：is_pubing 命中 → in-review-bucket + 真实 state 原样带出
  it('A2 目标在 is_pubing 桶 ⇒ pending/in-review-bucket，并把该桶回报的 state 原样带出', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const seen = []
    const axios = bucketAxios({
      pubed: listBody({ pubed: 7, not_pubed: 0, is_pubing: 1 }, [{ bvid: 'BVother000001' }]),
      is_pubing: listBody({ pubed: 7, not_pubed: 0, is_pubing: 1 }, [{ state: 5, primary_state: 5, state_desc: '审核中' }])
    }, seen)
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.status).toBe('pending')
    expect(r.reason).toBe('in-review-bucket')
    expect(r.bucket).toBe('is_pubing')
    expect(r.state).toBe(5)
    expect(r.primaryState).toBe(5)
    expect(r.stateDesc).toBe('审核中')
    expect(seen).toEqual(['pubed', 'is_pubing'])
  })

  // A3 红线：not_pubed 命中绝不等于「审核不通过」
  it('A3 not_pubed 命中 ⇒ pending + in-not-pubed-bucket，绝不产出 rejected/published', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const axios = bucketAxios({
      pubed: listBody({ pubed: 7, not_pubed: 1, is_pubing: 0 }, [{ bvid: 'BVother000001' }]),
      not_pubed: listBody({ pubed: 7, not_pubed: 1, is_pubing: 0 }, [{ state: 0, primary_state: 0, state_desc: '未发布' }])
    })
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.status).toBe('pending')
    expect(r.reason).toBe('in-not-pubed-bucket')
    expect(r.status).not.toBe('published')
    expect(r.raw).toBeUndefined()
  })

  it('A3b published 只能由主桶（调用方给定的 status）命中产出；非主桶 state=0 也不算上线', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const axios = bucketAxios({
      pubed: listBody({ pubed: 0, not_pubed: 1, is_pubing: 0 }, []),
      not_pubed: listBody({ pubed: 0, not_pubed: 1, is_pubing: 0 }, [{ state: 0, primary_state: 0 }])
    })
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.status).toBe('pending')
  })

  // A5：扇出后仍未命中 → not-in-list，并如实列出探过哪些桶
  it('A5 扇出后各桶都没有目标 ⇒ not-in-list，bucketsProbed 如实反映探过的桶', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const seen = []
    const axios = bucketAxios({
      pubed: listBody({ pubed: 7, not_pubed: 1, is_pubing: 1 }, [{ bvid: 'BVother000001' }]),
      not_pubed: listBody({ pubed: 7, not_pubed: 1, is_pubing: 1 }, [{ bvid: 'BVother000002' }]),
      is_pubing: listBody({ pubed: 7, not_pubed: 1, is_pubing: 1 }, [{ bvid: 'BVother000003' }])
    }, seen)
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.reason).toBe('not-in-list')
    expect(r.bucketsProbed).toEqual(expect.arrayContaining(['pubed', 'not_pubed', 'is_pubing']))
    expect(seen.length).toBe(3)
    expect(r.classCounts).toEqual({ pubed: 7, not_pubed: 1, is_pubing: 1 })
  })

  // A6：class 缺席 ⇒ 行为与改动前一致
  it('A6 data.class 缺失 ⇒ 不扇出，仍是 not-in-list（向后兼容既有夹具）', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const seen = []
    const body = { code: 0, data: { archives: {}, arc_audits: [{ Archive: { bvid: 'BVother000001', state: 0, primary_state: 0 } }], page: { count: 1 } } }
    const axios = bucketAxios({ pubed: body }, seen)
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.reason).toBe('not-in-list')
    expect(seen).toEqual(['pubed'])
  })

  // A7：既有五个 pending 出口不得被扇出改写
  it('A7 信封非 code:0 / 缺 arc_audits / nav 未建立 / 无凭证 / 无 postId ⇒ 五个既有出口逐条不变', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const bad = { match: 'https://member.bilibili.com/x/web/archives', data: { code: -352, message: '风控' } }
    const seen = []
    let r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios: fakeAxios([NAV_OK, bad]) })
    expect(r.reason).toBe('envelope-not-ok')
    r = await checkBilibiliAuditStatus({
      postId: TARGET, cookies: 'x',
      axios: fakeAxios([NAV_OK, { match: 'https://member.bilibili.com/x/web/archives', data: { code: 0, data: { class: { pubed: 6, is_pubing: 3 }, page: { count: 6 } } } }])
    })
    expect(r.reason).toBe('no-audit-array')
    r = await checkBilibiliAuditStatus({
      postId: TARGET, cookies: 'x',
      axios: fakeAxios([{ match: 'https://api.bilibili.com/x/web-interface/nav', data: { code: -101 } }, LIST_OK])
    })
    expect(r.reason).toBe('nav-not-established')
    r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: '', axios: fakeAxios([NAV_OK, LIST_OK]) })
    expect(r.reason).toBe('no-cookies')
    r = await checkBilibiliAuditStatus({ postId: '', cookies: 'x', axios: fakeAxios([NAV_OK, LIST_OK]) })
    expect(r.reason).toBe('no-post-id')
    expect(seen).toEqual([])
  })

  // A8：中途抛错不得产出正向结论
  it('A8 扇出第二跳抛错 ⇒ error，且绝不产出 published', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const axios = {
      get: vi.fn(async (url) => {
        const u = String(url)
        if (u.includes('/nav')) return { data: { code: 0, data: { mid: 1 } } }
        if (/[?&]status=is_pubing/.test(u)) throw new Error('socket hang up')
        return { data: listBody({ pubed: 7, not_pubed: 0, is_pubing: 2 }, [{ bvid: 'BVother000001' }]) }
      })
    }
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.status).toBe('error')
  })

  // A9：桶替换只改 status，其余 query 与顺序原样
  it('A9 withStatusParam 替换既有 status、追加缺失的 status，且保留其余参数与顺序', async () => {
    const { withStatusParam } = require$(MOD_PATH)
    expect(withStatusParam(PUBED_URL, 'is_pubing'))
      .toBe('https://member.bilibili.com/x/web/archives?status=is_pubing&pn=1&ps=20&platform=web')
    expect(withStatusParam('https://member.bilibili.com/x/web/archives?pn=1&ps=20', 'not_pubed'))
      .toBe('https://member.bilibili.com/x/web/archives?pn=1&ps=20&status=not_pubed')
    const once = withStatusParam(PUBED_URL, 'not_pubed')
    expect(once.match(/status=/g)).toHaveLength(1)
    expect(once).toContain('platform=web')
  })

  // A11：日志出口 —— 服务层分桶了但日志不打出来，取证现场照样拿不到 state
  it('A11 poll-progress 携带 bucket/state/primaryState/stateDesc；monitor-timeout 携带 lastReason', async () => {
    const monitor = require$(MONITOR_PATH)
    const log = require$('./logger')
    const seen = []
    vi.useFakeTimers()
    try {
      const spy = vi.spyOn(log, 'notify').mockImplementation((tag, event, payload) => { seen.push({ event, params: payload && payload.params }) })
      const axios = bucketAxios({
        pubed: listBody({ pubed: 7, not_pubed: 0, is_pubing: 1 }, [{ bvid: 'BVother000001' }]),
        is_pubing: listBody({ pubed: 7, not_pubed: 0, is_pubing: 1 }, [{ state: 5, primary_state: 5, state_desc: '审核中' }])
      })
      const task = monitor.createMonitorTask({
        postId: TARGET, platform: 'bilibili', cookies: 'x', axios, callback: () => {}, maxRetries: 2
      })
      // 每次推进 POLL_INTERVAL 后必须让注入的 axios（纯微任务）落定，再推进下一次
      await vi.advanceTimersByTimeAsync(10000)
      await vi.advanceTimersByTimeAsync(10000)
      task.stop && task.stop()
      spy.mockRestore()
    } finally {
      vi.useRealTimers()
    }
    const events = seen.map((s) => s.event)
    const progress = seen.find((s) => s.event === 'poll-progress')
    const timeout = seen.find((s) => s.event === 'monitor-timeout')
    expect(events, '未见 poll-progress/monitor-timeout: ' + JSON.stringify(events)).toContain('poll-progress')
    expect(progress.params.reason).toBe('in-review-bucket')
    expect(progress.params.bucket).toBe('is_pubing')
    expect(progress.params.state).toBe(5)
    expect(progress.params.stateDesc).toBe('审核中')
    expect(timeout, 'maxRetries=2 应走到超时出口').toBeTruthy()
    expect(timeout.params.lastReason).toBe('in-review-bucket')
  })

  // A12：桶键来自第三方响应且要进 URL ⇒ 不过形态白名单的键一律不得成为请求目标
  it('A12 data.class 里出现异常键名（含 # / & / 空格 / 超长）⇒ 不据此发起请求', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const seen = []
    const evil = { 'a#x=1': 5, 'b&c': 5, 'with space': 5, ['y'.repeat(40)]: 5, 'ok_key': 0 }
    const axios = bucketAxios({
      pubed: listBody(Object.assign({ pubed: 7, not_pubed: 0, is_pubing: 0 }, evil), [{ bvid: 'BVother000001' }]),
    }, seen)
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.reason).toBe('not-in-list')
    // 只发了主桶那一跳：任何异常键都没被拼进 URL
    expect(seen).toEqual(['pubed'])
    const urls = axios.get.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => /a%23x|a#x|with%20space|with space|&b%26c|b&c/.test(u))).toBe(false)
    expect(urls.every((u) => u.indexOf('status=') === u.lastIndexOf('status='))).toBe(true)
  })

  // A13 跨模块真实现契约锁：分桶新增的三种 pending reason 走到写回边界必须不产出补丁。
  // 这里注入的是**真** shared-utils 实现，不是 mock —— mock 会把「对方怎么读」替成我的想象，
  // 那正是本仓反复踩到的装饰性契约（AGENTS.md「契约夹具不得替对方剥壳」同族）。
  it('A13 分桶产出的每个无定论出口，经真 buildAuditPatch 都不产出审核补丁', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const { buildAuditPatch, mapMonitorStatusToAuditStatus } = require$('@multi-publish/shared-utils/src/publish-audit-status')
    // 先锁对方口径本身：pending 必须映射为 null（对方改了口径这条先红）
    expect(mapMonitorStatusToAuditStatus('pending')).toBe(null)

    const cases = [
      { name: 'in-review-bucket', buckets: { pubed: listBody({ pubed: 1, is_pubing: 1 }, [{ bvid: 'BVother000001' }]), is_pubing: listBody({ pubed: 1, is_pubing: 1 }, [{ state: 5, primary_state: 5 }]) } },
      { name: 'in-not-pubed-bucket', buckets: { pubed: listBody({ pubed: 1, not_pubed: 1 }, [{ bvid: 'BVother000001' }]), not_pubed: listBody({ pubed: 1, not_pubed: 1 }, [{ state: 0, primary_state: 0 }]) } },
      { name: 'not-in-list', buckets: { pubed: listBody({ pubed: 1, not_pubed: 0, is_pubing: 0 }, [{ bvid: 'BVother000001' }]) } },
      { name: 'state-unobserved', buckets: { pubed: listBody({ pubed: 1, not_pubed: 0, is_pubing: 0 }, [{ state: 9, primary_state: 9 }]) } },
    ]
    for (const c of cases) {
      const seen = []
      const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios: bucketAxios(c.buckets, seen) })
      expect(r.status).toBe('pending')
      expect(r.reason).toBe(c.name)
      expect(buildAuditPatch(r), c.name + ' 不得产出审核补丁').toBe(null)
    }
  })

  // A14（QM-6 前端轴 W1）：形态校验必须落在导出的函数边界上，不能只在调用点
  it('A14 withStatusParam 自身拒绝非法 status（导出面不得依赖调用方自律）', () => {
    const { withStatusParam } = require$(MOD_PATH)
    for (const bad of ['a#x=1', 'b&c', 'with space', '', null, undefined, 'y'.repeat(40)]) {
      expect(() => withStatusParam(PUBED_URL, bad)).toThrow(/BILIBILI_BUCKET_KEY_INVALID/)
    }
    expect(() => withStatusParam(PUBED_URL, 'is_pubing')).not.toThrow()
  })

  // A15（QM-6 前端轴 I7 + I4）：扇出有硬上限，截断必须出声；未知桶 reason 用 kebab 形态
  it('A15 补查桶数封顶 MAX_BUCKET_PROBES，超限时 bucketsTruncated 为真且未知桶走 in-<key>-bucket', async () => {
    const { checkBilibiliAuditStatus, MAX_BUCKET_PROBES } = require$(MOD_PATH)
    expect(MAX_BUCKET_PROBES).toBeGreaterThan(0)
    const seen = []
    // 造一个回报 6 个非空未知桶的响应，远超上限
    const many = { pubed: 7 }
    for (let i = 0; i < MAX_BUCKET_PROBES + 3; i++) many['bkt' + i] = 2
    const axios = bucketAxios({
      pubed: listBody(many, [{ bvid: 'BVother000001' }]),
    }, seen)
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.reason).toBe('not-in-list')
    // 主桶 1 跳 + 最多 MAX_BUCKET_PROBES 跳补查
    expect(seen.length).toBeLessThanOrEqual(1 + MAX_BUCKET_PROBES)
    expect(r.bucketsProbed.length).toBeLessThanOrEqual(1 + MAX_BUCKET_PROBES)
    expect(r.bucketsTruncated).toBe(true)
  })

  it('A15b 未超限时不得谎报截断', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const r = await checkBilibiliAuditStatus({
      postId: TARGET, cookies: 'x',
      axios: bucketAxios({ pubed: listBody({ pubed: 7, not_pubed: 1, is_pubing: 0 }, [{ bvid: 'BVother000001' }]), not_pubed: listBody({ pubed: 7, not_pubed: 1, is_pubing: 0 }, [{ bvid: 'BVother000002' }]) }),
    })
    expect(r.bucketsTruncated).toBe(false)
  })

  it('A15c 未知桶键命中 ⇒ reason 是 in-<key>-bucket（不是带冒号的另一套形态）', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const axios = bucketAxios({
      pubed: listBody({ pubed: 1, draft_review: 1 }, [{ bvid: 'BVother000001' }]),
      draft_review: listBody({ pubed: 1, draft_review: 1 }, [{ state: 7, primary_state: 7 }]),
    })
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.reason).toBe('in-draft_review-bucket')
    expect(r.status).toBe('pending')
    expect(r.state).toBe(7)
  })

  // A16（QM-6 前端轴 I3）：中途抛错也要说得出探到哪一步
  it('A16 扇出中途抛错 ⇒ error 出口仍带 bucketsProbed（可归因到第几跳）', async () => {
    const { checkBilibiliAuditStatus } = require$(MOD_PATH)
    const axios = {
      get: async (url) => {
        const u = String(url)
        if (u.includes('/nav')) return { data: { code: 0, data: { mid: 1 } } }
        if (/[?&]status=is_pubing/.test(u)) throw new Error('socket hang up')
        return { data: listBody({ pubed: 7, not_pubed: 0, is_pubing: 2 }, [{ bvid: 'BVother000001' }]) }
      },
    }
    const r = await checkBilibiliAuditStatus({ postId: TARGET, cookies: 'x', axios })
    expect(r.status).toBe('error')
    expect(r.bucketsProbed).toEqual(['pubed', 'is_pubing'])
  })

  // A17（QM-6 前端轴 I2）：超时时刻一行定场
  it('A17 monitor-timeout 携带 lastBucket/lastState/lastBucketsProbed', async () => {
    const monitor = require$(MONITOR_PATH)
    const log = require$('./logger')
    const seen = []
    vi.useFakeTimers()
    try {
      const spy = vi.spyOn(log, 'notify').mockImplementation((tag, event, payload) => { seen.push({ event, params: payload && payload.params }) })
      const axios = bucketAxios({
        pubed: listBody({ pubed: 7, not_pubed: 0, is_pubing: 1 }, [{ bvid: 'BVother000001' }]),
        is_pubing: listBody({ pubed: 7, not_pubed: 0, is_pubing: 1 }, [{ state: 5, primary_state: 5, state_desc: '审核中' }]),
      })
      const task = monitor.createMonitorTask({ postId: TARGET, platform: 'bilibili', cookies: 'x', axios, callback: () => {}, maxRetries: 1 })
      await vi.advanceTimersByTimeAsync(10000)
      task.stop && task.stop()
      spy.mockRestore()
    } finally {
      vi.useRealTimers()
    }
    const timeout = seen.find((s) => s.event === 'monitor-timeout')
    expect(timeout, '应走到超时出口，实际事件=' + JSON.stringify(seen.map((s) => s.event))).toBeTruthy()
    expect(timeout.params.lastReason).toBe('in-review-bucket')
    expect(timeout.params.lastBucket).toBe('is_pubing')
    expect(timeout.params.lastState).toBe(5)
    expect(timeout.params.lastStateDesc).toBe('审核中')
    expect(timeout.params.lastBucketsProbed).toBe('pubed,is_pubing')
  })
})
