// @vitest-environment node
/**
 * 模式归因重算（P2-6d，PRD-PUBLISH-REWRITE-LINEAGE-2026-10-05）
 *
 * 为什么用真库真 mixin 而不是手搓 store：
 * 这个切片要防的正是「三段各写各的单测，合起来是断的」。归因行落到哪一列、
 * 读侧按什么筛，只有让**同一份 sqlite** 同时被写入与查询才量得到。
 *
 * 核心判据是第 2 组：聚合桶的键必须含归属。若按全局桶求平均再把行打上某一个归属，
 * 两个账号的数据会在界面上互相污染 —— 而榜单"有数字"，看不出是假的。
 */
const { DatabaseSync } = require('node:sqlite')
const { migratePerformanceLoopSchema, migrateViralPatternSchema } = require('./activate-viral-schema')
const { PatternAttributionService, ATTRIBUTION_DIMENSIONS } = require('./pattern-attribution-service')

function makeStore () {
  const db = new DatabaseSync(':memory:')
  const exec = (target, sql) => target.exec(sql)
  // 两套迁移都要跑：性能闭环表 + 模式卡片表（归因要 join viral_pattern_cards）
  migratePerformanceLoopSchema(db, exec)
  migrateViralPatternSchema(db, exec)
  const store = Object.assign(
    {},
    require('./store/performance-loop-store'),
    require('./store/viral-pattern-store'),
  )
  store.db = db
  store._ready = true
  return store
}

/** 造一条「可归因」的完整样本：改写历史（带爆款库引用）→ 已发布并带关联 → 已回采 → 卡片 done */
function seedAttributable (store, opts) {
  const { ownerSubject, viralId, postId, hookType, views } = opts
  const historyId = store.addRewriteHistory({
    rewrittenContent: '正文-' + postId,
    mode: 'imitate',
    knowledgeRefs: [{ table: 'viral_library', id: viralId }],
  })
  if (!historyId) throw new Error('夹具失效：rewrite_history 没写进去')
  const trackedId = store.addTrackedContent({
    platform: 'kuaishou',
    postId,
    url: '',
    rewriteHistoryId: historyId,
    recrawlStatus: 'ok',
    ownerSubject,
  })
  if (!trackedId) throw new Error('夹具失效：tracked_content 没写进去')
  const snapId = store.addPerformanceSnapshot({
    trackedContentId: trackedId, source: 'auto',
    views, likes: 1, comments: 1, favorites: 1, shares: 0,
  })
  if (!snapId) throw new Error('夹具失效：performance_snapshot 没写进去')
  store.ensurePatternCard(viralId)
  const cardUpdated = store.updatePatternCard(viralId, { status: 'done', hook_type: hookType })
  if (!cardUpdated) throw new Error('夹具失效：卡片没落成 done')
  const card = store.getPatternCard(viralId)
  if (!card || card.status !== 'done') throw new Error('夹具失效：卡片状态读回不是 done')
  return { historyId, trackedId }
}

/**
 * 造一条「只填 cta_style」的可归因样本（legacy 档）。
 * 为什么需要第二个维度：只有一种维度时，把归属谓词自己的括号摘掉后结果集恰好不变
 * （`NULL OR ='' OR (='__legacy__' AND dim=?)` 与带括号版在这一份数据上同解），
 * 锁就测不出它声称在测的那件事 —— 实测 M4 变异在单维度夹具下仍全绿。
 * 有了第二种维度，摘掉括号的差集就是「另一条 legacy 行」，可见且可断。
 */
function seedLegacySecondDimension (store, { viralId, postId, ctaStyle, views }) {
  const historyId = store.addRewriteHistory({
    rewrittenContent: '正文-' + postId,
    knowledgeRefs: [{ table: 'viral_library', id: viralId }],
  })
  const trackedId = store.addTrackedContent({
    platform: 'kuaishou', postId, rewriteHistoryId: historyId, recrawlStatus: 'ok', ownerSubject: null,
  })
  store.addPerformanceSnapshot({ trackedContentId: trackedId, source: 'auto', views, likes: 1, comments: 1, favorites: 1 })
  store.ensurePatternCard(viralId)
  if (!store.updatePatternCard(viralId, { status: 'done', cta_style: ctaStyle })) {
    throw new Error('夹具失效：卡片没落成 done')
  }
  return { historyId, trackedId }
}

