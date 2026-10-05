// @ts-check
/**
 * 回采巡检的「收口 → 归因重算」触发契约 + 接线唯一性（P2-6d B2）
 *
 * 本文件原本还要证 B3（start() 零调用点 ⇒ 自动巡检从未运行）—— **那条前提是错的**：
 * 我 grep 的是 bootstrap/*.js 与 main.js，漏了同层的 electron/bootstrap.js，
 * 那里第 256 行一直在调 start()；打包产物实测日志有 App performance-recrawl scheduler started。
 * 教训按形态记：**"扫到 0 命中"先证明的是我的坐标不全，不是东西不存在**（AGENTS.md 同族条目）。
 * 因此这里保留两条真判据：
 *  · 触发语义（算不算、算几次、抛错会不会带崩巡检）—— 这是 B2 的真修复；
 *  · 接线的唯一性与顺序 —— 防"两处都调 start()"与"回调挂在 start() 之后"这两种新错法。
 *
 * 命名说明：文件名里的 autostart 指的是「自动巡检链路的接线与触发」，不是"新增启动"。
 */
const { PerformanceRecrawlService } = require('./performance-recrawl-service')

function makeService (store) {
  const svc = new PerformanceRecrawlService({ store })
  svc._jitter = async () => {}
  svc._getParser = () => ({
    resolveContentUrl: (postId, url) => url || 'https://example.com/' + postId,
    fetchMetrics: async () => ({ views: 10, likes: 1, comments: 1, favorites: 1, shares: 0, raw: {} }),
  })
  return svc
}

function makeStore (dueRows) {
  const seen = []
  return {
    seen,
    listDueForRecrawl: () => dueRows,
    addPerformanceSnapshot: () => 'snap-1',
    updateTrackedContent: (id, patch) => seen.push([id, patch]),
  }
}

const dueItem = { id: 't1', platform: 'fixture', post_id: 'p1', url: 'https://example.com/note/1' }

