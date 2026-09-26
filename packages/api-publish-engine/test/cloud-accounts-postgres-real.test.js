'use strict'
/**
 * 账号云镜像 —— 真实 PostgreSQL 回归（CI job: QG Business API Postgres）
 *
 * 为什么单独成文件：本包既有的库层测试全部跑在手写 fake client 上（见
 * test/postgres-migrations.test.js、test/member-commerce-migrations.test.js）。
 * fake client 只记录 SQL 文本，**不执行** SQL，所以它对下面这些失败完全免疫：
 *   * 列名/类型拼错（`credential_auth_tag` vs `credential_tag`）
 *   * `ON CONFLICT` 目标列与真库唯一约束不一致（真库直接 42P10）
 *   * 迁移文件的 DDL 语法本身错（fake 只是把字符串塞进 query 记录）
 *   * BYTEA 与 Buffer 往返、TIMESTAMPTZ 与 Date 往返
 *   * 外键方向与 `ON DELETE CASCADE` 是否真的级联
 * 那些只有真库能证伪。**本文件自己就是这条纪律的第一批受害者**：夹具里的
 * `identity_users (id, subject, ...)` 与真库的 `(auth_provider, auth_subject)` 不符、
 * 以及忘了给 `createCloudAccountServices` 传 `kms`，都只有真库能报出来。
 * CI 默认全 windows-latest（不支持 services: 容器），所以这个文件在没有
 * BUSINESS_DATABASE_URL 时**整体跳过**——跳过不是通过，PR 与 .quality-gates.md
 * 必须如实记录它是否在真库跑过。
 *
 * 反互锁纪律：凡「断言某坏东西不存在」的用例（明文、越删），必须先断言那个好东西
 * 确实在（写入成功、行数对得上）。否则一次上游写失败会让整条锁空跑成绿 —— 第一轮
 * CI 里 7 条中 6 条就是这么互相伪装过去的。
 */
const test = require('node:test').test
const assert = require('node:assert/strict')
const path = require('path')

const DATABASE_URL = String(process.env.BUSINESS_DATABASE_URL || '').trim()
const RUN = DATABASE_URL ? test : test.skip

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations/postgresql')

// 仅测试用固定密钥（32 字节 hex，与 `MP_CLOUD_KMS_LOCAL_KEY` 同形）。真部署必须由云 KMS 提供，
// 见 docs/adr/0003；这里显式注入而不是改 process.env，避免污染同 job 内的其它用例。
const TEST_KMS_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

const USER_A = 'user-real-a'
const USER_B = 'user-real-b'

/** 构造一条合法上行账号（元数据 + 明文凭证，由服务端负责加密）。 */
function account(platform, platformUid, overrides) {
  return Object.assign({
    platform,
    platformUid,
    displayName: '测试账号' + platformUid,
    accountName: '昵称' + platformUid,
    avatar: 'https://cdn.example.com/a.png',
    followers: 100,
    isActive: true,
    credential: {
      cookies: [
        { name: 'sessionid', value: 'v-' + platformUid, domain: '.example.com', path: '/', secure: true },
        { name: 'uid', value: platformUid, domain: '.example.com', path: '/', secure: true },
      ],
      localStorage: { user_name: '昵称' + platformUid },
      indexedDB: {},
    },
  }, overrides || {})
}

/**
 * 父行必须是**真表真列**：`identity_users` 的唯一键是 (auth_provider, auth_subject)，
 * 而 `cloud_accounts.user_id` 有 FK —— 没有父行，写云账号会直接 23503。
 * 用 auth_provider='test' 与真实身份隔离，且按 id 幂等。
 */
async function ensureIdentityUser(pool, id) {
  await pool.query(
    `INSERT INTO identity_users (id, auth_provider, auth_subject, created_at, updated_at)
     VALUES ($1, 'test', $2, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`, [id, 'sub-' + id])
}

/** 建父行并登记到清理清单（清单按引用共享，用例里 push 的行收尾一样会被删）。 */
async function trackUser(pool, id, userIds) {
  await ensureIdentityUser(pool, id)
  userIds.push(id)
  return id
}

