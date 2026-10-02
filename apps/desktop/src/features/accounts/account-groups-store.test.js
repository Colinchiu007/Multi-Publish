/**
 * account-groups-store.test.js — 账号分组落持久化真源（P2-8a）
 *
 * 三条不可省的语义（逐条对应 PRD §三 校验表）：
 * ① 「读不到」不得读成「用户没有分组」——settings 读接口在 api 层会把出错塌成 null，
 *    所以本模块必须走**保留信封**的读法，并在非 0 码时返回 ok:false，
 *    让调用方**拒绝覆盖写入**（把 AUTH_ERROR 当空分组再保存一次 = 抹掉用户真源）；
 * ② 迁移一次性且**非破坏**——localStorage 旧数据不得被删除；
 * ③ 校验失败按条出声并归类，不得静默丢成员（用户重新导入账号后应能恢复引用）。
 */
import { describe, expect, it, vi } from 'vitest'

import {
  ACCOUNT_GROUPS_KEY,
  GROUP_NAME_MAX,
  LEGACY_ACCOUNT_GROUPS_KEY,
  MAX_ACCOUNT_GROUPS,
  MAX_GROUP_ACCOUNTS,
  loadAccountGroups,
  normalizeAccountGroups,
  saveAccountGroups,
} from './account-groups-store'

const PLATFORMS = ['douyin', 'wechat_mp', 'zhihu']
const ACCOUNTS = [
  { id: 'a_dy_1', platform: 'douyin' },
  { id: 'a_dy_2', platform: 'douyin' },
  { id: 'a_wx_1', platform: 'wechat_mp' },
]
const CTX = { knownPlatformIds: PLATFORMS, accounts: ACCOUNTS }

const okRead = (data) => async () => ({ code: 0, data })
const errRead = (code = 401) => async () => ({ code, message: '无法识别当前用户' })

describe('normalizeAccountGroups（§三 1-8）', () => {
  it('顶层不是数组 ⇒ 整份视为空并标 invalid（不得逐元素猜）', () => {
    const r = normalizeAccountGroups({ groups: [] }, CTX)
    expect(r.groups).toEqual([])
    expect(r.invalidShape).toBe(true)
  })

  it('合法分组逐值保留', () => {
    const raw = [{ id: 'g1', name: '主力', platformFilter: 'douyin', accountIds: ['a_dy_1', 'a_dy_2'] }]
    const r = normalizeAccountGroups(raw, CTX)
    expect(r.groups).toEqual(raw)
    expect(r.invalidShape).toBe(false)
  })

  it('name 两侧空白被裁、超长按条丢弃', () => {
    const r = normalizeAccountGroups(
      [{ id: 'g1', name: '  带空格  ', platformFilter: null, accountIds: [] },
       { id: 'g2', name: 'x'.repeat(GROUP_NAME_MAX + 1), platformFilter: null, accountIds: [] }],
      CTX,
    )
    expect(r.groups[0].name).toBe('带空格')
    expect(r.dropped.find(d => d.reason === 'name')).toMatchObject({ id: 'g2' })
  })

  it('同 (platformFilter, name) 重复 ⇒ 只留第一个并记 duplicateName', () => {
    const r = normalizeAccountGroups(
      [{ id: 'g1', name: '主力', platformFilter: 'douyin', accountIds: [] },
       { id: 'g2', name: '主力', platformFilter: 'douyin', accountIds: [] }],
      CTX,
    )
    expect(r.groups.map(g => g.id)).toEqual(['g1'])
    expect(r.dropped.find(d => d.reason === 'duplicateName').id).toBe('g2')
  })

  it('未知 platformFilter ⇒ 降级为「全平台」并记 droppedFilter（不得渲染成筛不到账号的组）', () => {
    const r = normalizeAccountGroups(
      [{ id: 'g1', name: '旧平台', platformFilter: 'tencent_video_legacy_x', accountIds: [] }],
      CTX,
    )
    expect(r.groups[0].platformFilter).toBeNull()
    expect(r.dropped.find(d => d.reason === 'platformFilter').value).toBe('tencent_video_legacy_x')
  })

  it('accountIds：去重、丢非字符串、不认识的 id 归入 unresolved 并**保留在组里**', () => {
    const r = normalizeAccountGroups(
      [{ id: 'g1', name: '混', platformFilter: 'douyin', accountIds: ['a_dy_1', 'a_dy_1', 42, 'a_gone'] }],
      CTX,
    )
    expect(r.groups[0].accountIds).toEqual(['a_dy_1', 'a_gone'])
    expect(r.unresolved).toEqual(['a_gone'])
  })

  it('accountIds 缺失 ⇒ 按 platformFilter 从现有账号回填（沿用既有迁移语义）', () => {
    const r = normalizeAccountGroups([{ id: 'g1', name: '无成员', platformFilter: 'douyin' }], CTX)
    expect(r.groups[0].accountIds).toEqual(['a_dy_1', 'a_dy_2'])
    expect(r.healed).toBe(1)
  })

  it('id 缺失/重复 ⇒ 补齐且保证唯一（不得用 name 当 id）', () => {
    const r = normalizeAccountGroups(
      [{ name: 'A', platformFilter: null, accountIds: [] },
       { name: 'B', platformFilter: null, accountIds: [] }],
      CTX,
    )
    expect(r.groups.every(g => typeof g.id === 'string' && g.id)).toBe(true)
    expect(new Set(r.groups.map(g => g.id)).size).toBe(2)
  })

  it('组数超上限 ⇒ 截断并如实报 limitReached（不静默吞）', () => {
    const raw = Array.from({ length: MAX_ACCOUNT_GROUPS + 5 }, (_, i) => ({
      id: `g${i}`, name: `组${i}`, platformFilter: null, accountIds: [],
    }))
    const r = normalizeAccountGroups(raw, CTX)
    expect(r.groups).toHaveLength(MAX_ACCOUNT_GROUPS)
    expect(r.limitReached).toBe(true)
  })

  it('组内成员超上限 ⇒ 截断并记 membersTruncated', () => {
    const ids = Array.from({ length: MAX_GROUP_ACCOUNTS + 3 }, (_, i) => `a_dy_1#${i}`)
    const r = normalizeAccountGroups([{ id: 'g1', name: '巨组', platformFilter: null, accountIds: ids }], CTX)
    expect(r.groups[0].accountIds).toHaveLength(MAX_GROUP_ACCOUNTS)
    expect(r.dropped.find(d => d.reason === 'membersTruncated').id).toBe('g1')
  })
})

