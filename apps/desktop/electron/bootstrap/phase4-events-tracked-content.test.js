/**
 * 发布成功 → tracked_content 关联键 的跨模块契约锁（P2-6b）
 *
 * 为什么单独开一个文件而不是塞进 phase4-events.test.js：
 *  ① 那个文件已 529 行、在 max-lines 挂账里，往里加会把预算吃在无关用例上；
 *  ② 本文件量的是「三段接缝」——真 wiring（wireTaskQueueEvents）→ 真存储
 *     （performance-loop-store mixin + activate-viral-schema 真建表）→ 读侧那段 join 投影。
 *     三段各写各的单测时，`publish_history_id` 全 NULL 可以躺一整轮无人看见
 *     （实测：phase4-events.test.js 对 addTrackedContent 零断言）。
 *
 * 命名陷阱由 T3 守住：这一列存**发布任务 id**，不是发布历史行的 entry.id。
 * 写侧改成 entry.id ⇒ 本文件必红。
 */
// @vitest-environment node
const { EventEmitter } = require('events')
const log = require('../services/logger')
const { wireTaskQueueEvents } = require('./phase4-events')
const { migratePerformanceLoopSchema } = require('../services/activate-viral-schema')

async function makeStore () {
  const Database = require('../services/sqlite-wrapper')
  const db = new Database(null)
  // 必须 await：sql.js 的 wasm 未就绪时 exec/prepare 是**静默空转**（不抛错、不落库）。
  // 漏掉这句的表现是"断言查不到行但一条 warn 都没有"，与本切片要防的静默失败同形。
  await Database.ready
  if (!db._db) db._init()
  // 注意 arity：execSchemaSql(db, sql) 是**双参**回调。写成 (sql) => db.execOrThrow(sql)
  // 会把 db 对象当 SQL 交给 sql.js，它不报错、也什么都不建（实测建出 0 张表）。
  migratePerformanceLoopSchema(db, (target, sql) => target.execOrThrow(sql))
  // 夹具自证：表没建起来时，后面每条断言都会以"查不到行"的形式误导排查方向。
  const built = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
  for (const need of ['rewrite_history', 'tracked_content', 'performance_snapshot', 'pattern_performance']) {
    if (!built.includes(need)) throw new Error(`夹具失效：真迁移没建出 ${need}（实得 ${JSON.stringify(built)}）`)
  }
  const mixin = require('../services/store/performance-loop-store')
  const store = Object.assign({}, mixin)
  store.db = db
  store._ready = true
  // 写入侧自证：addTrackedContent 不看 changes 就返回 id，表缺失时也会"成功"。
  const probeId = store.addTrackedContent({ id: '__fixture_probe__', platform: 'probe', postId: '', ownerSubject: null })
  if (!probeId || readRow(store, '__fixture_probe__') === undefined) {
    throw new Error('夹具失效：真 store 写入后读不回来（写入被静默吞掉）')
  }
  store.db.prepare('DELETE FROM tracked_content').run()
  return store
}

function readRow (store, id) {
  return store.db.prepare('SELECT * FROM tracked_content WHERE id = ?').get(id)
}

/**
 * 读侧投影：逐字来自 apps/desktop/src/views/PublishHistory.vue:602-608
 * （byTask 用 publish_history_id 建键，查询用 record.taskId || record.id）。
 * 搬进测试的目的只有一个：写侧存错东西时这里必须查不到。
 */
function joinLikeHistoryPage (trackedRows, record) {
  const byTask = new Map()
  for (const t of trackedRows) {
    if (t.publish_history_id) byTask.set(String(t.publish_history_id), t)
  }
  return byTask.get(String(record.taskId || record.id)) || null
}

function wire (store, history) {
  const taskQueue = new EventEmitter()
  wireTaskQueueEvents({
    taskQueue,
    history,
    publishMonitor: { createMonitorTask: vi.fn() },
    publishImpactTracker: { scheduleImpactTracking: vi.fn() },
    getMainWin: () => null,
    store,
  })
  return taskQueue
}

