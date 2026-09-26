const assert = require('assert')
const test = require('node:test')

const { createCloudAccountRepository } = require('../src/cloud-accounts/cloud-account-repository')

/**
 * 本仓 CI 没有真 Postgres（先例 test/postgres-migrations.test.js、
 * test/member-commerce-repository.test.js）：用记录 SQL 的 fake client 断言语句形状与参数，
 * 真库断言（唯一约束真的挡住重复、BYTEA 真的回 Buffer）留在 ubuntu + services: postgres job。
 */
function fakePool(responses) {
  const calls = []
  const queue = (responses || []).slice()
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values })
      if (queue.length > 0) {
        const next = queue.shift()
        if (next instanceof Error) throw next
        return next
      }
      return { rows: [], rowCount: 0 }
    },
  }
}

function rows(list, rowCount) {
  return { rows: list, rowCount: rowCount === undefined ? list.length : rowCount }
}

/** 参数化合同：$n 连续、无空洞，且任何字符串参数都没有被拼进 SQL 文本。 */
function assertParameterized(call) {
  const placeholders = (call.text.match(/\$\d+/g) || []).map((token) => Number(token.slice(1)))
  const params = call.values || []
  assert.ok(placeholders.length > 0, '语句没有任何占位符')
  assert.deepStrictEqual(Array.from(new Set(placeholders)).sort((a, b) => a - b), params.map((_, i) => i + 1),
    `占位符与参数数量不一致：${call.text.slice(0, 80)}`)
  for (const value of params) {
    if (typeof value === 'string' && value.length > 3 && !/^[a-z_]+$/.test(value)) {
      assert.strictEqual(call.text.includes(value), false, `用户输入被拼进了 SQL：${value}`)
    }
  }
}

const ITEM = {
  platform: 'douyin',
  platformUid: 'uid-9',
  displayName: '数字生命丘丘',
  accountName: '丘丘',
  avatar: 'https://p3.douyinpic.com/a.png',
  followers: 12345,
  isActive: true,
  credentialDigest: 'a'.repeat(64),
  credentialUpdatedAt: '2026-09-26T08:00:00.000Z',
  metadataUpdatedAt: '2026-09-26T08:00:00.000Z',
  createdAt: '2026-09-01T08:00:00.000Z',
  lastReportedStatus: 'active',
  lastSyncDeviceLabel: 'DESKTOP-A1',
  credential: {
    iv: Buffer.alloc(12, 1),
    ciphertext: Buffer.from('cipher', 'utf8'),
    tag: Buffer.alloc(16, 2),
    encryptedDataKey: Buffer.alloc(32, 3),
  },
}

function dbRow(overrides) {
  return Object.assign({
    display_name: ITEM.displayName,
    account_name: ITEM.accountName,
    avatar: ITEM.avatar,
    followers: '12345',
    is_active: true,
    credential_digest: ITEM.credentialDigest,
    last_reported_status: 'active',
    last_sync_device_label: 'DESKTOP-A1',
  }, overrides || {})
}

