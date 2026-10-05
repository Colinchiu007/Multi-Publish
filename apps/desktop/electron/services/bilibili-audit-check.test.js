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