async function dropIdentityUser(pool, id) {
  // 级联会一并清掉该用户的云账号与墓碑，所以这是本文件唯一的收尾清理
  await pool.query('DELETE FROM identity_users WHERE id = $1', [id])
}

async function withServices(run, options = {}) {
  const userIds = options.userIds || []
  const { Client, Pool } = require('pg')
  const { runMigrations } = require('../src/auth/postgres-migrations')
  const { createCloudAccountServices, createLocalKms } = require('../src/cloud-accounts')

  const bootstrap = new Client({ connectionString: DATABASE_URL })
  await bootstrap.connect()
  try {
    const migration = await runMigrations({ client: bootstrap, directory: MIGRATIONS_DIR })
    // 迁移必须真的把 005 落到库里；applied 或 skipped（本 job 内已跑过）都算存在
    const known = migration.applied.concat(migration.skipped)
    assert.ok(known.includes('005_cloud_accounts.sql'),
      '005_cloud_accounts.sql 未出现在 ledger：' + JSON.stringify(migration))
  } finally {
    await bootstrap.end().catch(() => {})
  }

  const pool = new Pool({ connectionString: DATABASE_URL, max: 4 })
  for (const id of userIds) await ensureIdentityUser(pool, id)
  // 必须显式交 kms：`createEnvelopeCrypto` 没有 kms 时首次使用即抛 KMS_UNAVAILABLE，
  // 那是 fail closed 的正确形态，但会让本文件的每一条 PUT 变成 503。
  const services = createCloudAccountServices({ pool, kms: createLocalKms({ key: TEST_KMS_KEY }) })
  try {
    return await run(services, pool)
  } finally {
    for (const id of userIds) await dropIdentityUser(pool, id).catch(() => {})
    await pool.end().catch(() => {})
  }
}

/** 直接走 HTTP 处理层，避免把断言建立在 repository 私有方法名上。 */
async function call(services, method, url, body, authUserId) {
  let captured = { status: null, body: null }
  const res = await services.handle({
    method,
    url,
    req: { method, url, headers: {} },
    auth: { businessUser: { id: authUserId || USER_A } },
    bodyParser: () => Promise.resolve(body === undefined ? null : body),
    json: (status, out) => { captured = { status, body: out } },
    now: () => Date.now(),
  })
  return res || captured
}

/**
 * 取 `data` 内层，并**先把状态钉成 200**。
 * 必须经这里：出线是 `{code:0,data:{...}}` 信封（PRD §7.1–§7.4），
 * 直接 `res.body.results` 会读到 undefined —— 而 undefined 在 `Array.isArray` 兜底后
 * 长得跟「云端什么都没有」一模一样。
 */
function dataOf(res, label) {
  assert.equal(res.status, 200, `${label} 未成功：${JSON.stringify(res.body)}`)
  assert.ok(res.body && typeof res.body.data === 'object' && res.body.data !== null,
    `${label} 缺 data 信封：${JSON.stringify(res.body)}`)
  return res.body.data
}

async function countRows(pool, sql, params) {
  const r = await pool.query(sql, params)
  return Number(r.rows[0].n)
}

