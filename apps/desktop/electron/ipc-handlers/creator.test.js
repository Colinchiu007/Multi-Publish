/**
 * creator.test.js — 博主监控 IPC：校验、降级与错误映射
 *
 * 锁三件「接线层特有」的风险：
 *  1. **依赖缺失时仍注册通道**：否则渲染层收到 Electron 原生的
 *     "No handler registered for 'creator:collect'"，对用户毫无意义。
 *  2. **超限时零副作用**：collect 通道必须在发起任何采集请求前拒绝。
 *  3. **错误分类可区分**：数量超限 / 输入非法 / 频道不存在是三种排查方向。
 */
const { registerHandlers } = require('./creator')

function createMockIpcMain () {
  const handlers = new Map()
  return {
    handle (channel, fn) { handlers.set(channel, fn) },
    _get (channel) { return handlers.get(channel) },
    _channels () { return [...handlers.keys()] },
  }
}

function stubDeps (over = {}) {
  const calls = { collectBatch: [], probe: [], resolve: [] }
  return {
    calls,
    creatorStore: {
      listCreators: async () => [
        { id: 'c1', platform: 'youtube', external_id: 'UC_a', display_name: 'A' },
        { id: 'c2', platform: 'youtube', external_id: 'UC_b', display_name: 'B' },
      ],
      countPending: (id) => (id === 'c1' ? 3 : 0),
      listFollowsForQuota: async () => [],
      upsertCreator: async (a) => ({ id: 'c1', ...a }),
      upsertFollow: async (a) => ({ id: 'f1', ...a }),
      getFollow: async (id) => (id === 'f1'
        ? { id: 'f1', creator_id: 'c1', per_creator_limit: null }
        : null),
      listDiscoveries: async () => Array.from({ length: 12 }, (_, i) => ({
        id: `d${i}`, published_at: `2026-10-${String(24 - i).padStart(2, '0')}`,
      })),
      deleteFollow: async () => {},
      setFollowEnabled: async (id, enabled) => ({ id, enabled }),
      skipDiscovery: async () => {},
      ...over.creatorStore,
    },
    creatorCollector: {
      resolveChannelId: async (input) => { calls.resolve.push(input); return 'UC_canonical' },
      ...over.creatorCollector,
    },
    creatorMonitor: {
      assertQuotaFits: () => {},
      probeCreator: async (id) => { calls.probe.push(id); return { found: 2, inserted: 2 } },
      collectBatch: async (a) => { calls.collectBatch.push(a); return { collected: a.discoveries.length, failed: 0 } },
      collectOne: async () => ({ collected: 1 }),
      ...over.creatorMonitor,
    },
    log: { warn: () => {}, error: () => {} },
    ...over,
  }
}

const CHANNELS = [
  'creator:list', 'creator:follow', 'creator:unfollow', 'creator:toggle',
  'creator:check-now', 'creator:discoveries', 'creator:collect',
  'creator:collect-one', 'creator:skip-one',
]

describe('creator IPC · 通道注册', () => {
  it('依赖齐全时注册全部通道', () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    for (const ch of CHANNELS) expect(ipc._get(ch)).toBeTypeOf('function')
  })

  it('依赖缺失时仍注册全部通道（降级，不报 No handler registered）', () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, { log: { warn: () => {}, error: () => {} } })
    for (const ch of CHANNELS) expect(ipc._get(ch)).toBeTypeOf('function')
  })

  it('降级响应带 reason=service-unavailable 供 UI 区分', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, { log: { warn: () => {}, error: () => {} } })
    const r = await ipc._get('creator:collect')({}, {})
    expect(r.code).toBe(-1)
    expect(r.reason).toBe('service-unavailable')
  })
})

describe('creator IPC · 博主列表', () => {
  it('返回每个博主的待采集数与总数（角标）', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    const r = await ipc._get('creator:list')({}, {})
    expect(r.code).toBe(0)
    expect(r.items).toHaveLength(2)
    expect(r.items[0].pendingCount).toBe(3)
    expect(r.totalPending).toBe(3)
  })
})

