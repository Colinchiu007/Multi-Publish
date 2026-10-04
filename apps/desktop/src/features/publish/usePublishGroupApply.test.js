import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { applyAccountGroup } from './usePublishGroupApply'

// 夹具：一个「假账号库 + 假选中集」，但写入顺序与可用性判据都按真实宿主语义建模。
// 之所以要自己记账调用顺序：本文件最重要的一条锁（平台必须先于账号被选中）
// 只有在替身真的记录顺序时才可表示。
function makeDeps (opts = {}) {
  const accounts = opts.accounts || [
    { id: 'a1', platform: 'wechat_mp' },
    { id: 'a2', platform: 'douyin' },
    { id: 'a3', platform: 'zhihu' },
  ]
  const available = opts.available === undefined
    ? new Set(accounts.map(a => a.id))
    : new Set(opts.available)
  const byId = new Map(accounts.map(a => [a.id, a]))
  const calls = []

  return {
    calls,
    deps: {
      resolveAccount: (id) => byId.get(id) || null,
      isAccountAvailable: (platformId, accountId) => {
        const a = byId.get(accountId)
        // 宿主口径：可用性既看账号存在，也看它确实属于所说平台（getAvailableAccountIds 按平台取集合）
        return !!a && a.platform === platformId && available.has(accountId)
      },
      isPlatformSelected: (platformId) => (opts.selectedPlatforms || []).includes(platformId),
      isAccountSelected: (platformId, accountId) => (opts.selectedAccounts || {})[platformId]?.includes(accountId) === true,
      selectPlatform: (platformId) => { calls.push(['platform', platformId]) },
      selectAccount: (platformId, accountId) => { calls.push(['account', platformId, accountId]) },
    },
  }
}

