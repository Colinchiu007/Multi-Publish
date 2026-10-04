/**
 * tracked-content-link — 发布历史 ↔ tracked_content 关联判据与回填编排的回归锁
 *
 * 立项：01-docs/PRD-PUBLISH-TRACKED-LINK-2026-10-04.md（P2-6 第二刀）
 * 守的两件事：
 *  ① `publish_history_id` 的语义是**发布任务 id**（读侧 PublishHistory.vue 的 join 契约），
 *     不是发布历史行自己的 entry.id；
 *  ② 回填「宁缺毋滥」：只补 NULL 行、歧义不猜、无主不写、候选为空一条 UPDATE 都不发。
 */
// @vitest-environment node
const {
  planPublishHistoryLinks,
  linkExistingTrackedContent,
  TRACKED_LINK_HISTORY_SCAN_LIMIT,
} = require('./tracked-content-link')
const { LEGACY_OWNER_SUBJECT } = require('./store-schema')

// 夹具默认值按**生产实况**取：2026-10-04 只读实测 `tracked_content` 73 行的 owner_subject 全部有值、
// `publish-history.jsonl` 98 条全部带同一 owner_subject。默认给 null 会让每条用例都撞进
// 「无主不回填」那一格，测的就不再是匹配逻辑了。
const DEFAULT_OWNER = 'u1'

function hist (taskId, platform, postId, owner) {
  const r = { id: `rec-${taskId}`, taskId, platform, result: { postId } }
  const o = owner === undefined ? DEFAULT_OWNER : owner
  // null ⇒ 模拟旧 JSONL 根本没有 owner_subject 字段（不是"值为 null"）
  if (o !== null) r.owner_subject = o
  return r
}

function row (id, platform, postId, opts = {}) {
  return {
    id,
    platform,
    post_id: postId,
    publish_history_id: opts.publishHistoryId === undefined ? null : opts.publishHistoryId,
    owner_subject: 'owner' in opts ? opts.owner : DEFAULT_OWNER,
  }
}

