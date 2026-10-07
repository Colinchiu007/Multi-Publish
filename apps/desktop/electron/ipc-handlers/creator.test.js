/**
 * creator.test.js — 博主监控 IPC：校验、降级与错误映射
 *
 * 锁三件「接线层特有」的风险：
 *  1. **依赖缺失时仍注册通道**：否则渲染层收到 Electron 原生的
 *     "No handler registered for 'creator:collect'"，对用户毫无意义。
 *  2. **超限时零副作用**：collect 通道必须在发起任何采集请求前拒绝。
 *  3. **错误分类可区分**：数量超限 / 输入非法 / 频道不存在是三种排查方向。
 */
// 必须先启用 electron mock：本文件多数用例不传 event 就调 handler，
// 靠的正是 withSenderCheck 的测试放行分支（未打包 + 无 senderFrame 直接放行）。
// 不启用时 require('electron').app 为 undefined，守卫一律 fail-closed，
// 全部用例会以「未授权的调用来源」失败——那是桩缺失，不是被测行为。
__enableElectronMock()

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
    expect(r.reason).toBe('service-unavailable')
  })
})

describe('creator IPC · 博主列表', () => {
  it('返回每个博主的待采集数与总数（角标）', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    const r = await ipc._get('creator:list')({}, {})
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
    expect(r.max).toBe(2)
  })

  it('关注项不存在时明确报错，不静默当空列表', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    const r = await ipc._get('creator:collect')({}, { followId: 'nope' })
    // 领域码整类透传：关注项不存在 MUST NOT 退化成通用失败——两者排查方向完全不同
    expect(r.reason).toBe('creator:follow_not_found')
  })
})

describe('creator IPC · 单条采集', () => {
  it('零填参即可调用', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    const r = await ipc._get('creator:collect-one')({}, { discoveryId: 'd1' })
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

describe('creator IPC · 送入 AI 写作', () => {
  const item = { id: 'd1', url: 'https://www.youtube.com/watch?v=v1', updated_at: '2026-10-07T10:00:00Z' }

  function mountWith (pipeline) {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps({
      creatorStore: { getDiscovery: async () => item },
      fullAutoPipeline: pipeline,
    }))
    return ipc
  }

  it('复用 full-auto-pipeline，且显式关闭 publish（不做一键搬运）', async () => {
    const calls = []
    const ipc = mountWith({ startRun: async (cfg) => { calls.push(cfg); return { success: true, runId: 'r9' } } })
    const r = await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
    expect(r.runId).toBe('r9')
    expect(calls[0].stages.publish).toBe(false)
    expect(calls[0].urls).toEqual([item.url])
  })

  it('同一内容重复点击返回同一幂等键，不重复起跑消耗 LLM 额度', async () => {
    let starts = 0
    const ipc = mountWith({ startRun: async (cfg) => { starts += 1; return { success: true, runId: 'r' + starts } } })
    const a = await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
    const b = await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
    expect(a.idempotencyKey).toBe(b.idempotencyKey)
  })

  it('内容更新后幂等键随之变化（允许重新生成）', async () => {
    const keys = []
    const ipc = createMockIpcMain()
    let current = { ...item }
    registerHandlers(ipc, stubDeps({
      creatorStore: { getDiscovery: async () => current },
      fullAutoPipeline: { startRun: async (cfg) => { keys.push(cfg.idempotencyKey); return { success: true, runId: 'r' } } },
    }))
    await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
    current = { ...item, updated_at: '2026-10-08T10:00:00Z' }
    await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
    expect(keys[0]).not.toBe(keys[1])
  })

  it('流水线未就绪时明确失败，不静默无反应', async () => {
    const ipc = mountWith(null)
    const r = await ipc._get('creator:send-to-writer')({}, { discoveryId: 'd1' })
    expect(r.reason).toBe('pipeline-unavailable')
  })

  it('作品不存在时报错，不拿空 URL 去起跑', async () => {
    const ipc = createMockIpcMain()
    let called = false
    registerHandlers(ipc, stubDeps({
      creatorStore: { getDiscovery: async () => null },
      fullAutoPipeline: { startRun: async () => { called = true; return { success: true, runId: 'r' } } },
    }))
    const r = await ipc._get('creator:send-to-writer')({}, { discoveryId: 'nope' })
    expect(r.reason).toBe('creator:discovery_not_found')
    expect(called).toBe(false)
  })

  it('缺 discoveryId 被拒', async () => {
    const ipc = mountWith({ startRun: async () => ({ success: true, runId: 'r' }) })
    const r = await ipc._get('creator:send-to-writer')({}, {})
    expect(r.reason).toBe('creator:invalid_input')
  })
})

describe('creator IPC · sender 守卫（2026-10-07 CCG 评审 i6/Gate 17）', () => {
  // 背景：Gate 17 要求显式 sender 守卫占比 >= 65%，本模块新增 10 个通道一度把
  // 占比从 65.4% 稀释到 64.0%。补守卫不能只让门禁变绿——必须证明它真的会拒人。
  const HOSTILE = { senderFrame: { url: 'https://evil.example/' } }

  // 不能复用「送入 AI 写作」那个 describe 里的 mountWith：它在块内作用域，
  // 这里另起一份，保证守卫用例只依赖模块级的桩。
  function mount () {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps())
    return ipc
  }

  it('外部页面带 senderFrame 时一律拒绝，不执行业务逻辑', async () => {
    const ipc = createMockIpcMain()
    let called = false
    registerHandlers(ipc, stubDeps({
      creatorStore: { getDiscovery: async () => { called = true; return null } },
    }))
    const r = await ipc._get('creator:send-to-writer')(HOSTILE, { discoveryId: 'd1' })
    expect(called).toBe(false, '守卫必须在业务逻辑之前拦下')
    expect(r.code).not.toBe(0)
  })

  it.each([
    'creator:list', 'creator:follow', 'creator:unfollow', 'creator:toggle',
    'creator:check-now', 'creator:discoveries', 'creator:collect',
    'creator:collect-one', 'creator:skip-one', 'creator:send-to-writer',
  ])('%s 同样受守卫覆盖（逐条防「漏加一个」）', async (channel) => {
    const r = await mount()._get(channel)(HOSTILE, {})
    expect(r.code).not.toBe(0)
  })

  it('依赖缺失的降级通道也不得成为无守卫旁路', async () => {
    const ipc = createMockIpcMain()
    registerHandlers(ipc, stubDeps({ creatorStore: null }))
    const r = await ipc._get('creator:list')(HOSTILE, {})
    expect(r.code).not.toBe(0)
  })
})