describe('loadAccountGroups（§三 9/11 + 迁移）', () => {
  it('读接口返回非 0 码 ⇒ ok:false 且**不得**交出空数组当事实', async () => {
    const warn = vi.fn()
    const r = await loadAccountGroups({ read: errRead(401), readLegacy: () => null, warn, ctx: CTX })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('unreadable')
    expect(r.groups).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('读成功但无记录、legacy 也无 ⇒ ok:true + 空数组 + 未迁移', async () => {
    const r = await loadAccountGroups({ read: okRead(null), readLegacy: () => null, ctx: CTX })
    expect(r).toMatchObject({ ok: true, groups: [], migrated: false })
  })

  it('legacy 有 / 真源无 ⇒ 迁移写入一次，且**绝不删除** localStorage', async () => {
    const legacy = [{ id: 'g1', name: '老组', platformFilter: 'douyin', accountIds: ['a_dy_1'] }]
    const write = vi.fn(async () => ({ code: 0, data: true }))
    const store = { mp_account_groups: JSON.stringify(legacy) }
    const readLegacy = (key) => store[key] ?? null
    const r = await loadAccountGroups({
      read: okRead(null), readLegacy, write, warn: vi.fn(), ctx: CTX,
    })
    expect(r.migrated).toBe(true)
    expect(write).toHaveBeenCalledWith(ACCOUNT_GROUPS_KEY, expect.arrayContaining([expect.objectContaining({ id: 'g1' })]))
    // 非破坏迁移：既不调 removeItem，也不把 legacy 覆写掉
    expect(readLegacy(LEGACY_ACCOUNT_GROUPS_KEY)).toBe(JSON.stringify(legacy))
  })

  it('两侧都有 ⇒ 以真源为准（legacy 不参与合并，避免同名组各留一份）', async () => {
    const r = await loadAccountGroups({
      read: okRead([{ id: 'from_store', name: '真源组', platformFilter: null, accountIds: [] }]),
      readLegacy: () => JSON.stringify([{ id: 'from_ls', name: '旧组', platformFilter: null, accountIds: [] }]),
      ctx: CTX,
    })
    expect(r.groups.map(g => g.id)).toEqual(['from_store'])
    expect(r.migrated).toBe(false)
  })

  it('浏览器 dev server 无 electronAPI（read 返回 undefined）⇒ ok:false，不得当成"没有分组"', async () => {
    const warn = vi.fn()
    const r = await loadAccountGroups({ read: async () => undefined, readLegacy: () => null, warn, ctx: CTX })
    expect(r.ok).toBe(false)
    expect(warn).toHaveBeenCalled()
  })
})

describe('saveAccountGroups（§三 10/12）', () => {
  it('写接口返回非 0 码 ⇒ ok:false 并出声（"未能保存"必须能被界面看见）', async () => {
    const warn = vi.fn()
    const r = await saveAccountGroups({ write: async () => ({ code: 500, message: 'db busy' }), warn }, [{ id: 'g1', name: 'A' }])
    expect(r.ok).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('写盘前脱壳：reactive proxy 不得原样进 IPC（AGENTS.md 序列化铁律）', async () => {
    const { reactive } = await import('vue')
    const write = vi.fn(async () => ({ code: 0, data: true }))
    const groups = reactive([{ id: 'g1', name: 'A', platformFilter: null, accountIds: ['a_dy_1'] }])
    await saveAccountGroups({ write, warn: vi.fn() }, groups)
    const sent = write.mock.calls[0][1]
    expect(Array.isArray(sent)).toBe(true)
    expect(JSON.stringify(sent)).toBe(JSON.stringify([{ id: 'g1', name: 'A', platformFilter: null, accountIds: ['a_dy_1'] }]))
    // 深拷贝后改发出值不得回写内存态（否则一次保存会污染正在编辑的分组）
    sent[0].name = '改动'
    expect(groups[0].name).toBe('A')
  })

  it('空数组是合法终态（用户删光所有组），不得被当"没数据"跳过写盘', async () => {
    const write = vi.fn(async () => ({ code: 0, data: true }))
    const r = await saveAccountGroups({ write, warn: vi.fn() }, [])
    expect(write).toHaveBeenCalledWith(ACCOUNT_GROUPS_KEY, [])
    expect(r.ok).toBe(true)
  })
})
