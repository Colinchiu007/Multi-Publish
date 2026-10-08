/**
 * creator-runtime.test.js — 编排层：探测 → 增量落库 → 采集 → 最终化
 *
 * 前面几个模块各自都是纯逻辑，本文件锁把它们**串起来**时的正确性：
 *
 *  1. 探测拿到重复作品时 MUST NOT 产生重复行（依赖唯一索引，不是内存去重）
 *  2. 采集 MUST 先 claim 再取正文；claim 失败（他人持有）MUST NOT 发起请求
 *  3. 提交 MUST 带 claim_token；token 不匹配（被接管）MUST NOT 写采集库
 *  4. 采集失败 MUST 释放 claim 并写 failed，否则该条永久卡在 collecting
 *  5. 节流类失败 MUST NOT 计入连续失败，也 MUST NOT 暂停博主
 */
const { createCreatorRuntime } = require('./creator-runtime')
const { FAILURE_TIERS } = require('./creator-monitor')

/** 可编排的 store 替身：记录调用顺序，模拟 claim 竞争 */
function makeStore (seed = {}) {
  const calls = []
  const rows = new Map(Object.entries(seed))
  return {
    calls, rows,
    getFollow: async (id) => (id === 'f1' ? { id: 'f1', creator_id: 'c1', platform: 'youtube', external_id: 'UC_a', enabled: 1, status: 'active', check_interval_min: 60 } : null),
    countPending: () => 0,
    claimDiscovery: (id, by, lease) => { calls.push(['claim', id, by]); return seed.claimResult !== undefined ? seed.claimResult : true },
    // 契约变更（2026-10-07）：终态提交唯一入口是 finalizeCollected，
    // 内部同事务完成「置终态 + 配额复核 + 资产落库 + outbox 去重」。
    // 旧的 markCollected + enqueueOutbox 两次独立 exec 会产生
    // 「已 collected 但未入队」的漂移，且重发会写第二条 outbox。
    finalizeCollected: (id, tok, body) => {
      calls.push(['finalize', id, tok])
      if (seed.finalizeResult) return seed.finalizeResult
      return { outcome: 'collected', insertedAsset: true }
    },
    markFailed: (id, tok, msg) => { calls.push(['failed', id, tok, msg]); return true },
    renewLease: () => true,
    upsertDiscoveries: (items) => { calls.push(['upsert', items.length]); return seed.inserted !== undefined ? seed.inserted : items.length },
    listDiscoveries: async () => seed.discoveries || [],
    getClaimToken: async (id) => seed.claimToken !== undefined ? seed.claimToken : 1,
    getDiscovery: async (id) => {
      if (seed.discovery !== undefined) return seed.discovery
      const list = seed.discoveries || []
      const hit = list.find(d => d.id === id)
      if (hit) return hit
      // 默认给一条可用的发现行：externalId 必须与 id 不同，
      // 这样「误把行 id 当 externalId 传下去」才会被断言抓到
      return { id, externalId: 'v-' + id, creatorId: 'c1', platform: 'youtube' }
    },
    recordFailure: async (followId, tier) => { calls.push(['failure', followId, tier]); return true },
    recordSuccess: async (followId) => { calls.push(['success', followId]); return true },
  }
}

function makeCollector (items, err) {
  const calls = []
  return {
    calls,
    listPosts: async (externalId) => {
      calls.push(['listPosts', externalId])
      if (err) throw err
      return items
    },
    collectBody: async (externalId) => {
      calls.push(['collectBody', externalId])
      if (err) throw err
      return { content: 'x'.repeat(600), transcriptSource: 'subtitle', contentQuality: 'full' }
    },
  }
}

const NOW = 1_700_000_000_000
const apiErr = (code, reason) => ({ code, errors: [{ reason }] })