describe('creator IPC · 关注', () => {
  it('先解析成 canonical ID 再落库，绝不把用户输入当 external_id', async () => {
    const deps = stubDeps()
    const ipc = createMockIpcMain()
    registerHandlers(ipc, deps)
    await ipc._get('creator:follow')({}, { input: '@GoogleDevelopers' })
    expect(deps.calls.resolve).toEqual(['@GoogleDevelopers'])
  })

  it('缺少 input 时返回可区分的错误而非崩溃', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    const r = await ipc._get('creator:follow')({}, {})
    expect(r.code).toBe(-11)
    expect(r.reason).toBe('creator:invalid_input')
  })

  it('输入过长被拒（防超长串进库）', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    const r = await ipc._get('creator:follow')({}, { input: 'x'.repeat(600) })
    expect(r.reason).toBe('creator:invalid_input')
  })

  it('频道解析失败时透出原因（格式不对 vs 频道不存在要分开）', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps({
      creatorCollector: {
        resolveChannelId: async () => {
          const e = new Error('找不到该频道')
          e.code = 'creator:channel_not_found'
          throw e
        },
      },
    }))
    const r = await ipc._get('creator:follow')({}, { input: '@ghost' })
    expect(r.reason).toBe('creator:channel_not_found')
  })
})

describe('creator IPC · 批量采集（零副作用是硬要求）', () => {
  it('默认 count 取 5（一键采集默认量）', async () => {
    const deps = stubDeps()
    const ipc = createMockIpcMain()
    registerHandlers(ipc, deps)
    const r = await ipc._get('creator:collect')({}, { followId: 'f1' })
    expect(deps.calls.collectBatch[0].discoveries).toHaveLength(5)
    expect(r.collected).toBe(5)
  })

  it('count 超上限时拒绝，且不得发起任何采集请求', async () => {
    const deps = stubDeps()
    const ipc = createMockIpcMain()
    registerHandlers(ipc, deps)
    const r = await ipc._get('creator:collect')({}, { followId: 'f1', count: 150 })
    expect(r.code).toBe(-10)
    expect(r.reason).toBe('creator:count_exceeds_limit')
    expect(r.max).toBe(100)
    expect(deps.calls.collectBatch).toHaveLength(0)   // ← 关键：零副作用
  })

  it('采少于可采数时如实返回剩余量，不静默截断', async () => {
    const deps = stubDeps()
    const ipc = createMockIpcMain()
    registerHandlers(ipc, deps)
    const r = await ipc._get('creator:collect')({}, { followId: 'f1', count: 5 })
    expect(r.available).toBe(12)
    expect(r.collected).toBe(5)
    expect(r.remain).toBe(7)
    expect(r.truncated).toBe(true)
  })

  it('按发布时间倒序取最新', async () => {
    const deps = stubDeps()
    const ipc = createMockIpcMain()
    registerHandlers(ipc, deps)
    await ipc._get('creator:collect')({}, { followId: 'f1', count: 2 })
    expect(deps.calls.collectBatch[0].discoveries.map(d => d.id)).toEqual(['d0', 'd1'])
  })

  it('个人上限低于全局时以个人为准', async () => {
    const deps = stubDeps({
      creatorStore: {
        getFollow: async () => ({ id: 'f1', creator_id: 'c1', per_creator_limit: 2 }),
        listDiscoveries: async () => Array.from({ length: 12 }, (_, i) => ({ id: `d${i}` })),
      },
    })
    const ipc = createMockIpcMain()
    registerHandlers(ipc, deps)
    const r = await ipc._get('creator:collect')({}, { followId: 'f1', count: 5 })
    expect(r.code).toBe(-10)
    expect(r.max).toBe(2)
  })

  it('关注项不存在时明确报错，不静默当空列表', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    const r = await ipc._get('creator:collect')({}, { followId: 'nope' })
    expect(r.code).toBe(-1)
    expect(r.reason).toBe('creator:failed')
  })
})

describe('creator IPC · 单条采集', () => {
  it('零填参即可调用', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    const r = await ipc._get('creator:collect-one')({}, { discoveryId: 'd1' })
    expect(r.code).toBe(0)
    expect(r.collected).toBe(1)
  })

  it('缺 discoveryId 被拒', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    const r = await ipc._get('creator:collect-one')({}, {})
    expect(r.reason).toBe('creator:invalid_input')
  })
})

describe('creator IPC · 立即检查与发现列表', () => {
  it('check-now 透传 followId 并返回发现数', async () => {
    const deps = stubDeps()
    const ipc = createMockIpcMain()
    registerHandlers(ipc, deps)
    const r = await ipc._get('creator:check-now')({}, { followId: 'f1' })
    expect(deps.calls.probe).toEqual(['f1'])
    expect(r.inserted).toBe(2)
  })

  it('discoveries 默认 limit=50 / offset=0', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    const r = await ipc._get('creator:discoveries')({}, {})
    expect(r.limit).toBe(50)
    expect(r.offset).toBe(0)
  })
})