test('cloud-account-repository：归属过滤与摘要', async (t) => {
  await t.test('listDigest：稳定排序 + 总数由分组求和，只发两条参数化查询', async () => {
    const pool = fakePool([
      rows([
        { platform: 'zhihu', count: 1, updated_at: new Date('2026-09-25T00:00:00Z') },
        { platform: 'bilibili', count: 2, updated_at: new Date('2026-09-26T00:00:00Z') },
        { platform: 'douyin', count: 2, updated_at: new Date('2026-09-27T00:00:00Z') },
      ]),
      rows([{ count: '7' }]),
    ])
    const repository = createCloudAccountRepository({ pool })
    const digest = await repository.listDigest('u-1')

    assert.strictEqual(pool.calls.length, 2)
    pool.calls.forEach(assertParameterized)
    assert.match(pool.calls[0].text, /FROM cloud_accounts WHERE user_id = \$1/)
    assert.match(pool.calls[0].text, /GROUP BY platform/)
    assert.match(pool.calls[0].text, /ORDER BY count DESC, platform ASC/)
    assert.match(pool.calls[1].text, /FROM cloud_account_tombstones WHERE user_id = \$1/)
    assert.deepStrictEqual(pool.calls[0].values, ['u-1'])
    assert.deepStrictEqual(digest, {
      total: 5,
      // 分组求和，不额外发 COUNT(*)；同数按 platform 升序兜住，避免响应顺序抖动。
      byPlatform: [
        { platform: 'bilibili', count: 2 },
        { platform: 'douyin', count: 2 },
        { platform: 'zhihu', count: 1 },
      ],
      tombstones: 7,
      updatedAt: '2026-09-27T00:00:00.000Z',
    })
  })

  await t.test('listDigest：空库返回 total 0 / 空数组 / updatedAt null', async () => {
    const pool = fakePool([rows([]), rows([{ count: 0 }])])
    const digest = await createCloudAccountRepository({ pool }).listDigest('u-1')
    assert.deepStrictEqual(digest, { total: 0, byPlatform: [], tombstones: 0, updatedAt: null })
  })

  await t.test('listFull：绝不把凭证四列取出来（PRD §7.1 不含凭证明文）', async () => {
    const pool = fakePool([
      rows([{
        platform: 'douyin',
        platform_uid: 'uid-9',
        display_name: '数字生命丘丘',
        account_name: '丘丘',
        avatar: 'https://p3.douyinpic.com/a.png',
        followers: '12345',
        is_active: false,
        credential_digest: 'a'.repeat(64),
        last_reported_status: 'expired',
        credential_updated_at: new Date('2026-09-26T08:00:00Z'),
        metadata_updated_at: new Date('2026-09-25T08:00:00Z'),
        created_at: new Date('2026-09-01T08:00:00Z'),
        updated_at: new Date('2026-09-26T08:00:00Z'),
      }]),
      rows([{ platform: 'kuaishou', platform_uid: 'gone', deleted_at: new Date('2026-09-20T00:00:00Z') }]),
    ])
    const repository = createCloudAccountRepository({ pool })
    const full = await repository.listFull('u-1')
    pool.calls.forEach(assertParameterized)
    assert.match(pool.calls[0].text, /credential_digest/)
    for (const column of ['credential_ciphertext', 'credential_iv', 'credential_auth_tag', 'encrypted_data_key']) {
      assert.strictEqual(pool.calls[0].text.includes(column), false, `listFull 取了 ${column}`)
    }
    assert.deepStrictEqual(full.accounts, [{
      platform: 'douyin',
      platformUid: 'uid-9',
      displayName: '数字生命丘丘',
      accountName: '丘丘',
      avatar: 'https://p3.douyinpic.com/a.png',
      followers: 12345,
      isActive: false,
      credentialDigest: 'a'.repeat(64),
      credentialUpdatedAt: '2026-09-26T08:00:00.000Z',
      metadataUpdatedAt: '2026-09-25T08:00:00.000Z',
      lastReportedStatus: 'expired',
    }])
    assert.deepStrictEqual(full.tombstones, [{ platform: 'kuaishou', platformUid: 'gone', deletedAt: '2026-09-20T00:00:00.000Z' }])
  })

  await t.test('缺归属一律拒绝，且不发任何 SQL', async () => {
    for (const bad of [undefined, null, '', '   ', 12]) {
      const pool = fakePool([])
      const repository = createCloudAccountRepository({ pool })
      for (const call of [
        () => repository.listDigest(bad),
        () => repository.listFull(bad),
        () => repository.listTombstones(bad),
        () => repository.addTombstone(bad, 'douyin', 'u'),
        () => repository.getCredentials(bad, [{ platform: 'douyin', platformUid: 'u' }]),
        () => repository.clearAll(bad),
        () => repository.upsertMany(bad, [ITEM]),
      ]) {
        await assert.rejects(Promise.resolve().then(call), (error) => error.code === 'BUSINESS_USER_REQUIRED')
      }
      assert.strictEqual(pool.calls.length, 0)
    }
  })
})