describe('creator-runtime · 探测落库', () => {
  it('探测结果按条目写入，重复项由唯一索引吸收', async () => {
    const store = makeStore({ inserted: 2 })
    const collector = makeCollector([
      { externalId: 'v1', title: 'A', url: 'u1' },
      { externalId: 'v2', title: 'B', url: 'u2' },
    ])
    const rt = createCreatorRuntime({ store, collector, now: () => NOW })
    const r = await rt.probeCreator('f1')
    expect(r.fetched).toBe(2)
    expect(r.inserted).toBe(2)
    expect(store.calls.some(c => c[0] === 'upsert')).toBe(true)
  })

  it('重复探测不产生重复行（upsert 返回 0）', async () => {
    const store = makeStore({ inserted: 0 })
    const rt = createCreatorRuntime({ store, collector: makeCollector([{ externalId: 'v1', url: 'u1' }]), now: () => NOW })
    const r = await rt.probeCreator('f1')
    expect(r.inserted).toBe(0)
  })

  it('探测成功记录 success；失败按分级记录，不误伤博主', async () => {
    const store = makeStore()
    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
    await rt.probeCreator('f1')
    expect(store.calls.some(c => c[0] === 'success')).toBe(true)
  })
})

describe('creator-runtime · 采集失败分级落到博主', () => {
  it('节流（403）不计入连续失败、不暂停', async () => {
    const store = makeStore()
    const err = new Error('quota')
    err.response = { status: 403, data: apiErr(403, 'quotaExceeded') }
    const rt = createCreatorRuntime({ store, collector: makeCollector([], err), now: () => NOW })
    const r = await rt.probeCreator('f1')
    expect(r.tier).toBe(FAILURE_TIERS.THROTTLED)
    expect(store.calls.some(c => c[0] === 'failure' && c[2] === FAILURE_TIERS.THROTTLED)).toBe(true)
  })

  it('凭证失效标为 fatal（首次即暂停）', async () => {
    const store = makeStore()
    const err = new Error('bad key')
    err.response = { status: 400, data: apiErr(400, 'keyInvalid') }
    const rt = createCreatorRuntime({ store, collector: makeCollector([], err), now: () => NOW })
    const r = await rt.probeCreator('f1')
    expect(r.tier).toBe(FAILURE_TIERS.FATAL)
  })

  it('探测抛异常时 MUST NOT 抛出到调用方（调度器会被打断）', async () => {
    const store = makeStore()
    const err = new Error('boom')
    const rt = createCreatorRuntime({ store, collector: makeCollector([], err), now: () => NOW })
    await expect(rt.probeCreator('f1')).resolves.toBeTruthy()
  })

  it('followId 不存在时返回明确失败，不静默当空结果', async () => {
    const store = makeStore()
    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
    const r = await rt.probeCreator('nope')
    expect(r.ok).toBe(false)
  })
})

