'use strict'
/**
 * test/cloud-accounts-concurrency.test.js — 云端账号镜像的「读-判-写不丢更新」回归
 *
 * 为什么单独成文件、并且**不用**记录 SQL 的 fake client：
 * 既有 `cloud-accounts-repository.test.js` 的夹具只把语句文本与参数记下来，返回预置响应，
 * 它对「两条并发 PUT 真的互相覆盖」完全免疫——因为它没有一份会被写坏的行状态。
 * 本文件用一台**会执行语义的假库**（按 SQL 里的列名与 `$n` 下标解析，不硬编码顺序），
 * 让 lost update 真的可能发生：两个写者各自读到同一行、各自裁决、先后发带 CAS 谓词的写；
 * 后写者必须影响 0 行并被如实改判，而不是双双报 `updated` 把对方刚写入的有效凭证抹掉。
 *
 * 选择 CAS（`UPDATE ... WHERE credential_digest = 本次读到的值`）而不是 `SELECT ... FOR UPDATE`：
 * 后者要求 `pool.connect()` + 显式事务，会把「逐条独立裁决、一条失败不整批回滚」变成持锁长事务，
 * 并让整批串行化（见 cloud-account-repository.js 文件头约束 3）。
 */
const assert = require('assert')
const test = require('node:test')

const repositoryModule = require('../src/cloud-accounts/cloud-account-repository')
const { createCloudAccountRepository, INSERT_ACCOUNT, UPDATE_ACCOUNT, UPDATE_ACCOUNT_METADATA, SELECT_ROW } = repositoryModule
const { credentialDigest } = require('../src/cloud-accounts/credential-digest')

const USER = 'u-1'
const PLATFORM = 'douyin'
const UID = 'uid-9'

function envelope(marker) {
  return {
    iv: Buffer.alloc(12, 1),
    ciphertext: Buffer.from(`cipher-${marker}`, 'utf8'),
    tag: Buffer.alloc(16, 2),
    encryptedDataKey: Buffer.alloc(32, 3),
  }
}

function item(overrides) {
  return Object.assign({
    platform: PLATFORM,
    platformUid: UID,
    displayName: '数字生命丘丘',
    accountName: '丘丘',
    avatar: 'https://p3.douyinpic.com/a.png',
    followers: 12345,
    isActive: true,
    credentialDigest: 'a'.repeat(64),
    credentialUpdatedAt: '2026-09-26T08:00:00.000Z',
    metadataUpdatedAt: '2026-09-26T08:00:00.000Z',
    createdAt: null,
    lastSyncDeviceLabel: 'DESKTOP-A1',
    reportedCredentialUpdatedAt: '2026-09-26T08:00:00.000Z',
    credential: envelope('a'),
  }, overrides || {})
}

/** `UPDATE ... SET col = $n, ...` 的列 → 参数下标映射（按下标解析，别按列序硬编码）。 */
function parseSetAssignments(sql) {
  const body = /SET([\s\S]*?)WHERE/i.exec(sql)
  if (!body) return {}
  const map = {}
  for (const part of body[1].split(',')) {
    const pair = /^\s*([a-z_]+)\s*=\s*\$(\d+)/.exec(part.trim())
    if (pair) map[pair[1]] = Number(pair[2]) - 1
  }
  return map
}

function parseCasDigest(sql) {
  const match = /WHERE[\s\S]*?credential_digest\s*=\s*\$(\d+)/i.exec(sql)
  return match ? Number(match[1]) - 1 : null
}

function parseInsertColumns(sql) {
  const match = /INSERT INTO cloud_accounts\s*\(([^)]*)\)/i.exec(sql)
  if (!match) return null
  return match[1].split(',').map((name) => name.trim())
}

/**
 * 会执行语义的假库：真的维护一行 `cloud_accounts`，真的按 `credential_digest` 谓词决定影响 0 行还是 1 行。
 * 只实现本特性用到的四种语句，其余返回空集（用例会断言没有出现未实现的语句形态）。
 */