RUN('真库：005 迁移建出的列与仓储 SQL 对得上（BYTEA/TIMESTAMPTZ 往返）', async () => {
  await withServices(async (services, pool) => {
    const columns = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'cloud_accounts' ORDER BY ordinal_position`)
    const names = columns.rows.map((r) => r.column_name)
    for (const required of [
      'user_id', 'platform', 'platform_uid', 'display_name', 'account_name',
      'credential_ciphertext', 'credential_iv', 'credential_auth_tag',
      'encrypted_data_key', 'credential_digest', 'credential_updated_at',
    ]) {
      assert.ok(names.includes(required), 'cloud_accounts 缺少列 ' + required + '，实有 ' + names.join(','))
    }
    const bytea = columns.rows.filter((r) => r.data_type === 'bytea').map((r) => r.column_name)
    for (const field of ['credential_ciphertext', 'credential_iv', 'credential_auth_tag', 'encrypted_data_key']) {
      assert.ok(bytea.includes(field), field + ' 必须是 bytea，实为 ' + JSON.stringify(columns.rows.find((r) => r.column_name === field)))
    }

    const put = await call(services, 'PUT', '/api/v1/me/accounts',
      { accounts: [account('douyin', 'real-uid-1')] }, USER_A)
    assert.deepStrictEqual(dataOf(put, 'PUT').results,
      [{ platform: 'douyin', platformUid: 'real-uid-1', outcome: 'created' }])

    const rows = await pool.query(
      `SELECT credential_ciphertext, credential_iv, credential_auth_tag, encrypted_data_key, credential_digest
         FROM cloud_accounts WHERE user_id = $1 AND platform_uid = $2`, [USER_A, 'real-uid-1'])
    assert.equal(rows.rows.length, 1)
    const row = rows.rows[0]
    // pg 把 bytea 解成 Buffer：能拿到 Buffer 就证明 DDL 类型与写入编码一致
    for (const field of ['credential_ciphertext', 'credential_iv', 'credential_auth_tag', 'encrypted_data_key']) {
      assert.ok(Buffer.isBuffer(row[field]) && row[field].length > 0, field + ' 未往返成非空 Buffer，实得 ' + require('util').inspect(row[field]))
    }
    assert.match(row.credential_digest, /^[0-9a-f]{64}$/)
  }, { userIds: [USER_A] })
})

RUN('真库：合并键唯一约束生效，同 (platform, platform_uid) 不产生第二行', async () => {
  await withServices(async (services, pool) => {
    const first = await call(services, 'PUT', '/api/v1/me/accounts',
      { accounts: [account('douyin', 'real-uid-dup')] }, USER_A)
    assert.equal(dataOf(first, '首次 PUT').results[0].outcome, 'created')

    const second = await call(services, 'PUT', '/api/v1/me/accounts',
      { accounts: [account('douyin', 'real-uid-dup', { followers: 999 })] }, USER_A)
    assert.equal(dataOf(second, '变更 PUT').results[0].outcome, 'updated')

    const dup = await countRows(pool,
      `SELECT count(*)::int AS n FROM cloud_accounts WHERE user_id = $1 AND platform = 'douyin' AND platform_uid = 'real-uid-dup'`,
      [USER_A])
    assert.equal(dup, 1, '唯一约束没拦住，出现重复行')

    // 同 uid 再送完全相同的内容 → unchanged，且不得刷新 updated_at
    const before = await pool.query(
      `SELECT updated_at FROM cloud_accounts WHERE user_id = $1 AND platform_uid = 'real-uid-dup'`, [USER_A])
    const third = await call(services, 'PUT', '/api/v1/me/accounts',
      { accounts: [account('douyin', 'real-uid-dup', { followers: 999 })] }, USER_A)
    assert.equal(dataOf(third, '重复 PUT').results[0].outcome, 'unchanged')
    const after = await pool.query(
      `SELECT updated_at FROM cloud_accounts WHERE user_id = $1 AND platform_uid = 'real-uid-dup'`, [USER_A])
    assert.equal(before.rows[0].updated_at.getTime(), after.rows[0].updated_at.getTime(),
      'unchanged 仍刷新了 updated_at（会把"没动过"的账号伪装成刚同步过）')
  }, { userIds: [USER_A] })
})

RUN('真库：avatar 的 https:// 前缀 CHECK 在存储层真的拦得住', async () => {
  const userIds = []
  await withServices(async (services, pool) => {
    // 绕过应用层直接写库：这道锁存在的理由就是「任何绕过 handlers 的写入」，
    // 只测 validate-account.js 的 https 校验等于没测存储层。
    const surrogate = await trackUser(pool, 'user-real-avatar-' + process.pid + '-' + Date.now(), userIds)

    const columns = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = 'cloud_accounts' AND column_name = 'credential_digest'`)
    assert.equal(columns.rows.length, 1, 'cloud_accounts 表结构与本用例假设不符，先修表再谈 CHECK')

    async function tryInsert(platformUid, avatarValue) {
      try {
        await pool.query(
          `INSERT INTO cloud_accounts
             (user_id, platform, platform_uid, display_name, avatar,
              credential_ciphertext, credential_iv, credential_auth_tag, encrypted_data_key,
              credential_digest, credential_updated_at, metadata_updated_at)
           VALUES ($1, 'douyin', $2, '头像用例', $3,
              '\\x01'::bytea, '\\x02'::bytea, '\\x03'::bytea, '\\x04'::bytea,
              $5, NOW(), NOW())`,
          [surrogate, platformUid, avatarValue, null, 'f'.repeat(64)])
        return null
      } catch (error) {
        return error
      }
    }

    for (const [label, value] of [
      ['file:', 'file:///C:/Windows/win.ini'],
      ['javascript:', 'javascript:alert(1)'],
      ['data:', 'data:text/html,<script>alert(1)</script>'],
      ['http:', 'http://cdn.example.com/a.png'],
      ['相对路径', 'cdn.example.com/a.png'],
    ]) {
      const error = await tryInsert('avatar-bad-' + label, value)
      assert.ok(error, `${label} 形态的 avatar 必须被 CHECK 拦住：${value}`)
      assert.equal(error.code, '23514', `${label} 应当是 check_violation(23514)，实得 ${error.code}: ${error.message}`)
    }

    // 正例：https:// 与 NULL 都必须放行（NULL 是「本机没有头像」的正常形态，桌面端恒上报空串 → 存 NULL）。
    assert.equal(await tryInsert('avatar-ok-https', 'https://cdn.example.com/a.png'), null)
    assert.equal(await tryInsert('avatar-ok-null', null), null)
    // 反证：正例确实写进去了，否则「没报错」可能只是外键先拦住了（那也返回 error，但形态不同）
    assert.equal(await countRows(pool,
      `SELECT count(*)::int AS n FROM cloud_accounts WHERE user_id = $1`, [surrogate]), 2,
      '正例没落库：这道 CHECK 用例的空跑守卫')

    // 长度上限仍由同一条 CHECK 兜住（>1024 必须拒）。
    const tooLong = await tryInsert('avatar-ok-long', 'https://cdn.example.com/' + 'x'.repeat(1024))
    assert.ok(tooLong && tooLong.code === '23514', 'avatar 超长度必须仍被拒')
  }, { userIds })
})

