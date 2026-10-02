// @ts-check
/**
 * auth-partition — API-first 凭证分区兜底模块回归测试（D1，kuaishou-w3-live-fix）
 *
 * 契约：
 * 1. findAuthPartitionDir 与 _restoreAuthPartitionCookies 同源前缀规则（auth-auth-/auth-/account-）
 * 2. collectAuthPartitionCookies 只读分区，按 isPlatformCookieDomain 过滤，同名去重，拼 name=value 串
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

__enableElectronMock()

let authPartition

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  authPartition = await import('./auth-partition.js')
  authPartition = authPartition.default || authPartition
})

function mockFsPartitions (dirs) {
  const fs = require('fs')
  vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
    const s = String(p).replace(/\\/g, '/')
    return s.endsWith('/Partitions')
  })
  vi.spyOn(fs, 'readdirSync').mockReturnValue(dirs)
  vi.spyOn(fs, 'statSync').mockImplementation(() => ({ isDirectory: () => true }))
}

describe('auth-partition — listAuthPartitionCandidates（前缀规则与顺序）', () => {
  it('按 account-{accountId} 前缀定位分区名', () => {
    mockFsPartitions(['account-a4505f45', 'browse-tab-1'])
    expect(authPartition.listAuthPartitionCandidates('kuaishou', 'a4505f45')).toEqual(['account-a4505f45'])
  })

  it('按 auth-auth-{platform}- 前缀定位，候选**从新到旧**（#2734 起不再只取末位）', () => {
    mockFsPartitions(['auth-auth-kuaishou-100', 'auth-auth-kuaishou-200', 'other'])
    expect(authPartition.listAuthPartitionCandidates('kuaishou', null))
      .toEqual(['auth-auth-kuaishou-200', 'auth-auth-kuaishou-100'])
  })

  it('账号级前缀优先于平台级前缀（不得把别的账号的分区混进候选组）', () => {
    mockFsPartitions(['account-a4505f45', 'auth-auth-kuaishou-999'])
    expect(authPartition.listAuthPartitionCandidates('kuaishou', 'a4505f45')).toEqual(['account-a4505f45'])
  })

  it('无匹配分区返回空数组（不是 null —— 空数组才让「无候选」与「探过都空」可分）', () => {
    mockFsPartitions(['browse-tab-1', 'other'])
    expect(authPartition.listAuthPartitionCandidates('kuaishou', 'acc-1')).toEqual([])
  })
})

describe('auth-partition — collectAuthPartitionCookies', () => {
  function mockPartitionCookies (cookies) {
    const electron = require('electron')
    electron.session.fromPartition = vi.fn(() => ({
      cookies: { get: vi.fn().mockResolvedValue(cookies) },
    }))
  }

  it('D1 主场景：kuaishou 分区 cookie 拼出 name=value; 串', async () => {
    mockFsPartitions(['account-a4505f45'])
    mockPartitionCookies([
      { name: 'kuaishou.web.cp.api_st', value: 'sess', domain: 'cp.kuaishou.com' },
      { name: 'userId', value: 'u1', domain: '.kuaishou.com' },
    ])
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', 'a4505f45')
    expect(res.partition).toBe('account-a4505f45')
    expect(res.cookieString).toBe('kuaishou.web.cp.api_st=sess; userId=u1')
    expect(res.count).toBe(2)
  })

  it('跨平台域 cookie 被过滤（不串味）', async () => {
    mockFsPartitions(['account-a4505f45'])
    mockPartitionCookies([
      { name: 'sid', value: 'ks', domain: 'cp.kuaishou.com' },
      { name: 'xhs_token', value: 'nope', domain: 'xiaohongshu.com' },
    ])
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', 'a4505f45')
    expect(res.cookieString).toBe('sid=ks')
    expect(res.count).toBe(1)
  })

  it('同名 cookie 去重（保留后出现的高优先级值）', async () => {
    mockFsPartitions(['account-a4505f45'])
    mockPartitionCookies([
      { name: 'did', value: 'old', domain: 'kuaishou.com' },
      { name: 'did', value: 'new', domain: 'cp.kuaishou.com' },
    ])
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', 'a4505f45')
    expect(res.cookieString).toBe('did=new')
    expect(res.count).toBe(1)
  })

  it('分区不存在时返回空结果，不抛错', async () => {
    mockFsPartitions(['browse-tab-1'])
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', 'acc-missing')
    expect(res.cookieString).toBe('')
    expect(res.partition).toBeNull()
    expect(res.count).toBe(0)
    expect(res.reason).toBe('no-candidate')
  })

  it('分区 session 读取抛错时降级为空结果（不得炸发布主链）', async () => {
    mockFsPartitions(['account-a4505f45'])
    const electron = require('electron')
    electron.session.fromPartition = vi.fn(() => { throw new Error('partition locked') })
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', 'a4505f45')
    expect(res.cookieString).toBe('')
  })
})
// @ts-check
/**
 * #2734 回归块：兜底分区按内容择新。
 *
 * 复现 issue 的形状：同组两份分区，**新的那份是一次失败/取消登录留下的空壳**，
 * 真正持有登录态的是较旧的那份。旧口径「只读字典序末位」会被空壳长期遮断 ——
 * 用户侧是「账号明明登录过，发布却报未登录」，且重试/重启都不好（空壳仍是最新）。
 */