function executablePool(initialRow) {
  const state = { row: initialRow ? Object.assign({}, initialRow) : null, applied: { credentialUpdates: 0, metadataUpdates: 0, inserts: 0 }, issued: { credentialUpdates: 0, metadataUpdates: 0, inserts: 0, selects: 0 } }
  const calls = []
  const keyMatches = (values) => state.row
    && state.row.user_id === values[0] && state.row.platform === values[1] && state.row.platform_uid === values[2]

  return {
    state,
    calls,
    async query(sql, values) {
      calls.push({ sql, values })
      if (/^\s*SELECT/i.test(sql)) {
        state.issued.selects += 1
        assert.ok(/FROM cloud_accounts/.test(sql), `未实现的 SELECT：${sql.slice(0, 60)}`)
        return { rows: keyMatches(values) ? [Object.assign({}, state.row)] : [], rowCount: keyMatches(values) ? 1 : 0 }
      }
      if (/^\s*INSERT INTO cloud_accounts/i.test(sql)) {
        state.issued.inserts += 1
        assert.ok(/ON CONFLICT \(user_id, platform, platform_uid\) DO NOTHING/i.test(sql), 'INSERT 必须靠唯一约束做幂等')
        if (keyMatches(values)) return { rows: [], rowCount: 0 } // 已被并发写者建行
        const columns = parseInsertColumns(sql)
        const row = { id: String(100 + state.issued.inserts) }
        columns.forEach((name, index) => { row[name] = values[index] })
        row.credential_updated_at = new Date(row.credential_updated_at)
        row.metadata_updated_at = new Date(row.metadata_updated_at)
        row.updated_at = new Date()
        state.row = row
        state.applied.inserts += 1
        return { rows: [{ id: row.id }], rowCount: 1 }
      }
      if (/^\s*UPDATE cloud_accounts/i.test(sql)) {
        const credentialWrite = sql.includes('credential_ciphertext')
        if (credentialWrite) state.issued.credentialUpdates += 1
        else state.issued.metadataUpdates += 1
        assert.ok(keyMatches(values), 'UPDATE 的 WHERE 必须命中归属 + 合并键')
        const casIndex = parseCasDigest(sql)
        assert.ok(casIndex !== null, `写语句缺 CAS 谓词：${sql.slice(0, 80)}`)
        // 谓词不匹配 = 读-判-写之间别人改过凭证列 → 影响 0 行，本条写完全不生效。
        if (String(values[casIndex]) !== String(state.row.credential_digest)) return { rows: [], rowCount: 0 }
        for (const [column, index] of Object.entries(parseSetAssignments(sql))) {
          state.row[column] = values[index]
        }
        if (credentialWrite) {
          state.row.credential_updated_at = new Date(values[parseSetAssignments(sql).credential_updated_at])
          state.applied.credentialUpdates += 1
        } else {
          state.applied.metadataUpdates += 1
        }
        state.row.updated_at = new Date()
        return { rows: [{ id: state.row.id }], rowCount: 1 }
      }
      throw new Error(`假库未实现该语句：${sql.slice(0, 80)}`)
    },
  }
}

function storedDigest(pool) {
  return pool.state.row.credential_digest
}