describe('planPublishHistoryLinks — 关联判据（纯函数，不碰库）', () => {
  it('唯一命中：给出按「发布任务 id」语义的计划', () => {
    const { plans, diagnostics } = planPublishHistoryLinks({
      trackedRows: [row('t1', 'kuaishou', 'p1')],
      historyRecords: [hist('task-1', 'kuaishou', 'p1')],
    })
    // 钉住语义本身：计划里的值必须是 taskId，不是历史行的 id
    expect(plans).toEqual([{ trackedId: 't1', publishHistoryId: 'task-1' }])
    expect(diagnostics.linked).toBe(1)
  })

  it('同一 (platform, postId) 命中两条历史 ⇒ 跳过并计 ambiguous（宁可留空也不猜）', () => {
    const { plans, diagnostics } = planPublishHistoryLinks({
      trackedRows: [row('t1', 'kuaishou', 'p1')],
      historyRecords: [hist('task-a', 'kuaishou', 'p1'), hist('task-b', 'kuaishou', 'p1')],
    })
    expect(plans).toEqual([])
    expect(diagnostics.ambiguous).toBe(1)
    expect(diagnostics.linked).toBe(0)
  })

  it('已有 publish_history_id 的行一律不动（幂等 + 不覆盖既有值）', () => {
    const { plans, diagnostics } = planPublishHistoryLinks({
      trackedRows: [row('t1', 'zhihu', 'p1', { publishHistoryId: 'task-existing' })],
      historyRecords: [hist('task-new', 'zhihu', 'p1')],
    })
    expect(plans).toEqual([])
    expect(diagnostics.alreadyLinked).toBe(1)
  })

  it('post_id 为空 ⇒ 不参与匹配并计数（这些行只能等新发布）', () => {
    const { plans, diagnostics } = planPublishHistoryLinks({
      trackedRows: [row('t1', 'douyin', ''), row('t2', 'douyin', null)],
      historyRecords: [hist('task-1', 'douyin', '')],
    })
    expect(plans).toEqual([])
    expect(diagnostics.skippedEmptyPostId).toBe(2)
  })

  it('历史里查无此 (platform, postId) ⇒ unmatched，不写', () => {
    const { plans, diagnostics } = planPublishHistoryLinks({
      trackedRows: [row('t1', 'bilibili', 'BV9')],
      historyRecords: [hist('task-1', 'bilibili', 'BV1')],
    })
    expect(plans).toEqual([])
    expect(diagnostics.unmatched).toBe(1)
  })

  it('跨归属不得互链：A 的行不会拿到 B 的任务 id', () => {
    const { plans, diagnostics } = planPublishHistoryLinks({
      trackedRows: [row('t1', 'kuaishou', 'p1', { owner: 'user-A' })],
      historyRecords: [hist('task-1', 'kuaishou', 'p1', 'user-B')],
    })
    expect(plans).toEqual([])
    // 索引按归属分桶 ⇒ 这条行在 A 桶里查无，落 unmatched 而不是错链到 B
    expect(diagnostics.unmatched).toBe(1)
  })

  it('同一作品被两个用户各发一次 ⇒ 各自接自己的任务，不得互相制造歧义', () => {
    const { plans, diagnostics } = planPublishHistoryLinks({
      trackedRows: [row('tA', 'kuaishou', 'p1', { owner: 'user-A' }), row('tB', 'kuaishou', 'p1', { owner: 'user-B' })],
      historyRecords: [hist('task-A', 'kuaishou', 'p1', 'user-A'), hist('task-B', 'kuaishou', 'p1', 'user-B')],
    })
    expect(plans).toEqual([
      { trackedId: 'tA', publishHistoryId: 'task-A' },
      { trackedId: 'tB', publishHistoryId: 'task-B' },
    ])
    expect(diagnostics.ambiguous).toBe(0)
  })

  it('tracked 行无主（owner_subject 为 NULL）⇒ 无法判定归属，不回填', () => {
    const { plans, diagnostics } = planPublishHistoryLinks({
      trackedRows: [row('t1', 'kuaishou', 'p1', { owner: null })],
      historyRecords: [hist('task-1', 'kuaishou', 'p1', null)],
    })
    expect(plans).toEqual([])
    expect(diagnostics.unowned).toBe(1)
  })

  it('legacy 桶对齐：历史无 owner 字段（旧 JSONL）与 tracked 的 LEGACY 标记视为同一归属', () => {
    // 旧 JSONL 根本没有 owner_subject 字段，SQLite 迁移把无身份服务的历史显式写成 LEGACY_OWNER_SUBJECT；
    // 若把这视为不同归属，未登录态的数据永远接不上。常量从真源 import，不在测试里手搓字符串。
    const { plans } = planPublishHistoryLinks({
      trackedRows: [row('t1', 'kuaishou', 'p1', { owner: LEGACY_OWNER_SUBJECT })],
      historyRecords: [hist('task-1', 'kuaishou', 'p1', null)],
    })
    expect(plans).toEqual([{ trackedId: 't1', publishHistoryId: 'task-1' }])
  })

  it('历史记录缺 taskId / platform / postId 三者之一 ⇒ 不入索引并计数', () => {
    const { plans, diagnostics } = planPublishHistoryLinks({
      trackedRows: [row('t1', 'kuaishou', 'p1')],
      historyRecords: [
        { id: 'r1', platform: 'kuaishou', result: { postId: 'p1' } },        // 无 taskId
        { id: 'r2', taskId: 'task-1', result: { postId: 'p1' } },            // 无 platform
        { id: 'r3', taskId: 'task-1', platform: 'kuaishou', result: {} },    // 无 postId
      ],
    })
    expect(plans).toEqual([])
    expect(diagnostics.historySkipped).toBe(3)
    expect(diagnostics.unmatched).toBe(1)
  })

  it('diagnostics 必须穷尽每一条输入行（scanned = 各出口之和）', () => {
    const trackedRows = [
      row('a', 'kuaishou', 'p1'),
      row('b', 'kuaishou', 'p2', { publishHistoryId: 'x' }),
      row('c', 'kuaishou', ''),
      row('d', 'kuaishou', 'p4'),
    ]
    const { diagnostics } = planPublishHistoryLinks({
      trackedRows,
      historyRecords: [hist('task-a', 'kuaishou', 'p1')],
    })
    expect(diagnostics.scanned).toBe(trackedRows.length)
    expect(
      diagnostics.linked + diagnostics.alreadyLinked + diagnostics.skippedEmptyPostId +
      diagnostics.ambiguous + diagnostics.unmatched + diagnostics.unowned,
    ).toBe(diagnostics.scanned)
  })

  it('空输入不得抛错（启动自愈路径会被反复调用）', () => {
    expect(planPublishHistoryLinks({ trackedRows: [], historyRecords: [] }).plans).toEqual([])
    expect(planPublishHistoryLinks({}).plans).toEqual([])
    expect(planPublishHistoryLinks(null).diagnostics.scanned).toBe(0)
  })

  it('历史扫描上限必须是显式常量（防"读 50 条默认值"把存量当成不存在）', () => {
    expect(typeof TRACKED_LINK_HISTORY_SCAN_LIMIT).toBe('number')
    expect(TRACKED_LINK_HISTORY_SCAN_LIMIT).toBeGreaterThanOrEqual(1000)
  })
})