describe('creator-runtime · 单条采集的并发安全', () => {
  const disc = { id: 'd1', externalId: 'v1', creatorId: 'c1', platform: 'youtube' }

  it('先 claim 再取正文——顺序不可颠倒', async () => {
    const store = makeStore()
    const collector = makeCollector([])
    const rt = createCreatorRuntime({ store, collector, now: () => NOW })
    await rt.collectOne('d1')
    const order = store.calls.map(c => c[0])
    expect(order[0]).toBe('claim')
    expect(collector.calls.some(c => c[0] === 'collectBody')).toBe(true)
  })

  it('claim 未抢到时 MUST NOT 发起取正文请求', async () => {
    const store = makeStore({ claimResult: false })
    const collector = makeCollector([])
    const rt = createCreatorRuntime({ store, collector, now: () => NOW })
    const r = await rt.collectOne('d1')
    expect(r.collected).toBe(false)
    expect(collector.calls.filter(c => c[0] === 'collectBody')).toHaveLength(0)
  })

  it('提交携带 claim_token', async () => {
    const store = makeStore({ claimToken: 7 })
    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
    await rt.collectOne('d1')
    const c = store.calls.find(x => x[0] === 'finalize')
    expect(c[2]).toBe(7)
  })

  it('token 已被接管时 MUST NOT 写入采集库', async () => {
    const store = makeStore({ finalizeResult: { outcome: 'superseded' } })
    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
    const r = await rt.collectOne('d1')
    expect(r.collected).toBe(false)
    expect(r.superseded).toBe(true)
  })

  it('代次莫名丢失时与「被接管」区分开（否则用户点重采永远 busy）', async () => {
    const store = makeStore({ finalizeResult: { outcome: 'claim_lost' } })
    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
    const r = await rt.collectOne('d1')
    expect(r.collected).toBe(false)
    // 关键：不得冒充 superseded——两者后续动作不同（一个不重试，一个要重试）
    expect(r.superseded).toBeUndefined()
    expect(r.reason).toBe('claim_lost')
  })

  it('事务内复核超池时返回 quota_would_exceed，且不报成功', async () => {
    const store = makeStore({ finalizeResult: { outcome: 'quota_exceeded', quota: { limit: 10 } } })
    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
    const r = await rt.collectOne('d1')
    expect(r.collected).toBe(false)
    expect(r.reason).toBe('quota_would_exceed')
  })

  it('采集失败时释放 claim 并写 failed（否则永久卡在 collecting）', async () => {
    const store = makeStore()
    const err = new Error('transcript failed')
    const rt = createCreatorRuntime({ store, collector: makeCollector([], err), now: () => NOW })
    const r = await rt.collectOne('d1')
    expect(r.collected).toBe(false)
    expect(store.calls.some(c => c[0] === 'failed')).toBe(true)
  })

  it('最终化与业务写入同事务（outbox 由 finalizeCollected 内部入队）', async () => {
    const store = makeStore()
    const rt = createCreatorRuntime({ store, collector: makeCollector([]), now: () => NOW })
    await rt.collectOne('d1')
    // 回归锁：不得再有独立的 outbox 写路径。两次独立 exec 会在崩溃时
    // 产生「已 collected 但未入队」的漂移，且重发写第二条 outbox。
    expect(store.calls.some(c => c[0] === 'outbox')).toBe(false)
    expect(store.calls.filter(c => c[0] === 'finalize')).toHaveLength(1)
  })
})

describe('creator-runtime · 批量采集', () => {
  it('逐条采集，单条失败不影响其他条目', async () => {
    const store = makeStore()
    let n = 0
    const collector = {
      listPosts: async () => [],
      collectBody: async () => {
        n += 1
        if (n === 1) throw new Error('one bad')
        return { content: 'ok', transcriptSource: 'subtitle', contentQuality: 'full' }
      },
    }
    const rt = createCreatorRuntime({ store, collector, now: () => NOW })
    const r = await rt.collectBatch([
      { id: 'd1', externalId: 'v1' }, { id: 'd2', externalId: 'v2' },
    ])
    expect(r.collected).toBe(1)
    expect(r.failed).toBe(1)
  })

  it('批量顺序稳定，便于复现', async () => {
    const store = makeStore()
    const seen = []
    const collector = {
      listPosts: async () => [],
      collectBody: async (id) => { seen.push(id); return { content: 'ok', transcriptSource: 'subtitle', contentQuality: 'full' } },
    }
    const rt = createCreatorRuntime({ store, collector, now: () => NOW })
    const items = [{ id: 'd1', externalId: 'v1' }, { id: 'd2', externalId: 'v2' }, { id: 'd3', externalId: 'v3' }]
    await rt.collectBatch(items)
    expect(seen).toEqual(['v1', 'v2', 'v3'])
  })

  it('空输入返回零计数而非抛错', async () => {
    const rt = createCreatorRuntime({ store: makeStore(), collector: makeCollector([]), now: () => NOW })
    expect(await rt.collectBatch([])).toEqual({ collected: 0, failed: 0 })
  })
})