describe('applyAccountGroup（发布页按组添加）', () => {
  it('添加未选中的成员：账号与其平台都进入选中集，并按真实顺序写入', () => {
    const { deps, calls } = makeDeps({ selectedPlatforms: ['wechat_mp'], selectedAccounts: { wechat_mp: ['a1'] } })
    const group = { id: 'g1', name: '常用号', platformFilter: null, accountIds: ['a1', 'a2'] }

    const result = applyAccountGroup(group, deps)

    expect(result).toEqual({
      ok: true,
      added: [{ platformId: 'douyin', accountId: 'a2' }],
      already: [{ platformId: 'wechat_mp', accountId: 'a1' }],
      skipped: [],
      platforms: ['douyin'],
    })
    // 顺序锁（§九 L2）：douyin 必须**先**被 selectPlatform，之后才轮到 selectAccount。
    // usePlatformSelection.js:139-142 的 reconcile 会删掉「不在 selectedPlatforms 里的平台键」，
    // 顺序反了就是点了没反应。
    expect(calls).toEqual([['platform', 'douyin'], ['account', 'douyin', 'a2']])
  })

  it('平台已被选中时不得重复 selectPlatform，但账号仍要写入', () => {
    const { deps, calls } = makeDeps({ selectedPlatforms: ['douyin'], selectedAccounts: {} })
    const result = applyAccountGroup({ id: 'g', name: 'n', platformFilter: null, accountIds: ['a2'] }, deps)

    expect(result.added).toEqual([{ platformId: 'douyin', accountId: 'a2' }])
    expect(result.platforms).toEqual([])
    expect(calls).toEqual([['account', 'douyin', 'a2']])
  })

  it('分类互斥且穷尽：added + already + skipped 恰等于成员数（§九 L1）', () => {
    // a1 已选中；a2 已停用（不在 available）；a9 查不到；a3 正常
    const { deps } = makeDeps({
      available: ['a1', 'a3'],
      selectedPlatforms: ['wechat_mp'],
      selectedAccounts: { wechat_mp: ['a1'] },
    })
    const result = applyAccountGroup(
      { id: 'g', name: 'n', platformFilter: null, accountIds: ['a1', 'a2', 'a9', 'a3'] },
      deps,
    )

    expect(result.added).toEqual([{ platformId: 'zhihu', accountId: 'a3' }])
    expect(result.already).toEqual([{ platformId: 'wechat_mp', accountId: 'a1' }])
    expect(result.skipped).toEqual([
      { accountId: 'a2', reason: 'inactive' },
      { accountId: 'a9', reason: 'missing' },
    ])
    expect(result.added.length + result.already.length + result.skipped.length).toBe(4)
  })

  it('成员平台与 platformFilter 不符时按 platformMismatch 跳过，不写进别的平台桶', () => {
    const { deps, calls } = makeDeps({ selectedPlatforms: [], selectedAccounts: {} })
    const result = applyAccountGroup(
      { id: 'g', name: 'n', platformFilter: 'douyin', accountIds: ['a2', 'a3'] },
      deps,
    )

    expect(result.added).toEqual([{ platformId: 'douyin', accountId: 'a2' }])
    expect(result.skipped).toEqual([{ accountId: 'a3', reason: 'platformMismatch', platform: 'zhihu' }])
    expect(calls).toEqual([['platform', 'douyin'], ['account', 'douyin', 'a2']])
  })

  it('幂等：同一组连点两次，第二次 added=0 且不再调用任何写入器（§九 L4）', () => {
    const probe = makeDeps({ selectedPlatforms: [], selectedAccounts: {} })
    const group = { id: 'g', name: 'n', platformFilter: null, accountIds: ['a1', 'a2'] }
    const first = applyAccountGroup(group, probe.deps)
    expect(first.added).toEqual([
      { platformId: 'wechat_mp', accountId: 'a1' },
      { platformId: 'douyin', accountId: 'a2' },
    ])

    // 第二次：把第一次的写入结果如实回填到"已选中"状态里（模拟真实宿主）
    const second = makeDeps({
      selectedPlatforms: ['wechat_mp', 'douyin'],
      selectedAccounts: { wechat_mp: ['a1'], douyin: ['a2'] },
    })
    const again = applyAccountGroup(group, second.deps)

    expect(again.added).toEqual([])
    expect(again.already).toEqual([
      { platformId: 'wechat_mp', accountId: 'a1' },
      { platformId: 'douyin', accountId: 'a2' },
    ])
    expect(again.platforms).toEqual([])
    expect(second.calls).toEqual([])
  })

  it('空组不产出任何写入，只报 empty-group', () => {
    const { deps, calls } = makeDeps()
    const result = applyAccountGroup({ id: 'g', name: 'n', platformFilter: null, accountIds: [] }, deps)

    expect(result).toEqual({ ok: false, reason: 'empty-group', added: [], already: [], skipped: [], platforms: [] })
    expect(calls).toEqual([])
  })

  it('成员列表缺失/非数组同样归为 empty-group，不得当成"全部账号"', () => {
    // 归一在 account-groups-store 里会把缺失的 accountIds 按平台筛选**回填**（healed），
    // 但那是真源读侧的行为。到这里还拿到非数组，说明消费者绕过了归一，
    // 此时按"全部账号"添加会把用户没放进组里的号也发出去。
    const { deps, calls } = makeDeps()
    for (const bad of [undefined, null, 'a1', { 0: 'a1' }]) {
      const result = applyAccountGroup({ id: 'g', name: 'n', accountIds: bad }, deps)
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('empty-group')
    }
    expect(calls).toEqual([])
  })

  it('组对象本身不合法时不抛错，返回 invalid-group', () => {
    const { deps } = makeDeps()
    for (const bad of [null, undefined, 'g1', 42]) {
      const result = applyAccountGroup(bad, deps)
      expect(result.ok).toBe(false)
      expect(result.reason).toBe('invalid-group')
    }
  })

  it('账号存在但没有 platform 字段时按 unknown-platform 跳过，不得写进 undefined 桶', () => {
    const { deps, calls } = makeDeps({ accounts: [{ id: 'x1' }], available: ['x1'] })
    const result = applyAccountGroup({ id: 'g', name: 'n', accountIds: ['x1'] }, deps)

    expect(result.skipped).toEqual([{ accountId: 'x1', reason: 'unknown-platform' }])
    expect(result.added).toEqual([])
    expect(calls).toEqual([])
  })

  it('成员 id 去重：同一 id 出现两次只算一次，不产生重复写入', () => {
    const { deps, calls } = makeDeps({ selectedPlatforms: [], selectedAccounts: {} })
    const result = applyAccountGroup({ id: 'g', name: 'n', accountIds: ['a2', 'a2'] }, deps)

    expect(result.added).toEqual([{ platformId: 'douyin', accountId: 'a2' }])
    expect(calls).toEqual([['platform', 'douyin'], ['account', 'douyin', 'a2']])
  })

  it('实现不得引入 await/nextTick：写入必须在同一同步段完成（§九 L3 顺序的同源约束）', () => {
    // reconcile 的默认账号回填发生在下一次 flush；若"选平台"与"选账号"被 await/nextTick 拆开，
    // 中间那一帧会凭空塞进一个默认账号。用源码锁把这条钉住——注释里的字样不算声明。
    // 取源路径**禁止数 `..`，也禁止只信 process.cwd()**：本仓有 pnpm hoisted 布局与 junction，
    // 猜出来的路径会指向不存在的位置，而"读不到 ⇒ 跳过"就是把锁拆掉。
    // 也不得用 import.meta.url —— vitest 的 SSR 里它不是 file: 协议（实测抛 "The URL must be of scheme file"）。
    const REL = ['src', 'features', 'publish', 'usePublishGroupApply.js']
    const candidates = []
    let dir = process.cwd()
    for (let depth = 0; depth < 6 && dir !== path.parse(dir).root; depth++) {
      candidates.push(path.join(dir, ...REL))
      candidates.push(path.join(dir, 'apps', 'desktop', ...REL))
      dir = path.dirname(dir)
    }
    const sourcePath = candidates.find(p => fs.existsSync(p))
    expect(sourcePath, `读不到被测源文件，扫过 ${candidates.length} 个候选路径（首个：${candidates[0]}）—— 源码锁不得在"读不到"时放行`).toBeTruthy()
    const src = fs.readFileSync(sourcePath, 'utf8')
    // 规模下界：解析到的必须是真实现，不是空文件或别处的同名残片
    expect(src.length, '源文件过小，解析目标可疑：' + sourcePath).toBeGreaterThan(500)
    expect(src.includes('export function applyAccountGroup'), '解析到的文件不含被测实现：' + sourcePath).toBe(true)
    const codeOnly = src.split(/\r?\n/)
      .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')
    expect(codeOnly.includes('nextTick'), '写入被推迟到下一个 tick，默认账号回填会插在中间').toBe(false)
    const asyncHit = /\bawait\b/.exec(codeOnly)
    expect(asyncHit, '出现 await 即说明写入不再同段完成：' + (asyncHit && asyncHit[0])).toBeNull()
  })
})