describe('linkExistingTrackedContent — 编排层（假 store 抓真实写动作）', () => {
  function fakeStore (rows, opts = {}) {
    const calls = []
    return {
      calls,
      listUnlinkedTrackedForBackfill (limit) {
        if (opts.throwList) throw new Error('db exploded')
        return rows.slice(0, limit)
      },
      setTrackedPublishHistoryId (id, publishHistoryId) {
        calls.push([id, publishHistoryId])
        return opts.failingWrite ? false : true
      },
    }
  }

  it('候选为空 ⇒ 一条 UPDATE 都不发（writesAttempted=0）', () => {
    const store = fakeStore([])
    const r = linkExistingTrackedContent({ store, historyRecords: [hist('t', 'kuaishou', 'p')] })
    expect(store.calls).toEqual([])
    expect(r.writesAttempted).toBe(0)
    expect(r.linked).toBe(0)
  })

  it('逐行写入，值必须是发布任务 id', () => {
    const store = fakeStore([row('t1', 'kuaishou', 'p1'), row('t2', 'kuaishou', 'p2')])
    const r = linkExistingTrackedContent({
      store,
      historyRecords: [hist('task-1', 'kuaishou', 'p1'), hist('task-2', 'kuaishou', 'p2')],
    })
    expect(store.calls).toEqual([['t1', 'task-1'], ['t2', 'task-2']])
    expect(r.linked).toBe(2)
    expect(r.writesAttempted).toBe(2)
  })

  it('store 未就绪（方法缺席）⇒ 返回零计数且不抛错，并留一条 warn', () => {
    const warns = []
    const r = linkExistingTrackedContent({
      store: {},
      historyRecords: [],
      log: { warn: (...a) => warns.push(a.join(' ')), info: () => {} },
    })
    expect(r.linked).toBe(0)
    expect(warns.join('|')).toContain('unavailable')
  })

  it('读列表抛错 ⇒ 吞成零计数并出声（回填是旁路，绝不影响发布主流程）', () => {
    const warns = []
    const store = fakeStore([], { throwList: true })
    const r = linkExistingTrackedContent({
      store, historyRecords: [], log: { warn: (...a) => warns.push(a.join(' ')), info: () => {} },
    })
    expect(r.linked).toBe(0)
    expect(warns.join('|')).toContain('read')
  })

  it('写失败如实计入 writeFailed，不虚报 linked', () => {
    const store = fakeStore([row('t1', 'kuaishou', 'p1')], { failingWrite: true })
    const r = linkExistingTrackedContent({ store, historyRecords: [hist('task-1', 'kuaishou', 'p1')] })
    expect(r.writesAttempted).toBe(1)
    expect(r.linked).toBe(0)
    expect(r.writeFailed).toBe(1)
  })

  it('有实际补齐时才出声；稳态（零候选）不得每次启动都写一行 info 掩盖真实事件', () => {
    const infos = []
    linkExistingTrackedContent({
      store: fakeStore([]),
      historyRecords: [hist('t', 'kuaishou', 'p')],
      log: { warn: () => {}, info: (...a) => infos.push(a.join(' ')) },
    })
    expect(infos).toEqual([])

    linkExistingTrackedContent({
      store: fakeStore([row('t1', 'kuaishou', 'p1')]),
      historyRecords: [hist('task-1', 'kuaishou', 'p1')],
      log: { warn: () => {}, info: (...a) => infos.push(a.join(' ')) },
    })
    expect(infos.length).toBe(1)
    expect(infos[0]).toContain('linked=1')
  })

  it('存在歧义键时要单独留痕（这是"为什么这里还是空"的现场证据）', () => {
    const infos = []
    linkExistingTrackedContent({
      store: fakeStore([row('t1', 'kuaishou', 'p1')]),
      historyRecords: [hist('task-a', 'kuaishou', 'p1'), hist('task-b', 'kuaishou', 'p1')],
      log: { warn: () => {}, info: (...a) => infos.push(a.join(' ')) },
    })
    expect(infos.join('|')).toContain('ambiguous=1')
  })
})