describe('回采收口 → 归因重算触发', () => {
  it('处理过到期条目 ⇒ 收口后恰好触发一次重算', async () => {
    let hits = 0
    const svc = makeService(makeStore([dueItem]))
    svc.setAfterRound(() => { hits++ })
    await svc.processRound()
    expect(hits, '巡检真的采到了东西 → 必须让归因跟上，否则榜单永远落后一轮').toBe(1)
  })

  it('多条到期也只触发一次（重算是全量重算，逐条触发等于把自己扫 N 遍）', async () => {
    let hits = 0
    const svc = makeService(makeStore([dueItem, { ...dueItem, id: 't2' }, { ...dueItem, id: 't3' }]))
    svc.setAfterRound(() => { hits++ })
    await svc.processRound()
    expect(hits).toBe(1)
  })

  it('本轮 0 条到期 ⇒ 不触发（无谓的全表 DELETE+INSERT 会把 computed_at 刷成"刚更新过"的假象）', async () => {
    let hits = 0
    const svc = makeService(makeStore([]))
    svc.setAfterRound(() => { hits++ })
    await svc.processRound()
    expect(hits).toBe(0)
  })

  // QM-6 后端轴 W-3：判据必须是"写出了新快照"，不是"遍历过条目"。
  // 全失败轮（网络抖动季）与全 unsupported 轮（没注册 parser 的平台）库里都没有新东西，
  // 触发一次 = 白做全表重写 + 把 computed_at 刷成刚算过 —— 与"0 到期也重算"同一个错。
  it('到期条目全部回采失败 ⇒ 不触发重算', async () => {
    let hits = 0
    const store = makeStore([dueItem, { ...dueItem, id: 't2' }])
    const svc = makeService(store)
    svc._getParser = () => ({
      resolveContentUrl: (postId, url) => url,
      fetchMetrics: async () => { throw new Error('net down') },
    })
    svc.setAfterRound(() => { hits++ })
    await svc.processRound()
    expect(hits, '一次网络抖动不该被算成"数据有更新"').toBe(0)
  })

  it('到期条目全是无 parser 平台（unsupported）⇒ 不触发重算', async () => {
    let hits = 0
    const svc = makeService(makeStore([dueItem]))
    svc._getParser = () => null
    svc.setAfterRound(() => { hits++ })
    await svc.processRound()
    expect(hits).toBe(0)
  })

  it('快照写入被 store 吞掉（返回 null）⇒ 不算产出，不触发', async () => {
    let hits = 0
    const store = makeStore([dueItem])
    store.addPerformanceSnapshot = () => null
    const svc = makeService(store)
    svc.setAfterRound(() => { hits++ })
    await svc.processRound()
    expect(hits, '_recrawlOne 的返回值语义是"真写出了新快照"，不是"没抛错"').toBe(0)
  })

  it('重算同步抛错 ⇒ 巡检正常收口、_running 复位、错误出声（旁路不得冒泡）', async () => {
    const svc = makeService(makeStore([dueItem]))
    svc.setAfterRound(() => { throw new Error('boom') })
    await expect(svc.processRound()).resolves.toBeUndefined()
    expect(svc._running, '收口没跑完就把 _running 留在 true ⇒ 之后所有轮次静默停摆').toBe(false)
  })

  it('重算返回的 promise 被拒绝 ⇒ 不产生 unhandledRejection，且巡检仍成功收口', async () => {
    const reasons = []
    const onUnhandled = (reason) => reasons.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const svc = makeService(makeStore([dueItem]))
      svc.setAfterRound(() => Promise.reject(new Error('late boom')))
      await svc.processRound()
      await new Promise(r => setTimeout(r, 0))
      await new Promise(r => setTimeout(r, 0))
      expect(reasons, '异步归因的拒绝必须以 .catch 收掉').toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('未接线（没 setAfterRound）⇒ 巡检照跑，不抛错', async () => {
    const svc = makeService(makeStore([dueItem]))
    await expect(svc.processRound()).resolves.toBeUndefined()
  })

  it('setAfterRound 传非函数一律视为没接（不得把字符串/对象当回调存起来）', async () => {
    const svc = makeService(makeStore([dueItem]))
    svc.setAfterRound('recomputeAll')
    svc.setAfterRound({})
    await expect(svc.processRound()).resolves.toBeUndefined()
    expect(svc._afterRound ?? null).toBe(null)
  })
})

describe('自动巡检的定时器与接线', () => {
  it('start() 幂等：重复调用不得叠加定时器（否则每调一次就多一份巡检与多一份重算）', () => {
    vi.useFakeTimers()
    try {
      const svc = makeService(makeStore([]))
      const intervals = []
      const realSetInterval = global.setInterval
      global.setInterval = (...args) => { intervals.push(args); return realSetInterval(...args) }
      try {
        svc.start()
        svc.start()
        svc.start()
      } finally {
        global.setInterval = realSetInterval
      }
      expect(intervals.length, 'setInterval 只能被调用一次').toBe(1)
      svc.stop()
      expect(svc._dailyTimer).toBe(null)
    } finally {
      vi.useRealTimers()
    }
  })

  // QM-6 后端轴 I-1：stop() 过去只清 interval，首轮 setTimeout 仍在路上 ——
  // 测试收尾或重复 startServices 的场景下，30s 后会对着可能已 close 的 store 跑一轮巡检。
  it('stop() 必须同时取消尚未触发的 30s 首轮', async () => {
    vi.useFakeTimers()
    try {
      const svc = makeService(makeStore([]))
      let rounds = 0
      svc.processRound = async () => { rounds++ }
      svc.start()
      svc.stop()
      await vi.advanceTimersByTimeAsync(31 * 1000)
      expect(rounds, 'stop() 之后不得再有首轮落地').toBe(0)
      expect(svc._initialTimer).toBe(null)
    } finally {
      vi.useRealTimers()
    }
  })

  it('未 stop 时首轮确实会在 30s 后落到 processRound（上一条的对照，防"永远不跑"也算通过）', async () => {
    vi.useFakeTimers()
    try {
      const svc = makeService(makeStore([]))
      let rounds = 0
      svc.processRound = async () => { rounds++ }
      svc.start()
      await vi.advanceTimersByTimeAsync(31 * 1000)
      expect(rounds, '30s 首轮是这条链路的入口，它不跑就等于没接线').toBe(1)
      svc.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('接线锁：start() 必须被调用，且全仓只有一处（重复调用靠幂等兜住，但两处接线本身就是漂移）', () => {
    const fs = require('fs')
    const path = require('path')
    const root = path.join(__dirname, '..')
    const sites = []
    for (const rel of ['bootstrap.js', 'bootstrap/phase1-context.js', 'bootstrap/phase3-services.js', 'main.js']) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8')
      // 去掉注释行再判：注释里提一句 start() 不构成接线
      const code = src.split(/\r?\n/).filter(l => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l)).join('\n')
      const hits = code.match(/performanceRecrawl(Service)?\s*\.\s*start\s*\(\s*\)/g) || []
      for (const _h of hits) sites.push(rel)
    }
    expect(sites, 'start() 的调用点清单实测为 ' + JSON.stringify(sites)).toEqual(['bootstrap.js'])
  })

  it('接线锁：after-round 必须挂在同一个站点，且排在 start() 之前（否则 30s 首轮没有回调）', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(__dirname, '..', 'bootstrap.js'), 'utf8')
    const atWire = src.indexOf('performanceRecrawl.setAfterRound(')
    const atStart = src.search(/performanceRecrawl\s*\.\s*start\s*\(\s*\)/)
    expect(atWire, 'bootstrap.js 里没有挂 after-round ⇒ 归因仍只有手动一条路').toBeGreaterThan(-1)
    expect(atStart, 'bootstrap.js 里找不到 start() 调用').toBeGreaterThan(-1)
    expect(atWire, '回调必须先在 start() 之前挂上').toBeLessThan(atStart)
    // 反证状态如实记录：本条顺序断言（atWire < atStart）本轮**未做变异反证** ——
    // 要把注册搬到 start() 之后必须整体搬移一段多行回调，只做单行替换会破坏语法、
    // 让"红"来自 parse error 而不是这条判据本身。已反证的是另两条：
    // M6b 摘掉 start() ⇒ 调用点清单红；M6d 把回调接成 return null ⇒ 本块最后一条红。
    expect(src, '回调必须接到归因重算上，而不是接个空函数').toMatch(/patternAttribution\.recomputeAll\s*\(\s*\)/)
  })
})