RUN('真库：下行取凭证由服务端解密，且库内取证不含任何 cookie 明文子串', async () => {
  await withServices(async (services, pool) => {
    const secret = 'super-secret-session-value'
    await call(services, 'PUT', '/api/v1/me/accounts',
      { accounts: [account('bilibili', 'real-uid-secret', {
        credential: { cookies: [{ name: 'SESSDATA', value: secret, domain: '.bilibili.com', path: '/' }], localStorage: {}, indexedDB: {} },
      })] }, USER_A)

    const dump = await pool.query(
      `SELECT encode(credential_ciphertext,'escape') AS c, encode(credential_iv,'escape') AS i,
              encode(encrypted_data_key,'escape') AS k, credential_digest AS d
         FROM cloud_accounts WHERE user_id = $1`, [USER_A])
    // 前置：确实写进去了一行，否则「没有明文」是空跑出来的绿
    assert.equal(dump.rows.length, 1, '前置失败：库里没有该行，明文断言无从谈起')
    const all = dump.rows.map((r) => [r.c, r.i, r.k, r.d].join('|')).join('\n')
    assert.ok(!all.includes(secret), '库内出现明文 cookie —— 信封加密没生效')
    assert.ok(!all.includes('SESSDATA'), '库内出现 cookie 名，凭证 JSON 未加密')

    // 同一份凭证必须能被服务端**解出来**（ADR-0003：换设备免扫码的前提）。
    // 只在「密文取不出明文」这一侧断言，会把「根本解不开」也判成加密成功。
    const fetched = await call(services, 'POST', '/api/v1/me/accounts/sync',
      { keys: [{ platform: 'bilibili', platformUid: 'real-uid-secret' }] }, USER_A)
    const [entry] = dataOf(fetched, 'POST /sync').credentials
    assert.equal(entry.credential.cookies[0].value, secret, '服务端解不出自己加密的凭证 = 恢复路径全断')
    assert.equal(entry.credentialEnvelope, undefined, '不得把密文信封再往下发给没有 KMS 访问权的客户端')
  }, { userIds: [USER_A] })
})