describe('PatternAttributionService.recomputeAll —— 归因行带归属', () => {
  it('单归属的一条可归因样本 ⇒ 四维行都落库，且 owner_subject 是该归属', () => {
    const store = makeStore()
    seedAttributable(store, {
      ownerSubject: 'user-A', viralId: 'v1', postId: 'p1', hookType: 'suspense', views: 100,
    })
    const svc = new PatternAttributionService({ store })
    const res = svc.recomputeAll()
    expect(res.code).toBe(0)

    const rows = store.db.prepare('SELECT * FROM pattern_performance').all()
    expect(rows.length, '四维里 hook_type 有值、其余维度卡片没填 ⇒ 至少 1 行').toBeGreaterThanOrEqual(1)
    for (const r of rows) {
      expect(r.owner_subject, '归因行必须记明它属于谁，否则读侧无法按归属筛').toBe('user-A')
    }
    const hook = rows.find(r => r.dimension === 'hook_type' && r.value === 'suspense')
    expect(hook).toBeTruthy()
    expect(hook.avg_views).toBe(100)
    expect(hook.sample_count).toBe(1)
  })

  it('两个归属各自一条样本 ⇒ 按 (归属, 维度, 取值) 分桶，绝不跨归属求平均', () => {
    const store = makeStore()
    // 同一个 viralId、同一个 hook_type，两个账号各发一条、各回采一份
    seedAttributable(store, { ownerSubject: 'user-A', viralId: 'vShared', postId: 'pA', hookType: 'suspense', views: 10 })
    seedAttributable(store, { ownerSubject: 'user-B', viralId: 'vShared', postId: 'pB', hookType: 'suspense', views: 90 })

    const svc = new PatternAttributionService({ store })
    expect(svc.recomputeAll().code).toBe(0)

    const rows = store.db
      .prepare("SELECT * FROM pattern_performance WHERE dimension = 'hook_type' AND value = 'suspense'")
      .all()
    // 全局桶的错误形态是"1 行 avg=50"——两个账号看到的都是 50，且数字看着合理，谁也发现不了
    expect(rows.length, '同维度同取值但不同归属 ⇒ 必须两行').toBe(2)
    const byOwner = {}
    for (const r of rows) byOwner[r.owner_subject] = r
    expect(byOwner['user-A'].avg_views).toBe(10)
    expect(byOwner['user-B'].avg_views).toBe(90)
    expect(byOwner['user-A'].sample_count).toBe(1)
    expect(byOwner['user-B'].sample_count).toBe(1)
  })

  it('同归属两条同模式样本 ⇒ 才是"该归属内的平均"，sample_count 累加', () => {
    const store = makeStore()
    seedAttributable(store, { ownerSubject: 'user-A', viralId: 'vA1', postId: 'p1', hookType: 'suspense', views: 10 })
    seedAttributable(store, { ownerSubject: 'user-A', viralId: 'vA2', postId: 'p2', hookType: 'suspense', views: 30 })
    const svc = new PatternAttributionService({ store })
    svc.recomputeAll()
    const row = store.db.prepare(
      "SELECT * FROM pattern_performance WHERE owner_subject = ? AND dimension = 'hook_type' AND value = 'suspense'",
    ).get('user-A')
    expect(row.sample_count).toBe(2)
    expect(row.avg_views).toBe(20)
  })

  it('legacy 桶（owner_subject 为 NULL）也要产行并带上可识别的归属，不得被静默丢弃', () => {
    const store = makeStore()
    seedAttributable(store, { ownerSubject: null, viralId: 'vL', postId: 'pL', hookType: 'question', views: 7 })
    const svc = new PatternAttributionService({ store })
    svc.recomputeAll()
    const rows = store.db.prepare('SELECT * FROM pattern_performance').all()
    expect(rows.length).toBeGreaterThanOrEqual(1)
    // 归属缺席在存储层的既有形态是 NULL（见 _ownerPredicate：NULL / '' / __legacy__ 三态同桶）
    expect(rows.some(r => r.owner_subject === null || r.owner_subject === '')).toBe(true)
  })

  it.each([
    ['没有改写关联（tracked.rewrite_history_id 为 NULL）', (store) => {
      const id = store.addTrackedContent({ platform: 'kuaishou', postId: 'x', rewriteHistoryId: null, recrawlStatus: 'ok', ownerSubject: 'user-A' })
      store.addPerformanceSnapshot({ trackedContentId: id, source: 'auto', views: 1, likes: 1, comments: 1, favorites: 1 })
    }],
    ['有改写历史但没勾选爆款库（knowledge_refs 为空）', (store) => {
      const h = store.addRewriteHistory({ rewrittenContent: 'c', knowledgeRefs: [] })
      const id = store.addTrackedContent({ platform: 'kuaishou', postId: 'x', rewriteHistoryId: h, recrawlStatus: 'ok', ownerSubject: 'user-A' })
      store.addPerformanceSnapshot({ trackedContentId: id, source: 'auto', views: 1, likes: 1, comments: 1, favorites: 1 })
    }],
    ['有历史有引用但从未回采（无 snapshot）', (store) => {
      const h = store.addRewriteHistory({ rewrittenContent: 'c', knowledgeRefs: [{ table: 'viral_library', id: 'v9' }] })
      store.addTrackedContent({ platform: 'kuaishou', postId: 'x', rewriteHistoryId: h, recrawlStatus: 'pending', ownerSubject: 'user-A' })
    }],
    ['卡片还没抽完成（status != done）', (store) => {
      const h = store.addRewriteHistory({ rewrittenContent: 'c', knowledgeRefs: [{ table: 'viral_library', id: 'v9' }] })
      const id = store.addTrackedContent({ platform: 'kuaishou', postId: 'x', rewriteHistoryId: h, recrawlStatus: 'ok', ownerSubject: 'user-A' })
      store.addPerformanceSnapshot({ trackedContentId: id, source: 'auto', views: 1, likes: 1, comments: 1, favorites: 1 })
      store.ensurePatternCard('v9') // 保持 pending
    }],
  ])('%s ⇒ 0 行（四个必要条件缺任一个，空态是合法结果而不是错误）', (_label, seed) => {
    const store = makeStore()
    seed(store)
    const svc = new PatternAttributionService({ store })
    const res = svc.recomputeAll()
    expect(res.code).toBe(0)
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM pattern_performance').get().n).toBe(0)
  })

  it('重算是幂等全量替换：再跑一次行数不变、不叠加', () => {
    const store = makeStore()
    seedAttributable(store, { ownerSubject: 'user-A', viralId: 'v1', postId: 'p1', hookType: 'suspense', views: 100 })
    const svc = new PatternAttributionService({ store })
    svc.recomputeAll()
    const first = store.db.prepare('SELECT COUNT(*) AS n FROM pattern_performance').get().n
    svc.recomputeAll()
    svc.recomputeAll()
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM pattern_performance').get().n).toBe(first)
  })

  it('四维枚举与存储层同源（改名必须同步，否则归因写进无人读的维度）', () => {
    expect(ATTRIBUTION_DIMENSIONS).toEqual(['hook_type', 'emotion_curve', 'narrative_structure', 'cta_style'])
  })
})