test('cloud-account-repository：upsertMany 逐条独立裁决', async (t) => {
  await t.test('键不存在 → INSERT ... ON CONFLICT (user_id, platform, platform_uid) DO NOTHING → created', async () => {
    const pool = fakePool([rows([]), rows([{ id: '41' }])])
    const repository = createCloudAccountRepository({ pool })
    const result = await repository.upsertMany('u-1', [ITEM])
    assert.deepStrictEqual(result, { results: [{ platform: 'douyin', platformUid: 'uid-9', outcome: 'created' }] })
    pool.calls.forEach(assertParameterized)
    const insert = pool.calls[1]
    assert.match(insert.text, /INSERT INTO cloud_accounts/)
    assert.match(insert.text, /ON CONFLICT \(user_id, platform, platform_uid\) DO NOTHING/)
    assert.strictEqual(insert.values[0], 'u-1')
    assert.strictEqual(insert.values[1], 'douyin')
    assert.strictEqual(insert.values[2], 'uid-9')
    assert.ok(Buffer.isBuffer(insert.values[8]), 'BYTEA 必须以 Buffer 传参')
    assert.strictEqual(insert.values[12], ITEM.credentialDigest)
    // 归属维度必须出现在 WHERE/参数里，绝不接受客户端自报的第二归属。
    assert.deepStrictEqual(insert.values.slice(0, 3), ['u-1', 'douyin', 'uid-9'])
  })

  await t.test('digest 与元数据全同 → unchanged，一条写请求都不发', async () => {
    const pool = fakePool([rows([dbRow()])])
    const result = await createCloudAccountRepository({ pool }).upsertMany('u-1', [ITEM])
    assert.deepStrictEqual(result.results, [{ platform: 'douyin', platformUid: 'uid-9', outcome: 'unchanged' }])
    assert.strictEqual(pool.calls.length, 1, 'unchanged 不得发写请求')
    for (const call of pool.calls) {
      assert.strictEqual(/updated_at\s*=/.test(call.text), false, `unchanged 仍刷新了 updated_at：${call.text}`)
      assert.strictEqual(/^\s*(?:INSERT|UPDATE)\b/i.test(call.text), false)
    }
  })

  await t.test('digest 不同且没有 force → conflict，一个写请求都不发（反无条件 LWW 的核心断言）', async () => {
    const pool = fakePool([rows([dbRow({ credential_digest: 'b'.repeat(64) })])])
    const result = await createCloudAccountRepository({ pool }).upsertMany('u-1', [ITEM])
    assert.deepStrictEqual(result.results, [
      { platform: 'douyin', platformUid: 'uid-9', outcome: 'conflict', credentialFreshness: 'cloud' },
    ])
    assert.strictEqual(pool.calls.length, 1, '冲突态不得发任何写请求')
    assert.strictEqual(/^\s*(?:INSERT|UPDATE)\b/i.test(pool.calls[0].text), false)
    // 新鲜度方向：云端存储时刻比本机上报的旧 → local（让本机先验自己那份）
    const older = fakePool([rows([dbRow({ credential_digest: 'b'.repeat(64), credential_updated_at: '2026-01-01T00:00:00.000Z' })])])
    const second = await createCloudAccountRepository({ pool: older }).upsertMany('u-1', [
      Object.assign({}, ITEM, { reportedCredentialUpdatedAt: '2026-09-26T08:00:00.000Z' }),
    ])
    assert.strictEqual(second.results[0].credentialFreshness, 'local')
  })

  // force 的方向由 PRD §7.2 钉死：'local-wins' 才是「本机实测胜出、授权覆盖云端凭证」的凭据。
  // 把两侧读反的后果不是报错而是长期错：本机验证过的新凭证永远写不上去，云端一直存着失效钥匙。
  await t.test('force=local-wins 才允许碰凭证四列，且带 CAS 谓词', async () => {
    const pool = fakePool([rows([dbRow({ credential_digest: 'b'.repeat(64) })]), rows([{ id: '41' }])])
    const result = await createCloudAccountRepository({ pool }).upsertMany('u-1', [Object.assign({}, ITEM, { force: 'local-wins' })])
    assert.deepStrictEqual(result.results, [{ platform: 'douyin', platformUid: 'uid-9', outcome: 'updated' }])
    const update = pool.calls[1]
    assert.match(update.text, /^UPDATE cloud_accounts SET/)
    assert.match(update.text, /credential_ciphertext = \$9/, '本机胜出必须真的覆盖凭证列')
    assert.match(update.text, /updated_at = NOW\(\)/)
    assert.strictEqual(/created_at\s*=/.test(update.text), false, '更新不得覆盖 created_at')
    assert.match(update.text, /AND credential_digest = \$17\b/, 'CAS 谓词必须在 WHERE 里')
    assert.strictEqual(update.values[16], 'b'.repeat(64), 'CAS 参数必须是刚读到的库存 digest')
  })

  await t.test('force=cloud-wins 只写元数据，绝不覆盖凭证列', async () => {
    const pool = fakePool([rows([dbRow({ credential_digest: 'b'.repeat(64), display_name: '云端旧昵称' })]), rows([{ id: '41' }])])
    const result = await createCloudAccountRepository({ pool }).upsertMany('u-1', [Object.assign({}, ITEM, { force: 'cloud-wins' })])
    assert.deepStrictEqual(result.results, [{ platform: 'douyin', platformUid: 'uid-9', outcome: 'updated' }])
    const update = pool.calls[1]
    // 只看 SET 子句：credential_digest  legitimately 出现在 WHERE 的 CAS 谓词里
    const setClause = update.text.slice(update.text.indexOf(' SET ') + 5, update.text.indexOf(' WHERE '))
    for (const column of ['credential_ciphertext', 'credential_iv', 'credential_auth_tag', 'encrypted_data_key', 'credential_digest', 'credential_updated_at']) {
      assert.strictEqual(setClause.includes(column), false, `cloud-wins 分支的 SET 里不得出现 ${column}`)
    }
    assert.match(update.text, /display_name = \$4/, '元数据仍要写进去')
    assert.match(update.text, /AND credential_digest = \$11\b/, '元数据分支同样要 CAS 谓词')
  })

  await t.test('CAS 落空后的凭证写绝不重试覆盖：重读 → 如实 conflict，只发一次 UPDATE', async () => {
    const pool = fakePool([
      rows([dbRow({ credential_digest: 'b'.repeat(64) })]),
      rows([]),
      rows([dbRow({ credential_digest: 'c'.repeat(64) })]),
    ])
    const result = await createCloudAccountRepository({ pool }).upsertMany('u-1', [Object.assign({}, ITEM, { force: 'local-wins' })])
    assert.strictEqual(result.results[0].outcome, 'conflict')
    assert.strictEqual(pool.calls.filter((c) => /^\s*UPDATE/i.test(c.text)).length, 1, 'CAS 落空后再写一次会抹掉抢先赢的那台设备的有效凭证')
  })



  await t.test('元数据不同（昵称）也判 updated；pg 的 int8 字符串与 Number 等值可比', async () => {
    const pool = fakePool([rows([dbRow({ followers: '999' })]), rows([{ id: '41' }])])
    const result = await createCloudAccountRepository({ pool }).upsertMany('u-1', [ITEM])
    assert.strictEqual(result.results[0].outcome, 'updated')
    const same = fakePool([rows([dbRow({ followers: 12345 })])])
    const second = await createCloudAccountRepository({ pool: same }).upsertMany('u-1', [ITEM])
    assert.strictEqual(second.results[0].outcome, 'unchanged', 'BIGINT 回读为字符串时不得误判成变更')
  })

  await t.test('逐条独立：中间一条抛错，前后照常写入，且全程无事务包裹', async () => {
    const pool = fakePool([
      rows([]), rows([{ id: '1' }]),
      Object.assign(new Error('connection reset'), { code: 'ACCOUNT_WRITE_FAILED', status: 500 }),
      rows([]), rows([{ id: '3' }]),
    ])
    const items = [
      ITEM,
      Object.assign({}, ITEM, { platformUid: 'uid-bad' }),
      Object.assign({}, ITEM, { platformUid: 'uid-3' }),
    ]
    const result = await createCloudAccountRepository({ pool }).upsertMany('u-1', items)
    assert.deepStrictEqual(result.results.map((entry) => entry.outcome), ['created', 'rejected', 'created'])
    assert.strictEqual(result.results[1].errorCode, 'ACCOUNT_WRITE_FAILED')
    assert.strictEqual(result.results[0].platformUid, 'uid-9')
    assert.strictEqual(result.results[2].platformUid, 'uid-3')
    for (const call of pool.calls) {
      assert.strictEqual(/^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(call.text), false, '逐条写入不得被包在一个事务里')
    }
    // 第二条在其第一条查询上抛错（1 次调用），前后两条各走完 SELECT + INSERT（2 次调用）。
    assert.strictEqual(pool.calls.length, 5)
  })

  await t.test('非语义异常（裸 Error）折叠成 ACCOUNT_WRITE_FAILED，不外泄驱动原文', async () => {
    const pool = fakePool([rows([]), Object.assign(new Error('duplicate key value violates unique constraint "x"'), { code: '23505' })])
    const result = await createCloudAccountRepository({ pool }).upsertMany('u-1', [ITEM])
    assert.strictEqual(result.results[0].outcome, 'rejected')
    assert.match(result.results[0].errorCode, /^[A-Z][A-Z0-9_]{2,63}$/)
  })

  await t.test('INSERT 撞唯一约束（并发竞态）→ 回读后按内容裁决，不重复建行', async () => {
    const raced = fakePool([rows([]), rows([]), rows([dbRow()])])
    const unchanged = await createCloudAccountRepository({ pool: raced }).upsertMany('u-1', [ITEM])
    assert.strictEqual(unchanged.results[0].outcome, 'unchanged')
    assert.strictEqual(raced.calls.length, 3)
    assert.strictEqual(raced.calls.filter((c) => /^\s*UPDATE/i.test(c.text)).length, 0)

    const racedChanged = fakePool([rows([]), rows([]), rows([dbRow({ account_name: '旧名' })]), rows([{ id: '9' }])])
    const updated = await createCloudAccountRepository({ pool: racedChanged }).upsertMany('u-1', [ITEM])
    assert.strictEqual(updated.results[0].outcome, 'updated')
  })

  await t.test('批量入参非法 → 整体拒绝（批量口径由 handlers 负责）', async () => {
    const repository = createCloudAccountRepository({ pool: fakePool([]) })
    for (const bad of [undefined, null, {}, 'x']) {
      await assert.rejects(repository.upsertMany('u-1', bad), (error) => error.code === 'ACCOUNT_BATCH_INVALID')
    }
    await assert.deepStrictEqual(await createCloudAccountRepository({ pool: fakePool([]) }).upsertMany('u-1', []), { results: [] })
  })

  await t.test('条目缺信封/键 → 该条 rejected，不触库', async () => {
    const pool = fakePool([])
    const result = await createCloudAccountRepository({ pool }).upsertMany('u-1', [
      Object.assign({}, ITEM, { credential: null }),
      Object.assign({}, ITEM, { platformUid: '' }),
    ])
    assert.deepStrictEqual(result.results.map((entry) => entry.outcome), ['rejected', 'rejected'])
    assert.strictEqual(result.results[0].errorCode, 'CREDENTIAL_SHAPE_INVALID')
    assert.strictEqual(result.results[1].errorCode, 'ACCOUNT_UID_INVALID')
    assert.strictEqual(pool.calls.length, 0)
  })
})