RUN('真库：按用户隔离（A 读不到 B 的任何行）', async () => {
  await withServices(async (services, pool) => {
    const putA = await call(services, 'PUT', '/api/v1/me/accounts', { accounts: [account('douyin', 'real-uid-a')] }, USER_A)
    const putB = await call(services, 'PUT', '/api/v1/me/accounts',
      { accounts: [account('douyin', 'real-uid-b'), account('zhihu', 'real-uid-b2')] }, USER_B)
    // 前置：两边都真的写进去了，否则「A 只看到自己的」会因为「谁都看不到任何东西」而假绿
    assert.equal(dataOf(putA, 'A 上行').results[0].outcome, 'created')
    assert.equal(dataOf(putB, 'B 上行').results.length, 2)
    assert.equal(await countRows(pool, `SELECT count(*)::int AS n FROM cloud_accounts WHERE user_id = $1`, [USER_B]), 2)

    const asA = await call(services, 'GET', '/api/v1/me/accounts?view=full', undefined, USER_A)
    const fullA = dataOf(asA, 'A 取 full')
    assert.deepEqual(fullA.accounts.map((a) => a.platformUid), ['real-uid-a'], 'A 读到了别人的账号')
    assert.equal(fullA.accounts[0].credential, undefined, 'full 视图不得回传凭证内容')

    const asB = await call(services, 'GET', '/api/v1/me/accounts?view=digest', undefined, USER_B)
    assert.equal(dataOf(asB, 'B 取 digest').total, 2, 'B 的计数被 A 污染')
  }, { userIds: [USER_A, USER_B] })
})

RUN('真库：外键 ON DELETE CASCADE 随 identity_users 级联清掉云账号', async () => {
  const userIds = []
  await withServices(async (services, pool) => {
    // 建一个真实的父用户，云账号挂在它上面；删父用户必须级联删云账号，
    // 否则注销用户后其凭证会永久滞留在库里（合规删除做不到的形态）
    const surrogate = await trackUser(pool, 'user-real-cascade-' + process.pid + '-' + Date.now(), userIds)
    const put = await call(services, 'PUT', '/api/v1/me/accounts', { accounts: [account('douyin', 'real-uid-cascade')] }, surrogate)
    assert.equal(dataOf(put, '挂到真实父行的上行').results[0].outcome, 'created',
      '云账号未能挂到真实 identity_users 行（FK 目标或父表列与本测试假设不一致）')
    await dropIdentityUser(pool, surrogate)
    assert.equal(await countRows(pool, `SELECT count(*)::int AS n FROM cloud_accounts WHERE user_id = $1`, [surrogate]), 0,
      '删父用户后云账号残留 —— ON DELETE CASCADE 没生效')
  }, { userIds })
})

RUN('真库：断开云端清空该用户账号与墓碑，且不影响其他用户', async () => {
  await withServices(async (services, pool) => {
    const putA = await call(services, 'PUT', '/api/v1/me/accounts', { accounts: [account('douyin', 'real-uid-d1')] }, USER_A)
    const putB = await call(services, 'PUT', '/api/v1/me/accounts', { accounts: [account('toutiao', 'real-uid-d2')] }, USER_B)
    assert.equal(dataOf(putA, 'A 上行').results[0].outcome, 'created')
    assert.equal(dataOf(putB, 'B 上行').results[0].outcome, 'created')
    await pool.query(
      `INSERT INTO cloud_account_tombstones (user_id, platform, platform_uid) VALUES ($1, 'weibo', 'real-uid-t1')`, [USER_A])

    const disconnected = dataOf(await call(services, 'POST', '/api/v1/me/accounts/disconnect', { confirm: 'cloud' }, USER_A), '断开云端')
    assert.equal(disconnected.deletedAccounts, 1, JSON.stringify(disconnected))
    assert.equal(disconnected.deletedTombstones, 1, JSON.stringify(disconnected))
    assert.equal(await countRows(pool, `SELECT count(*)::int AS n FROM cloud_accounts WHERE user_id = $1`, [USER_A]), 0,
      '断开后 A 的云端账号未清空')
    assert.equal(await countRows(pool, `SELECT count(*)::int AS n FROM cloud_accounts WHERE user_id = $1`, [USER_B]), 1,
      '断开越界删了 B 的账号')
  }, { userIds: [USER_A, USER_B] })
})