describe('phase4-events → tracked_content 关联链（真存储）', () => {
  let logged
  beforeEach(() => {
    vi.resetModules()
    // 真 logger 会往日志目录写文件；这里只留现场给断言用，不落盘。
    // phase4-events 在 require 期拿到的是 logger **模块对象**本身（不是解构出来的函数），
    // 所以 spyOn 拦得住 —— 换成解构本地绑定就拦不住（本仓踩过）。
    logged = { warn: [], info: [], error: [] }
    vi.spyOn(log, 'warn').mockImplementation((tag, msg) => { logged.warn.push(`${tag} ${msg}`) })
    vi.spyOn(log, 'info').mockImplementation((tag, msg) => { logged.info.push(`${tag} ${msg}`) })
    vi.spyOn(log, 'error').mockImplementation((tag, msg) => { logged.error.push(`${tag} ${msg}`) })
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('T1/T3：发布成功后，落库的 publish_history_id 必须等于 task.id，且历史页那段 join 能查到', async () => {
    const store = await makeStore()
    const history = { addRecord: vi.fn(() => ({ id: 'history-row-id-should-NOT-be-used' })), listRecords: () => ({ total: 0, records: [] }) }

    const taskQueue = wire(store, history)
    taskQueue.emit('task:success', {
      id: 'task_live_1',
      owner_subject: 'user-A',
      platform: 'kuaishou',
      article: { title: '关联测试' },
      result: { postId: 'ks-9', url: 'https://www.kuaishou.com/short-video/ks-9' },
    })

    const rows = store.db.prepare('SELECT * FROM tracked_content').all()
    expect(logged.error, '真存储路径不得留下被吞掉的错误').toEqual([])
    expect(rows).toHaveLength(1)
    // 关键：这一列必须是 task.id，不是 addRecord() 返回的 entry.id
    expect(String(rows[0].publish_history_id)).toBe('task_live_1')

    const hit = joinLikeHistoryPage(rows, { taskId: 'task_live_1', id: 'history-row-id-should-NOT-be-used' })
    expect(hit, '历史页按 taskId join，写侧存错键时这里为 null（表现列恒空的成因）').toBeTruthy()
    expect(hit.id).toBe(rows[0].id)
  })

  it('T2：task.id 缺失 ⇒ 该列留 NULL 并出声，不得写进 "undefined" 这种看着有值的东西', async () => {
    const store = await makeStore()
    const history = {
      addRecord: vi.fn(() => ({ id: 'h1' })),
      listRecords: () => ({ total: 0, records: [] }),
    }

    wire(store, history).emit('task:success', {
      platform: 'zhihu',
      article: { title: '无任务 id' },
      result: { postId: 'p1' },
    })

    const rows = store.db.prepare('SELECT * FROM tracked_content').all()
    expect(rows).toHaveLength(1)
    expect(rows[0].publish_history_id).toBeNull()
    expect(logged.warn.join('|'), '缺 id 必须留下"未关联"的现场，而不是静默写 NULL').toContain('unlinked')
  })

  it('T4/T5：存量未关联行在首次发布成功时被补齐，且第二次不再产生写入（幂等）', async () => {
    const store = await makeStore()
    // 模拟"上一轮发布留下的孤儿行"：有 postId、没有关联键
    store.addTrackedContent({ id: 'legacy-1', platform: 'kuaishou', postId: 'ks-old', ownerSubject: 'user-A' })
    expect(readRow(store, 'legacy-1').publish_history_id).toBeNull()

    const history = {
      addRecord: vi.fn(() => ({ id: 'h-new' })),
      listRecords: () => ({
        total: 2,
        records: [
          { id: 'h-old', taskId: 'task_old_1', platform: 'kuaishou', owner_subject: 'user-A', result: { postId: 'ks-old' } },
          { id: 'h-new', taskId: 'task_new_1', platform: 'kuaishou', owner_subject: 'user-A', result: { postId: 'ks-new' } },
        ],
      }),
    }

    const taskQueue = wire(store, history)
    taskQueue.emit('task:success', {
      id: 'task_new_1',
      owner_subject: 'user-A',
      platform: 'kuaishou',
      article: { title: '新发布' },
      result: { postId: 'ks-new' },
    })

    expect(readRow(store, 'legacy-1').publish_history_id).toBe('task_old_1')
    const newRow = store.db.prepare('SELECT * FROM tracked_content WHERE id <> ?').get('legacy-1')
    expect(newRow.publish_history_id).toBe('task_new_1')

    // 第二次发布：legacy-1 已有值，绝不得被改写（判据 ①/② 的落库级证据）
    const taskQueue2 = wire(store, {
      addRecord: vi.fn(() => ({ id: 'h3' })),
      listRecords: () => ({ total: 1, records: [{ id: 'h3', taskId: 'task_third', platform: 'kuaishou', owner_subject: 'user-A', result: { postId: 'ks-old' } }] }),
    })
    taskQueue2.emit('task:success', {
      id: 'task_third',
      owner_subject: 'user-A',
      platform: 'kuaishou',
      article: { title: '第三次' },
      result: { postId: 'ks-third' },
    })
    expect(readRow(store, 'legacy-1').publish_history_id, '已有值不得被回填覆盖').toBe('task_old_1')
  })

  it('T6：歧义（同归属同作品 id 命中两条历史）不写；跨归属同作品 id 各接各的', async () => {
    const store = await makeStore()
    store.addTrackedContent({ id: 'amb-1', platform: 'douyin', postId: 'dy-1', ownerSubject: 'user-A' })
    store.addTrackedContent({ id: 'own-1', platform: 'bilibili', postId: 'bv-1', ownerSubject: 'user-A' })
    store.addTrackedContent({ id: 'own-2', platform: 'bilibili', postId: 'bv-1', ownerSubject: 'user-B' })

    const history = {
      addRecord: vi.fn(() => ({ id: 'h' })),
      listRecords: () => ({
        total: 3,
        records: [
          { id: 'a', taskId: 't-amb-a', platform: 'douyin', owner_subject: 'user-A', result: { postId: 'dy-1' } },
          { id: 'b', taskId: 't-amb-b', platform: 'douyin', owner_subject: 'user-A', result: { postId: 'dy-1' } },
          { id: 'c', taskId: 't-bv-a', platform: 'bilibili', owner_subject: 'user-A', result: { postId: 'bv-1' } },
          { id: 'd', taskId: 't-bv-b', platform: 'bilibili', owner_subject: 'user-B', result: { postId: 'bv-1' } },
        ],
      }),
    }

    wire(store, history).emit('task:success', {
      id: 'trigger',
      owner_subject: 'user-A',
      platform: 'zhihu',
      article: { title: '触发回填' },
      result: { postId: 'p-trigger' },
    })

    expect(readRow(store, 'amb-1').publish_history_id, '歧义必须留空，不许猜').toBeNull()
    expect(readRow(store, 'own-1').publish_history_id).toBe('t-bv-a')
    expect(readRow(store, 'own-2').publish_history_id).toBe('t-bv-b')
  })

  it('T7：无主行（owner_subject 为空）不参与回填——无法判定归属就不写', async () => {
    const store = await makeStore()
    store.addTrackedContent({ id: 'no-owner', platform: 'toutiao', postId: 'tt-1' })
    const history = {
      addRecord: vi.fn(() => ({ id: 'h' })),
      listRecords: () => ({ total: 1, records: [{ id: 'h1', taskId: 't-tt', platform: 'toutiao', owner_subject: 'user-A', result: { postId: 'tt-1' } }] }),
    }

    wire(store, history).emit('task:success', {
      id: 'trigger',
      owner_subject: 'user-A',
      platform: 'zhihu',
      article: { title: '触发' },
      result: { postId: 'p-x' },
    })

    expect(readRow(store, 'no-owner').publish_history_id).toBeNull()
  })

  it('T8：存储未就绪 ⇒ 整条旁路不得抛错（发布主流程绝不能被回填拖死）', async () => {
    const store = await makeStore()
    store._ready = false
    const history = { addRecord: vi.fn(() => ({ id: 'h' })), listRecords: () => ({ total: 0, records: [] }) }
    const taskQueue = wire(store, history)
    expect(() => taskQueue.emit('task:success', {
      id: 'task-x', owner_subject: 'user-A', platform: 'zhihu', article: { title: 't' }, result: { postId: 'p' },
    })).not.toThrow()
  })

  it('T9：存储层 SQL 的 IS NULL 兜底必须自己守住（判据层放行了也不覆盖既有值）', async () => {
    // 这条是 M5 反证的独占红出口：没有它，`AND publish_history_id IS NULL`
    // 就是一条没人测过的装饰性条件——判据层已经跳过已有值，其它用例永远打不到这里。
    const store = await makeStore()
    store.addTrackedContent({ id: 'guard-1', platform: 'kuaishou', postId: 'g1', ownerSubject: 'u1' })
    expect(store.setTrackedPublishHistoryId('guard-1', 'task-first')).toBe(true)
    expect(readRow(store, 'guard-1').publish_history_id).toBe('task-first')

    // 绕过判据层直接再写一次：必须拒绝，且原值不变
    expect(store.setTrackedPublishHistoryId('guard-1', 'task-second'), 'SQL 必须拒绝覆盖已有关联').toBe(false)
    expect(readRow(store, 'guard-1').publish_history_id).toBe('task-first')
  })

  it('接线锁：写侧那一行必须真的把 publishHistoryId 交出去（防"参数被悄悄删掉后测试还绿"）', async () => {
    const src = require('fs').readFileSync(require.resolve('./phase4-events'), 'utf8')
    const block = src.slice(src.indexOf('store.addTrackedContent({'))
    const end = block.indexOf('})')
    const body = block.slice(0, end)
    expect(body.includes('publishHistoryId'), 'addTrackedContent 调用里必须出现 publishHistoryId').toBe(true)
    expect(body.includes('rewriteHistoryId'), '同一段里 rewriteHistoryId 是既有键，删它属越界').toBe(true)
  })
})