test('cloud-account-repository：墓碑、凭证槽与全清', async (t) => {
  await t.test('addTombstone 幂等：ON CONFLICT DO NOTHING，重复调用不报错', async () => {
    const first = fakePool([rows([{ id: '1' }])])
    const repository = createCloudAccountRepository({ pool: first })
    assert.deepStrictEqual(await repository.addTombstone('u-1', 'douyin', 'uid-9'), { created: true })
    assert.match(first.calls[0].text, /INSERT INTO cloud_account_tombstones/)
    assert.match(first.calls[0].text, /ON CONFLICT \(user_id, platform, platform_uid\) DO NOTHING/)
    assert.deepStrictEqual(first.calls[0].values, ['u-1', 'douyin', 'uid-9'])
    const second = fakePool([rows([])])
    assert.deepStrictEqual(await createCloudAccountRepository({ pool: second }).addTombstone('u-1', 'douyin', 'uid-9'), { created: false })
    await assert.rejects(repository.addTombstone('u-1', 'douyin', '   '), (error) => error.code === 'ACCOUNT_UID_INVALID')
  })

  await t.test('listTombstones 只按归属过滤并映射 camelCase', async () => {
    const pool = fakePool([rows([{ platform: 'zhihu', platform_uid: 'u-1', deleted_at: new Date('2026-09-20T00:00:00Z') }])])
    const list = await createCloudAccountRepository({ pool }).listTombstones('u-1')
    assert.deepStrictEqual(list, [{ platform: 'zhihu', platformUid: 'u-1', deletedAt: '2026-09-20T00:00:00.000Z' }])
    assertParameterized(pool.calls[0])
    assert.match(pool.calls[0].text, /FROM cloud_account_tombstones WHERE user_id = \$1/)
  })

  await t.test('getCredentials：一次 unnest 取回信封，缺键不发查询', async () => {
    const pool = fakePool([rows([{
      platform: 'douyin',
      platform_uid: 'uid-9',
      credential_iv: Buffer.alloc(12, 1),
      credential_ciphertext: Buffer.from('cipher', 'utf8'),
      credential_auth_tag: Buffer.alloc(16, 2),
      encrypted_data_key: Buffer.alloc(32, 3),
      credential_digest: 'a'.repeat(64),
      credential_updated_at: new Date('2026-09-26T08:00:00Z'),
    }])])
    const repository = createCloudAccountRepository({ pool })
    const found = await repository.getCredentials('u-1', [{ platform: 'douyin', platformUid: 'uid-9' }])
    assert.strictEqual(found.length, 1)
    assert.strictEqual(found[0].platformUid, 'uid-9')
    assert.strictEqual(found[0].credentialEnvelope.alg, 'A256GCM')
    assert.deepStrictEqual(found[0].credentialEnvelope.iv, Buffer.alloc(12, 1))
    assert.strictEqual(found[0].credentialEnvelope.digest, 'a'.repeat(64))
    assert.strictEqual(found[0].credentialUpdatedAt, '2026-09-26T08:00:00.000Z')
    assertParameterized(pool.calls[0])
    assert.match(pool.calls[0].text, /unnest\(\$2::text\[\], \$3::text\[\]\)/)
    assert.deepStrictEqual(pool.calls[0].values, ['u-1', ['douyin'], ['uid-9']])
    assert.strictEqual(pool.calls.length, 1)

    const empty = fakePool([])
    assert.deepStrictEqual(await createCloudAccountRepository({ pool: empty }).getCredentials('u-1', []), [])
    assert.strictEqual(empty.calls.length, 0)
    await assert.rejects(repository.getCredentials('u-1', [{ platform: 'douyin' }]), (error) => error.code === 'ACCOUNT_UID_INVALID')
  })

  await t.test('clearAll：两表全删并回读校验，无残留即成功', async () => {
    const pool = fakePool([
      rows([{ id: '1' }, { id: '2' }], 2),
      rows([{ id: '9' }], 1),
      rows([{ accounts: 0, tombstones: 0 }]),
    ])
    const result = await createCloudAccountRepository({ pool }).clearAll('u-1')
    assert.deepStrictEqual(result, { ok: true, deletedAccounts: 2, deletedTombstones: 1, remaining: 0 })
    assert.match(pool.calls[0].text, /DELETE FROM cloud_accounts WHERE user_id = \$1/)
    assert.match(pool.calls[1].text, /DELETE FROM cloud_account_tombstones WHERE user_id = \$1/)
    assert.match(pool.calls[2].text, /FROM cloud_accounts/)
    pool.calls.forEach(assertParameterized)
  })

  await t.test('clearAll 有残留 → CLOUD_DISCONNECT_PARTIAL 语义（客户端必须保留入口）', async () => {
    const pool = fakePool([
      rows([{ id: '1' }], 1),
      rows([], 0),
      rows([{ accounts: 2, tombstones: 1 }]),
    ])
    const result = await createCloudAccountRepository({ pool }).clearAll('u-1')
    assert.deepStrictEqual(result, {
      ok: false,
      errorCode: 'CLOUD_DISCONNECT_PARTIAL',
      deletedAccounts: 1,
      deletedTombstones: 0,
      remaining: 3,
    })
  })

  await t.test('clearAll 删除语句抛错 → 原样上抛语义码，交由 handlers 出 500', async () => {
    const pool = fakePool([Object.assign(new Error('deadlock detected'), { code: 'CLOUD_DISCONNECT_PARTIAL', status: 500 })])
    await assert.rejects(
      createCloudAccountRepository({ pool }).clearAll('u-1'),
      (error) => error.code === 'CLOUD_DISCONNECT_PARTIAL' && error.status === 500,
    )
  })

  await t.test('rowCount 缺失时按 RETURNING 行数回退（fake client 不填 rowCount）', async () => {
    const pool = fakePool([
      { rows: [{ id: '1' }, { id: '2' }, { id: '3' }] },
      { rows: [] },
      rows([{ accounts: 0, tombstones: 0 }]),
    ])
    const result = await createCloudAccountRepository({ pool }).clearAll('u-1')
    assert.strictEqual(result.deletedAccounts, 3)
    assert.strictEqual(result.deletedTombstones, 0)
    assert.strictEqual(result.ok, true)
  })
})