describe('auth-partition — 兜底分区按内容择新（#2734）', () => {
  /** 按分区名给 cookie：fromPartition('persist:<name>') 只回该 name 的内容，并记录探测顺序 */
  function mockCookiesByPartition (byName) {
    const electron = require('electron')
    const probed = []
    electron.session.fromPartition = vi.fn((uri) => {
      const name = String(uri).replace(/^persist:/, '')
      probed.push(name)
      const v = byName[name]
      if (v instanceof Error) throw v
      return { cookies: { get: vi.fn().mockResolvedValue(v === undefined ? [] : v) } }
    })
    return probed
  }

  const KS = { name: 'kuaishou.web.cp.api_st', value: 'sess', domain: 'cp.kuaishou.com' }

  it('新分区是空壳、旧分区含平台 cookie ⇒ 必须选旧的那份（issue 主场景）', async () => {
    mockFsPartitions(['auth-auth-kuaishou-100', 'auth-auth-kuaishou-200'])
    const probed = mockCookiesByPartition({
      'auth-auth-kuaishou-200': [],
      'auth-auth-kuaishou-100': [KS],
    })
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', null)
    expect(res.partition).toBe('auth-auth-kuaishou-100')
    expect(res.cookieString).toBe('kuaishou.web.cp.api_st=sess')
    expect(probed).toEqual(['auth-auth-kuaishou-200', 'auth-auth-kuaishou-100'])
  })

  it('命中即停：最新一份就有平台 cookie 时不得继续探（探测成本不随残留数增长）', async () => {
    mockFsPartitions(['auth-auth-kuaishou-100', 'auth-auth-kuaishou-200', 'auth-auth-kuaishou-300'])
    const probed = mockCookiesByPartition({ 'auth-auth-kuaishou-300': [KS] })
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', null)
    expect(res.partition).toBe('auth-auth-kuaishou-300')
    expect(probed).toEqual(['auth-auth-kuaishou-300'])
  })

  it('别的平台的 cookie 不算命中（不串味，继续往旧探）', async () => {
    mockFsPartitions(['auth-auth-kuaishou-100', 'auth-auth-kuaishou-200'])
    const probed = mockCookiesByPartition({
      'auth-auth-kuaishou-200': [{ name: 'xhs_token', value: 'v', domain: 'xiaohongshu.com' }],
      'auth-auth-kuaishou-100': [KS],
    })
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', null)
    expect(res.partition).toBe('auth-auth-kuaishou-100')
    expect(res.cookieString).toBe('kuaishou.web.cp.api_st=sess')
    expect(probed.length).toBe(2)
  })

  it('只探最近 PROBE_LIMIT 份：窗口外的旧分区不得被打开（与回收端共用同一条边界）', async () => {
    const many = []
    for (let i = 1; i <= 9; i++) many.push('auth-auth-kuaishou-' + (100 + i))
    mockFsPartitions(many)
    const probed = mockCookiesByPartition({})
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', null)
    expect(probed).toEqual([
      'auth-auth-kuaishou-109', 'auth-auth-kuaishou-108', 'auth-auth-kuaishou-107',
      'auth-auth-kuaishou-106', 'auth-auth-kuaishou-105',
    ])
    expect(probed.length).toBe(authPartition.PROBE_LIMIT)
    expect(res.partition).toBeNull()
    expect(res.reason).toBe('all-empty')
  })

  it('窗口内全为空 ⇒ partition=null 且 reason=all-empty，日志必须列出探过哪几份', async () => {
    mockFsPartitions(['auth-auth-kuaishou-100', 'auth-auth-kuaishou-200'])
    mockCookiesByPartition({})
    const logger = require('./logger')
    const spy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', null)
    expect(res.partition).toBeNull()
    expect(res.cookieString).toBe('')
    expect(res.probed).toEqual(['auth-auth-kuaishou-200', 'auth-auth-kuaishou-100'])
    const msg = spy.mock.calls.map((c) => String(c[1])).join(' | ')
    expect(msg).toContain('auth-auth-kuaishou-200')
    expect(msg).toContain('auth-auth-kuaishou-100')
    expect(msg).toMatch(/probed=2/)
  })

  it('无候选目录与「探过都为空」必须是两种可区分的日志（#2734 要求的现场归因）', async () => {
    mockFsPartitions(['browse-tab-1'])
    const logger = require('./logger')
    const spy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', 'acc-missing')
    expect(res.reason).toBe('no-candidate')
    const msg = spy.mock.calls.map((c) => String(c[1])).join(' ')
    expect(msg).toMatch(/no auth partition candidate/)
    expect(msg).not.toMatch(/probed=/)
  })

  it('单份探测抛错不得中断整轮兜底：跳过它继续探旧的', async () => {
    mockFsPartitions(['auth-auth-kuaishou-100', 'auth-auth-kuaishou-200'])
    mockCookiesByPartition({
      'auth-auth-kuaishou-200': new Error('partition locked'),
      'auth-auth-kuaishou-100': [KS],
    })
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', null)
    expect(res.partition).toBe('auth-auth-kuaishou-100')
    expect(res.cookieString).toBe('kuaishou.web.cp.api_st=sess')
  })

  it('全部候选都探测失败 ⇒ reason=probe-failed，不得谎报 all-empty（不确定 ≠ 没有）', async () => {
    mockFsPartitions(['auth-auth-kuaishou-100', 'auth-auth-kuaishou-200'])
    mockCookiesByPartition({
      'auth-auth-kuaishou-100': new Error('locked'),
      'auth-auth-kuaishou-200': new Error('locked'),
    })
    const res = await authPartition.collectAuthPartitionCookies('kuaishou', null)
    expect(res.partition).toBeNull()
    expect(res.reason).toBe('probe-failed')
    expect(res.cookieString).toBe('')
  })

  it('PROBE_LIMIT 必须是导出的单一真源，且与回收端是同一个数（两处各写一遍即互相吃掉候选）', () => {
    expect(typeof authPartition.PROBE_LIMIT).toBe('number')
    expect(authPartition.PROBE_LIMIT).toBeGreaterThanOrEqual(3)
    const reclaim = require('./auth-partition-reclaim.js')
    expect(reclaim.PROBE_LIMIT).toBe(authPartition.PROBE_LIMIT)
  })
})
