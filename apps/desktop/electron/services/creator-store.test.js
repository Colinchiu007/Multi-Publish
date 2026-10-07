/**
 * creator-store.test.js — 博主采集数据访问层：claim / lease / fencing
 *
 * 锁的是**并发正确性**。三个必须成立的不变式：
 *
 *  1. 同一作品不会被两个 worker 并发采集（claim 互斥）
 *  2. 租约过期后新 worker 可接管，但**旧 worker 的迟到提交必须被拒**（fencing）
 *  3. 冷却期内不会被自动流程重复重试（retry_after_at）
 *
 * 第 2 条最容易被漏：只有 lease 没有 fencing 时，旧 worker 在租约过期后
 * 仍可能完成并把状态改回 collected，覆盖新持有者的结果（lost update）。
 */
const { createCreatorStore } = require('./creator-store')

/** 记录每条 SQL 的假 db，用于断言 WHERE 条件里确实带了 claim_token。
 *  日志由 db 侧记录——生产代码不应为了测试而携带状态。 */
function makeDb (rows = {}) {
  const log = []
  const db = {
    log,
    prepare (sql) {
      log.push(sql)
      const one = rows.single
      const all = rows.all || []
      const run = rows.run
      return {
        sql,
        get: () => one,
        all: () => all,
        run: () => (typeof run === 'function' ? run(sql) : { changes: 1 }),
      }
    },
    exec (sql) { log.push(sql) },
  }
  return db
}

const NOW = 1_700_000_000_000

describe('creator-store · claim 互斥', () => {
  it('claim 成功的 UPDATE 必须带 claim_token 条件', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    store.claimDiscovery('d1', 'worker-a', 300000)
    const sql = db.log.find(s => /UPDATE creator_discoveries/.test(s))
    expect(sql).toBeDefined()
    expect(sql).toMatch(/claim_token\s*=\s*claim_token\s*\+\s*1/)
    expect(sql).toMatch(/collect_state\s+IN\s*\(\s*'pending'\s*,\s*'failed'\s*\)/)
    expect(sql).toMatch(/AND\s*\(\s*claimed_by IS NULL\s+OR\s+lease_expires_at IS NULL\s+OR\s+lease_expires_at\s*<\s*\?\s*\)/)
  })

  it('changes=0 表示未抢到（他人已持有且租约未过期）', () => {
    const db = makeDb({ run: () => ({ changes: 0 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    expect(store.claimDiscovery('d1', 'worker-b', 300000)).toBe(false)
  })

  it('changes>0 表示抢到', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    expect(store.claimDiscovery('d1', 'worker-a', 300000)).toBe(true)
  })

  it('claim 时 attempt_count 递增（claim 了就是真尝试）', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    store.claimDiscovery('d1', 'worker-a', 300000)
    const sql = db.log.find(s => /UPDATE creator_discoveries/.test(s))
    expect(sql).toMatch(/attempt_count\s*=\s*attempt_count\s*\+\s*1/)
  })

  it('claim 时写入租约到期时间（now + ttl）', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    store.claimDiscovery('d1', 'worker-a', 300000)
    const sql = db.log.find(s => /UPDATE creator_discoveries/.test(s))
    expect(sql).toMatch(/lease_expires_at\s*=/)
  })
})

describe('creator-store · fencing（迟到提交必须被拒）', () => {
  it('完成提交的 UPDATE 必须带 AND claim_token = ?', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    store.markCollected('d1', 7)
    const sql = db.log.find(s => /collect_state\s*=\s*'collected'/.test(s))
    expect(sql).toMatch(/AND\s+claim_token\s*=/)
  })

  it('token 不匹配（changes=0）时返回 false，旧 worker 不得覆盖', () => {
    const db = makeDb({ run: () => ({ changes: 0 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    expect(store.markCollected('d1', 3)).toBe(false)
  })

  it('token 匹配（changes=1）时返回 true', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    expect(store.markCollected('d1', 7)).toBe(true)
  })

  it('失败提交的 UPDATE 同样必须带 token 条件（不能只保护成功路径）', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    store.markFailed('d1', 9, 'boom')
    const sql = db.log.find(s => /collect_state\s*=\s*'failed'/.test(s))
    expect(sql).toMatch(/AND\s+claim_token\s*=/)
    expect(sql).toMatch(/last_error\s*=/)
  })

  it('心跳续租也必须带 token 条件，否则旧 worker 能续命新持有者的租约', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    store.renewLease('d1', 'worker-a', 7, 300000)
    const sql = db.log.find(s => /lease_expires_at/.test(s) && /UPDATE/.test(s))
    expect(sql).toMatch(/AND\s+claim_token\s*=/)
  })
})

describe('creator-store · 释放与冷却', () => {
  it('失败后写 retry_after_at（冷却期内不再自动重试）', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    store.markFailed('d1', 9, 'x', { cooldownMs: 600000 })
    const sql = db.log.find(s => /collect_state\s*=\s*'failed'/.test(s))
    expect(sql).toMatch(/retry_after_at/)
  })

  it('冷却时长可配，未传时用默认值', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    store.markFailed('d1', 9, 'x')
    expect(db.log.some(s => /retry_after_at/.test(s))).toBe(true)
  })
})

describe('creator-store · 探测幂等', () => {
  it('批量写入发现项必须依赖唯一索引（INSERT OR IGNORE）而非先查后插', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    store.upsertDiscoveries([{ creatorId: 'c1', platform: 'youtube', externalId: 'v1', url: 'u' }])
    const sql = db.log.find(s => /creator_discoveries/.test(s) && /INSERT/i.test(s))
    expect(sql).toMatch(/INSERT\s+OR\s+IGNORE/i)
  })

  it('重复探测同一 external_id 不得产生第二行', () => {
    const db = makeDb({ run: () => ({ changes: 0 }) })   // 唯一约束冲突
    const store = createCreatorStore(db, { now: () => NOW })
    const inserted = store.upsertDiscoveries([
      { creatorId: 'c1', platform: 'youtube', externalId: 'v1', url: 'u' },
    ])
    expect(inserted).toBe(0)
  })

  it('新作品被插入时计入 inserted', () => {
    const db = makeDb({ run: () => ({ changes: 1 }) })
    const store = createCreatorStore(db, { now: () => NOW })
    expect(store.upsertDiscoveries([
      { creatorId: 'c1', platform: 'youtube', externalId: 'v2', url: 'u' },
    ])).toBe(1)
  })
})

describe('creator-store · 统计查询', () => {
  it('pending 计数按 creator 维度返回，供角标使用', () => {
    const db = makeDb({ all: [{ n: 5 }] })
    const store = createCreatorStore(db, { now: () => NOW })
    expect(store.countPending('c1')).toBe(5)
    const sql = db.log.find(s => /collect_state\s*=\s*'pending'/.test(s))
    expect(sql).toMatch(/COUNT\(\*\)/i)
  })

  it('查询为空结果时返回 0 而非 undefined', () => {
    const db = makeDb({ all: [] })
    const store = createCreatorStore(db, { now: () => NOW })
    expect(store.countPending('c1')).toBe(0)
  })
})