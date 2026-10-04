// @ts-check
/**
 * P2-6c 看板查询层回归（T15–T17）：真 sqlite + os.tmpdir() 隔离库
 *
 * 用真实库而不是 fake db，是因为这一层的风险恰好在 SQL 本身
 * （归属过滤写错=跨用户看数据；排序键写错=「最新快照」取错=总量虚低），
 * fake prepare 只会记录字符串，两类错都测不出来。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const Database = require('../sqlite-wrapper')
const mixin = require('./performance-loop-store')
const { migratePerformanceLoopSchema } = require('../activate-viral-schema')
const { LEGACY_OWNER_SUBJECT } = require('../store-schema')

let dbPath = ''
let db = null

function makeStore () {
  const self = { _ready: true, db }
  for (const key of Object.keys(mixin)) self[key] = mixin[key]
  return self
}

function insertTracked (id, platform, status, owner) {
  db.prepare(`INSERT INTO tracked_content (id, platform, post_id, recrawl_status, owner_subject, created_at)
              VALUES (?, ?, '', ?, ?, '2026-10-01T00:00:00.000Z')`)
    .run(id, platform, status, owner)
}

function insertSnapshot (id, trackedId, likes, capturedAt) {
  db.prepare(`INSERT INTO performance_snapshot (id, tracked_content_id, source, views, likes, comments, favorites, shares, raw, captured_at)
              VALUES (?, ?, 'auto', 0, ?, 0, 0, 0, '{}', ?)`)
    .run(id, trackedId, likes, capturedAt)
}

beforeAll(async () => {
  await Database.ready
  fs.mkdirSync(os.tmpdir(), { recursive: true })
  dbPath = path.join(fs.realpathSync(os.tmpdir()), `perf-overview-${process.pid}-${Math.random().toString(36).slice(2, 8)}.db`)
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  migratePerformanceLoopSchema(db, (target, sql) => target.execOrThrow(sql))
  // 夹具自证：表真建出来了才继续，否则「0 行」会被读成「归属过滤生效」
  const built = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
  for (const need of ['tracked_content', 'performance_snapshot']) {
    if (!built.includes(need)) throw new Error('夹具失效：' + need + ' 表未建成，实得 ' + built.join(','))
  }
})

afterAll(() => {
  if (db && typeof db.close === 'function') db.close()
  for (const suffix of ['', '-wal', '-shm']) {
    const p = dbPath + suffix
    if (p && fs.existsSync(p)) fs.rmSync(p, { force: true })
  }
})

describe('listTrackedForOverview / listSnapshotsForOverview', () => {
  it('T15 返回列最小集，快照按「最新在前」排（截断时丢最旧的）', () => {
    const store = makeStore()
    insertTracked('c1', 'zhihu', 'ok', 'user-A')
    insertSnapshot('s-old', 'c1', 1, '2026-10-01T00:00:00.000Z')
    insertSnapshot('s-new', 'c1', 5, '2026-10-02T00:00:00.000Z')

    const tracked = store.listTrackedForOverview('user-A')
    expect(Object.keys(tracked.rows[0]).sort()).toEqual(['created_at', 'id', 'last_recrawl_at', 'platform', 'recrawl_status'])

    const snaps = store.listSnapshotsForOverview('user-A')
    expect(snaps.rows.map(r => r.id)).toEqual(['s-new', 's-old'])
    expect(Object.keys(snaps.rows[0]).sort()).toEqual(
      ['captured_at', 'comments', 'favorites', 'id', 'rowid', 'shares', 'tracked_content_id', 'views', 'likes'].sort(),
    )
  })

  it('T16 归属过滤：真实身份只取本人，别人的作品与快照都不出现', () => {
    const store = makeStore()
    insertTracked('cB', 'bilibili', 'ok', 'user-B')
    insertSnapshot('sB', 'cB', 9, '2026-10-02T00:00:00.000Z')

    const a = store.listTrackedForOverview('user-A')
    expect(a.rows.map(r => r.id)).toContain('c1')
    expect(a.rows.map(r => r.id)).not.toContain('cB')
    const aSnaps = store.listSnapshotsForOverview('user-A')
    expect(aSnaps.rows.map(r => r.id)).not.toContain('sB')
  })

  it('T16b 无身份（legacy 档）只取无归属桶，绝不把已归属账号的数据端给匿名态', () => {
    const store = makeStore()
    insertTracked('legacy-null', 'zhihu', 'ok', null)
    insertTracked('legacy-empty', 'zhihu', 'ok', '')
    insertTracked('legacy-marker', 'zhihu', 'ok', LEGACY_OWNER_SUBJECT)

    const legacy = store.listTrackedForOverview(undefined)
    expect(legacy.rows.map(r => r.id).sort()).toEqual(['legacy-empty', 'legacy-marker', 'legacy-null'])
    expect(legacy.rows.map(r => r.id)).not.toContain('c1')
    expect(legacy.rows.map(r => r.id)).not.toContain('cB')
  })

  it('T17 超限如实返回 truncated 与 total，不静默把截断当全量', () => {
    const store = makeStore()
    insertTracked('cap-1', 'zhihu', 'ok', 'user-C')
    insertTracked('cap-2', 'zhihu', 'ok', 'user-C')
    insertTracked('cap-3', 'zhihu', 'ok', 'user-C')

    const capped = store.listTrackedForOverview('user-C', 2)
    expect(capped.rows).toHaveLength(2)
    expect(capped.total).toBe(3)
    expect(capped.truncated).toBe(true)

    const roomy = store.listTrackedForOverview('user-C', 50)
    expect(roomy.truncated).toBe(false)
  })

  it('T17d 快照被上限截断时必须留下最新那份（FB4：旧排序会静默压低总量）', () => {
    const store = makeStore()
    insertTracked('cCap', 'bilibili', 'ok', 'user-D')
    insertSnapshot('d-old', 'cCap', 1, '2026-09-20T00:00:00.000Z')
    insertSnapshot('d-mid', 'cCap', 2, '2026-09-25T00:00:00.000Z')
    insertSnapshot('d-new', 'cCap', 9, '2026-10-02T00:00:00.000Z')

    const capped = store.listSnapshotsForOverview('user-D', 1)
    expect(capped.rows.map(r => r.id)).toEqual(['d-new'])
    expect(capped.total).toBe(3)
    expect(capped.truncated).toBe(true)
  })

  it('T17b 孤儿快照单独计数（真孤儿=关联不到任何作品）', () => {
    const store = makeStore()
    insertSnapshot('s-orphan', 'gone-content', 3, '2026-10-02T00:00:00.000Z')
    const snaps = store.listSnapshotsForOverview('user-A')
    expect(snaps.orphanTotal).toBe(1)
    expect(snaps.rows.map(r => r.id)).not.toContain('s-orphan')
  })

  it('T17c 库未就绪时返回空结构而不是抛错（看板不得整块空白）', () => {
    const broken = { _ready: false }
    for (const key of Object.keys(mixin)) broken[key] = mixin[key]
    expect(broken.listTrackedForOverview('user-A')).toEqual({ rows: [], total: 0, truncated: false })
    expect(broken.listSnapshotsForOverview('user-A')).toEqual({ rows: [], total: 0, truncated: false, orphanTotal: 0 })
  })

  it('T17e 真实 SQL 失败必须带 error 出声，不得伪装成"没有数据"（FB7）', () => {
    // 用真库真语句：把表改名制造 no such table，这是 mock prepare 测不出来的那一类
    db.execOrThrow('ALTER TABLE tracked_content RENAME TO tracked_content_hidden')
    try {
      const store = makeStore()
      const tracked = store.listTrackedForOverview('user-A')
      expect(tracked.rows).toEqual([])
      expect(tracked.error, '查询失败必须带 error 字段').toBeTruthy()
      const snaps = store.listSnapshotsForOverview('user-A')
      expect(snaps.error).toBeTruthy()
    } finally {
      db.execOrThrow('ALTER TABLE tracked_content_hidden RENAME TO tracked_content')
    }
    // 恢复后必须立刻可用（证明上一步的 error 不是夹具坏了）
    expect(makeStore().listTrackedForOverview('user-A').error).toBeUndefined()
  })
})