/**
 * 读侧按归属筛（listPatternPerformance）。
 *
 * 这里专门有一条"括号优先级"回归：legacy 档的归属谓词是三段 OR，
 * 若拼条件时不加括号，`OR owner_subject = ? AND dimension = ?` 会被解析成
 * 「NULL 全放行 OR (空串 AND 维度) OR (legacy AND 维度)」——
 * 于是别的归属的行在 legacy 档 + 维度筛选下漏进来，而**只在 legacy 档出现**。
 * 这类只在一种身份形态下坏的问题，单跑主账号路径永远发现不了。
 */
describe('归因榜读侧按归属筛', () => {
  function seedTwoOwners () {
    const store = makeStore()
    seedAttributable(store, { ownerSubject: 'user-A', viralId: 'vA', postId: 'pA', hookType: 'suspense', views: 10 })
    seedAttributable(store, { ownerSubject: 'user-B', viralId: 'vB', postId: 'pB', hookType: 'question', views: 20 })
    seedAttributable(store, { ownerSubject: null, viralId: 'vL', postId: 'pL', hookType: 'story', views: 30 })
    // legacy 档的第二种维度：没有它，M4（摘掉 _ownerPredicate 的括号）在数据上不可见
    seedLegacySecondDimension(store, { viralId: 'vL2', postId: 'pL2', ctaStyle: 'challenge', views: 40 })
    new PatternAttributionService({ store }).recomputeAll()
    return store
  }

  it('A 只能看到自己的行；B、legacy 的行不得出现在 A 的榜上', () => {
    const store = seedTwoOwners()
    const rows = store.listPatternPerformance({}, 'user-A')
    expect(rows.length).toBeGreaterThan(0)
    expect(new Set(rows.map(r => r.owner_subject))).toEqual(new Set(['user-A']))
  })

  it('维度筛选 + 归属筛选必须同时生效', () => {
    const store = seedTwoOwners()
    const rows = store.listPatternPerformance({ dimension: 'hook_type' }, 'user-B')
    expect(rows.length).toBe(1)
    expect(rows[0].value).toBe('question')
    expect(rows[0].owner_subject).toBe('user-B')
  })

  it('legacy 档（身份服务缺席 = undefined）只看无归属桶，且不得因 OR/AND 优先级漏进别的维度/别人的行', () => {
    const store = seedTwoOwners()
    const legacyAll = store.listPatternPerformance({}, undefined)
    // 判据自证：legacy 桶必须横跨两种维度，否则下面的维度断言是恒真的空集判断
    expect(legacyAll.length, 'legacy 桶至少两条（两种维度），夹具失效则本锁失去测量对象').toBeGreaterThanOrEqual(2)
    expect(new Set(legacyAll.map(r => r.dimension)).size, 'legacy 桶必须有两种维度').toBeGreaterThanOrEqual(2)
    for (const r of legacyAll) {
      expect(r.owner_subject === null || String(r.owner_subject).trim() === '',
        `legacy 档捞到了有归属的行：${String(r.owner_subject)}`).toBe(true)
    }
    // 带维度筛 —— 这一步才会暴露缺括号：SQL 里 AND 优先于 OR，
    // `_ownerPredicate` 的三段 OR 一旦失去自己的括号，`AND dimension = ?` 只绑到最后一段，
    // 于是 legacy 桶里另一种维度的行会漏进来。
    const legacyHook = store.listPatternPerformance({ dimension: 'hook_type' }, undefined)
    expect(legacyHook.length, '维度筛选必须在 legacy 档也生效').toBe(1)
    expect(legacyHook[0].dimension).toBe('hook_type')
    expect(legacyHook[0].value).toBe('story')
    // 正向对照：另一维度的 legacy 行确实存在（不是被别的条件误删）
    const legacyCta = store.listPatternPerformance({ dimension: 'cta_style' }, undefined)
    expect(legacyCta.length).toBe(1)
    expect(legacyCta[0].value).toBe('challenge')
  })

  it('认不出是谁（null）时读侧不得由存储层猜桶：IPC 必须提前 fail closed（判据在 ipc-handlers）', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(__dirname, '..', 'ipc-handlers', 'performance-loop.js'), 'utf8')
    const start = src.indexOf("ipcMain.handle('performance:list-pattern-performance'")
    expect(start, '该 handler 被改名/删除，锁不得静默放行').toBeGreaterThan(-1)
    // 测量域必须止于**下一个** ipcMain.handle：整段文件读下来，
    // 后面 performance:overview 里的 resolveIpcOwnerSubject/AUTH_ERROR 会让本锁恒真（装饰性断言）。
    const next = src.indexOf('ipcMain.handle(', start + 10)
    const block = src.slice(start, next === -1 ? src.length : next)
    expect(block.length, '测量域退化成空串').toBeGreaterThan(50)
    expect(block, '读侧必须解析归属').toMatch(/resolveIpcOwnerSubject\(identityService\)/)
    expect(block, '认不出归属必须是 AUTH_ERROR，而不是把别人的数据或空榜单给用户').toMatch(/AUTH_ERROR/)
    expect(block.slice(0, 200), '必须带显式 sender 守卫（Gate 17 口径）').toMatch(/withSenderCheck/)
  })
})