test('cloud-account-repository：并发 PUT 同一合并键不得互覆盖', async (t) => {
  await t.test('两台设备同时带 force 上行不同凭证：CAS 决出唯一胜者，绝双双报 updated', async () => {
    const pool = executablePool(null)
    const repository = createCloudAccountRepository({ pool })
    // 云端先是 z 那份；设备 A 与 B 各自本机实测后都带 force 上行自己的凭证（PRD §7.2 的 local-wins）。
    await repository.upsertMany(USER, [item({ credentialDigest: 'z'.repeat(64), credential: envelope('z') })])
    pool.calls.length = 0
    pool.state.issued = { credentialUpdates: 0, metadataUpdates: 0, inserts: 0, selects: 0 }
    pool.state.applied = { credentialUpdates: 0, metadataUpdates: 0, inserts: 0 }

    const deviceA = item({ credentialDigest: 'a'.repeat(64), credential: envelope('a'), lastSyncDeviceLabel: 'DESKTOP-A', force: 'local-wins' })
    const deviceB = item({ credentialDigest: 'b'.repeat(64), credential: envelope('b'), lastSyncDeviceLabel: 'DESKTOP-B', force: 'local-wins' })

    // 真正的并发：两条 upsertMany 同时起跑，各自先读到同一份 z 行，再各自裁决。
    const [a, b] = await Promise.all([
      repository.upsertMany(USER, [deviceA]),
      repository.upsertMany(USER, [deviceB]),
    ])
    const outcomes = [a.results[0].outcome, b.results[0].outcome]

    assert.strictEqual(outcomes.filter((outcome) => outcome === 'updated').length, 1,
      `只允许一个写者报 updated（双双报 updated 就是互相覆盖的形态）：${JSON.stringify(outcomes)}`)
    assert.strictEqual(pool.state.applied.credentialUpdates, 1, '真正落库的凭证覆盖写必须恰好一次')
    assert.strictEqual(pool.state.issued.credentialUpdates, 2,
      '每个写者各发一条凭证写（实现退化成重试覆盖时这里会 >2）')
    const loserIndex = outcomes.indexOf('updated') === 0 ? 1 : 0
    const loser = loserIndex === 0 ? a : b
    assert.strictEqual(loser.results[0].outcome, 'conflict', '被 CAS 挡下的那一位必须如实报冲突')
    assert.ok(loser.results[0].credentialFreshness === 'cloud' || loser.results[0].credentialFreshness === 'local',
      `冲突必须带新鲜度回传：${JSON.stringify(loser.results[0])}`)
    const expectedDigest = outcomes[0] === 'updated' ? 'a'.repeat(64) : 'b'.repeat(64)
    assert.strictEqual(storedDigest(pool), expectedDigest, '落库摘要必须正是赢的那一份')
    assert.strictEqual(pool.calls.some((call) => /^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(call.sql)), false,
      '逐条独立裁决不得被包进事务（PRD §7.2 一条失败不整批回滚）')
  })

  await t.test('两把 force 都没有（首轮上行）：一律 conflict，一个写请求都不发', async () => {
    const pool = executablePool(null)
    const repository = createCloudAccountRepository({ pool })
    await repository.upsertMany(USER, [item({ credentialDigest: 'z'.repeat(64), credential: envelope('z') })])
    pool.calls.length = 0
    pool.state.issued = { credentialUpdates: 0, metadataUpdates: 0, inserts: 0, selects: 0 }
    pool.state.applied = { credentialUpdates: 0, metadataUpdates: 0, inserts: 0 }

    const [a, b] = await Promise.all([
      repository.upsertMany(USER, [item({ credentialDigest: 'a'.repeat(64), credential: envelope('a') })]),
      repository.upsertMany(USER, [item({ credentialDigest: 'b'.repeat(64), credential: envelope('b') })]),
    ])
    assert.deepStrictEqual([a.results[0].outcome, b.results[0].outcome], ['conflict', 'conflict'])
    assert.strictEqual(pool.state.issued.credentialUpdates, 0)
    assert.strictEqual(pool.state.issued.metadataUpdates, 0)
    assert.strictEqual(pool.state.issued.inserts, 0, '冲突态不得发任何写请求')
    assert.strictEqual(storedDigest(pool), 'z'.repeat(64), '云端凭证必须原地不动')
  })

  await t.test('CAS 落空后绝不重试覆盖：落空的写者只发一条凭证写，重读后如实改判', async () => {
    // 单写者版本：把行的 digest 在「读」与「写」之间被人换掉（这里直接把初始行的 digest 设成
    // 与上报值不同、且带 CAS 会落空的形态），验证实现不会「再写一次直到写进去」。
    const pool = executablePool({
      id: '1', user_id: USER, platform: PLATFORM, platform_uid: UID,
      display_name: '别的名字', account_name: '丘丘', avatar: 'https://p3.douyinpic.com/a.png',
      followers: '12345', is_active: true, credential_digest: 'z'.repeat(64),
      last_reported_status: null, credential_updated_at: new Date('2026-09-25T08:00:00Z'),
      metadata_updated_at: new Date('2026-09-25T08:00:00Z'), last_sync_device_label: 'DESKTOP-Z',
    })
    const repository = createCloudAccountRepository({ pool })
    // 上报方带 force=local-wins（PRD §7.2 的凭证写权）：首轮读到 z → 发一条带 CAS 的凭证写 →
    // 谓词命中 z 才生效。这里让它命中：先断言写入成功，再用同一夹具把 CAS 打成落空态。
    const ok = await repository.upsertMany(USER, [item({ credentialDigest: 'a'.repeat(64), credential: envelope('a'), force: 'local-wins' })])
    assert.strictEqual(ok.results[0].outcome, 'updated')
    assert.strictEqual(pool.state.issued.credentialUpdates, 1)
    assert.strictEqual(storedDigest(pool), 'a'.repeat(64))

    // 现在制造落空：把行的 digest 换掉，但让仓储「看到」旧值——用一次性读拦截实现。
    const pool2 = executablePool({
      id: '2', user_id: USER, platform: PLATFORM, platform_uid: UID,
      display_name: '别的名字', account_name: '丘丘', avatar: 'https://p3.douyinpic.com/a.png',
      followers: '12345', is_active: true, credential_digest: 'z'.repeat(64),
      last_reported_status: null, credential_updated_at: new Date('2026-09-25T08:00:00Z'),
      metadata_updated_at: new Date('2026-09-25T08:00:00Z'), last_sync_device_label: 'DESKTOP-Z',
    })
    const repository2 = createCloudAccountRepository({ pool: pool2 })
    let servedStale = false
    const realQuery = pool2.query.bind(pool2)
    pool2.query = async (sql, values) => {
      // 首次 SELECT 回一份「已经等于本方 digest」的旧快照：于是本方判定「有写权」并发出凭证写，
      // 而库里真实 digest 仍是 z → CAS 必然落空。若实现选择「重试覆盖」，它会第二次发凭证写并真的
      // 把库里那行盖掉——那正是本条要拦的形态。
      if (/^\s*SELECT/i.test(sql) && !servedStale) {
        servedStale = true
        return { rows: [{ id: '2', user_id: USER, platform: PLATFORM, platform_uid: UID, display_name: '数字生命丘丘', account_name: '丘丘', avatar: 'https://p3.douyinpic.com/a.png', followers: '12345', is_active: true, credential_digest: 'a'.repeat(64), last_reported_status: null, credential_updated_at: new Date('2026-09-25T08:00:00Z'), metadata_updated_at: new Date('2026-09-25T08:00:00Z'), last_sync_device_label: 'DESKTOP-A1' }], rowCount: 1 }
      }
      return realQuery(sql, values)
    }
    pool2.state.issued = { credentialUpdates: 0, metadataUpdates: 0, inserts: 0, selects: 0 }
    pool2.state.applied = { credentialUpdates: 0, metadataUpdates: 0, inserts: 0 }
    const raced = await repository2.upsertMany(USER, [item({ credentialDigest: 'b'.repeat(64), credential: envelope('b'), force: 'local-wins' })])
    assert.strictEqual(raced.results[0].outcome, 'conflict', `CAS 落空必须如实报冲突：${JSON.stringify(raced.results[0])}`)
    assert.ok(raced.results[0].credentialFreshness === 'cloud' || raced.results[0].credentialFreshness === 'local')
    assert.strictEqual(pool2.state.issued.credentialUpdates, 1,
      `CAS 落空后不得重试覆盖（凭证写只允许发出一次）：${pool2.state.issued.credentialUpdates}`)
    assert.strictEqual(storedDigest(pool2), 'z'.repeat(64), '库里那行必须仍是抢先赢的那一份')
  })
})

test('cloud-account-repository：写语句的列集合本身就是门禁', async (t) => {
  await t.test('元数据只写分支的 SET 段不得出现任何凭证列（WHERE 里的 CAS 谓词除外）', () => {
    const setClause = /SET([\s\S]*?)WHERE/i.exec(UPDATE_ACCOUNT_METADATA)
    assert.ok(setClause, '元数据写语句缺 SET 段')
    for (const column of ['credential_ciphertext', 'credential_iv', 'credential_auth_tag', 'encrypted_data_key', 'credential_digest', 'credential_updated_at']) {
      assert.strictEqual(new RegExp(`\\b${column}\\s*=`).test(setClause[1]), false,
        `元数据写语句的 SET 段出现了 ${column}，force 的列边界就失效了`)
    }
    assert.match(UPDATE_ACCOUNT_METADATA, /WHERE user_id = \$1 AND platform = \$2 AND platform_uid = \$3/)
    // WHERE 里必须**留着** credential_digest 谓词：它在这里只作条件、不作赋值。
    assert.match(UPDATE_ACCOUNT_METADATA, /WHERE[\s\S]*credential_digest\s*=\s*\$\d+/)
  })

  await t.test('两条写语句都必须带 CAS 谓词；缺一条就是无条件覆盖', () => {
    for (const [name, sql] of [['UPDATE_ACCOUNT', UPDATE_ACCOUNT], ['UPDATE_ACCOUNT_METADATA', UPDATE_ACCOUNT_METADATA]]) {
      assert.ok(parseCasDigest(sql) !== null, `${name} 缺 credential_digest 谓词`)
      assert.strictEqual(/credential_digest\s+IS\s+NULL/i.test(sql), false, `${name} 不得把谓词写成可空跳过`)
    }
    assert.match(SELECT_ROW, /FROM cloud_accounts WHERE user_id = \$1/)
  })

  await t.test('last_reported_status 不在任何写语句里（PRD §6.1 只读快照，客户端不得写）', () => {
    for (const [name, sql] of [['INSERT_ACCOUNT', INSERT_ACCOUNT], ['UPDATE_ACCOUNT', UPDATE_ACCOUNT], ['UPDATE_ACCOUNT_METADATA', UPDATE_ACCOUNT_METADATA]]) {
      assert.strictEqual(/last_reported_status/.test(sql), false, `${name} 仍试图写 last_reported_status`)
    }
    assert.match(SELECT_ROW, /last_reported_status/, '读侧仍要能拿到服务端自己那份快照')
  })

  await t.test('库里已有服务端快照、上报记录没有该字段 → 仍判 unchanged，不发冗余写', async () => {
    const pool = executablePool({
      id: '1', user_id: USER, platform: PLATFORM, platform_uid: UID,
      display_name: '数字生命丘丘', account_name: '丘丘', avatar: 'https://p3.douyinpic.com/a.png',
      followers: '12345', is_active: true, credential_digest: 'a'.repeat(64),
      last_reported_status: 'expired', credential_updated_at: new Date('2026-09-26T08:00:00Z'),
      metadata_updated_at: new Date('2026-09-26T08:00:00Z'), last_sync_device_label: 'DESKTOP-A1',
    })
    const repository = createCloudAccountRepository({ pool })
    const result = await repository.upsertMany(USER, [item({ credentialDigest: 'a'.repeat(64) })])
    assert.deepStrictEqual(result.results, [{ platform: PLATFORM, platformUid: UID, outcome: 'unchanged' }],
      '把服务端只读快照当成内容差异，会让每轮同步都刷一次假 updated')
    assert.strictEqual(pool.calls.length, 1, 'unchanged 不得发写请求')
    assert.strictEqual(pool.state.row.last_reported_status, 'expired', '既有快照不得被本轮写入抹掉')
  })

  await t.test('摘要由服务端从明文算出：同一内容两轮上行必须收敛到 unchanged', async () => {
    const plaintext = { cookies: [{ name: 'sid', value: 'v-1', domain: '.example.com', path: '/' }], localStorage: {}, indexedDB: {} }
    const digest = credentialDigest(plaintext)
    assert.match(digest, /^[0-9a-f]{64}$/, 'digest 形态必须是 64 位小写十六进制（列合同）')
    const pool = executablePool(null)
    const repository = createCloudAccountRepository({ pool })
    const payload = item({ credentialDigest: digest })
    assert.strictEqual((await repository.upsertMany(USER, [payload])).results[0].outcome, 'created')
    assert.strictEqual((await repository.upsertMany(USER, [payload])).results[0].outcome, 'unchanged')
    const reordered = item({ credentialDigest: credentialDigest({ indexedDB: {}, localStorage: {}, cookies: plaintext.cookies.slice().reverse() }) })
    assert.strictEqual((await repository.upsertMany(USER, [reordered])).results[0].outcome, 'unchanged',
      'cookie 顺序不得改变服务端摘要（否则 unchanged 会被误判成冲突）')
  })
})
