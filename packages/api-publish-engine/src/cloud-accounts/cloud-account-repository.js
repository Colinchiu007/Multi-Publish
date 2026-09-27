'use strict'
/**
 * cloud-account-repository.js — 云端账号镜像的数据访问层（PRD §6.1 / §7）。
 *
 * 三条硬约束：
 *   1) **归属只能由入参 userId 决定**，且每条 SQL 都带 `user_id = $1`（PRD 验收标准 9：
 *      A 身份读不到 B 身份的任何记录）。没有任何「按 id 直取」的旁路方法。
 *   2) **全部参数化**，用户输入（platform / uid / 昵称 / base64 信封）一律走 `$n` 占位符，
 *      永不字符串拼接（test 里有逐条断言）。
 *   3) `upsertMany` **逐条独立裁决**：PRD §7.2「一条失败 MUST NOT 整批回滚」，
 *      所以这里刻意不开事务、不 `pool.connect()`，一条一个语句序列；
 *      幂等靠唯一约束 `(user_id, platform, platform_uid)` + 内容比较，
 *      `unchanged` 一条写请求都不发（AGENTS.md「无定论不得发冗余写」同源纪律）。
 *
 * pg 会把 BIGINT 以字符串回读（followers: '12345'），比较一律走本文件的归一化器，
 * 否则每轮同步都会把没变的账号判成 `updated`，白刷一次 updated_at。
 */

const { safeErrorCode } = require('../auth/safe-error-code')
const { ENVELOPE_ALG, ENVELOPE_VERSION } = require('./envelope-crypto')
const { accountError, isPlainObject, MAX_UID_LENGTH, CONTROL_CHARS, MAX_BATCH_SIZE } = require('./validate-account')
// 写裁决（能不能写、写哪几列、谁的凭证更新）与它需要的行值归一化器都在 upsert-decision.js：
// 判点只允许有一处，且必须能被逐分支直接断言（见该文件头注释）。
const { bool, credentialFreshness, decideWrite, intText, isoTime, sameRecord, text, writeModeOf, WRITE_MODE_CREDENTIAL } = require('./upsert-decision')

const CLOUD_ACCOUNT_COLUMNS = `id, user_id, platform, platform_uid, display_name, account_name, avatar, followers,
  is_active, credential_digest, last_reported_status, credential_updated_at, metadata_updated_at,
  last_sync_device_label, created_at, updated_at`

/** 摘要：分组计数 + 该组最后变更时刻，一次拿全（total 由调用方求和，不再发第二条 COUNT）。 */
const SELECT_DIGEST = `SELECT platform, COUNT(*)::int AS count, MAX(updated_at) AS updated_at
   FROM cloud_accounts WHERE user_id = $1
   GROUP BY platform
   ORDER BY count DESC, platform ASC`

const SELECT_TOMBSTONE_COUNT = 'SELECT COUNT(*)::int AS count FROM cloud_account_tombstones WHERE user_id = $1'

/** 合并视图：刻意不取 credential_ciphertext / credential_iv / credential_auth_tag / encrypted_data_key。 */
const SELECT_FULL = `SELECT ${CLOUD_ACCOUNT_COLUMNS}
   FROM cloud_accounts WHERE user_id = $1
   ORDER BY platform ASC, platform_uid ASC`

const SELECT_TOMBSTONES = `SELECT platform, platform_uid, deleted_at
   FROM cloud_account_tombstones WHERE user_id = $1
   ORDER BY platform ASC, platform_uid ASC`

const SELECT_ROW = `SELECT ${CLOUD_ACCOUNT_COLUMNS}
   FROM cloud_accounts WHERE user_id = $1 AND platform = $2 AND platform_uid = $3`

const SELECT_CREDENTIALS = `SELECT platform, platform_uid, credential_iv, credential_ciphertext,
    credential_auth_tag, encrypted_data_key, credential_digest, credential_updated_at
   FROM cloud_accounts
   WHERE user_id = $1
     AND (platform, platform_uid) IN (SELECT p, u FROM unnest($2::text[], $3::text[]) AS t(p, u))
   ORDER BY platform ASC, platform_uid ASC`

/**
 * `last_reported_status` **不在写入列里**（PRD §6.1：它是只读展示快照，恢复流程不读它）。
 * 客户端侧由白名单挡掉（validate-account.js），这里连列都不出现是第二道：一旦写库里出现
 * 「服务端自己派生的快照」，客户端上报值把它抹成 NULL 就是数据破坏，所以两侧都不给通路。
 */
const INSERT_ACCOUNT = `INSERT INTO cloud_accounts
    (user_id, platform, platform_uid, display_name, account_name, avatar, followers, is_active,
     credential_ciphertext, credential_iv, credential_auth_tag, encrypted_data_key, credential_digest,
     credential_updated_at, metadata_updated_at, last_sync_device_label, created_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz, $15::timestamptz, $16,
     COALESCE($17::timestamptz, NOW()))
   ON CONFLICT (user_id, platform, platform_uid) DO NOTHING
   RETURNING id`

/**
 * 凭证覆盖写：`updated_at = NOW()` 只出现在真正写库的分支，`unchanged` 走不到这里。
 *
 * 末尾的 `$17` 是**乐观并发（CAS）谓词**，不是可选装饰：读-判-写之间没有行锁（本仓储刻意
 * 不开事务，见文件头约束 3），两个设备同时 PUT 同一合并键会双双报 `updated` 而互相覆盖
 * （lost update）。加谓词后，后写者影响 0 行 → 重读 → 发现 digest 已变 → 如实报 `conflict`，
 * 交给本机实测裁决。选 CAS 而不是 `SELECT ... FOR UPDATE`：后者要求 `pool.connect()` + 显式
 * 事务，会把「逐条独立裁决、一条失败不整批回滚」变成持锁的长事务，并让整条批量串行化。
 */
const UPDATE_ACCOUNT = `UPDATE cloud_accounts SET
     display_name = $4, account_name = $5, avatar = $6, followers = $7, is_active = $8,
     credential_ciphertext = $9, credential_iv = $10, credential_auth_tag = $11,
     encrypted_data_key = $12, credential_digest = $13,
     credential_updated_at = $14::timestamptz, metadata_updated_at = $15::timestamptz,
     last_sync_device_label = $16, updated_at = NOW()
   WHERE user_id = $1 AND platform = $2 AND platform_uid = $3
     AND credential_digest = $17
   RETURNING id`

/**
 * 元数据只写分支：凭证四列（ciphertext / iv / auth_tag / encrypted_data_key）与 digest
 * **不出现在 SET 里**，`credential_updated_at` 也不重贴戳。
 * 两个用途：① digest 已一致、只有昵称/头像/粉丝变了的常规更新；② `force: 'local-wins'`
 * ——本机实测裁决完但胜出的只是「本机继续用这份凭证」，云端那一份没有资格被未验证的证据覆盖
 * （单向证据规则：没拿到新证据不是反证）。
 */
const UPDATE_ACCOUNT_METADATA = `UPDATE cloud_accounts SET
     display_name = $4, account_name = $5, avatar = $6, followers = $7, is_active = $8,
     metadata_updated_at = $9::timestamptz, last_sync_device_label = $10, updated_at = NOW()
   WHERE user_id = $1 AND platform = $2 AND platform_uid = $3
     AND credential_digest = $11
   RETURNING id`

const INSERT_TOMBSTONE = `INSERT INTO cloud_account_tombstones (user_id, platform, platform_uid)
   VALUES ($1, $2, $3)
   ON CONFLICT (user_id, platform, platform_uid) DO NOTHING
   RETURNING id`

const DELETE_ACCOUNTS = 'DELETE FROM cloud_accounts WHERE user_id = $1 RETURNING id'
const DELETE_TOMBSTONES = 'DELETE FROM cloud_account_tombstones WHERE user_id = $1 RETURNING id'

/** 删完必须回读：PRD §7.4 要求把「没清干净」如实上报，不能拿 DELETE 的返回值当已清空。 */
const SELECT_RESIDUAL = `SELECT
    (SELECT COUNT(*) FROM cloud_accounts WHERE user_id = $1) AS accounts,
    (SELECT COUNT(*) FROM cloud_account_tombstones WHERE user_id = $1) AS tombstones`

function countAffected(result) {
  if (!result) return 0
  if (Number.isFinite(result.rowCount)) return result.rowCount
  return Array.isArray(result.rows) ? result.rows.length : 0
}

function toCount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function assertUserId(userId) {
  if (typeof userId !== 'string' || !userId.trim() || CONTROL_CHARS.test(userId)) {
    throw accountError('BUSINESS_USER_REQUIRED', 503)
  }
  return userId.trim()
}

function assertKey(platform, platformUid, label) {
  if (typeof platformUid !== 'string' || !platformUid.trim() || platformUid.trim().length > MAX_UID_LENGTH
    || CONTROL_CHARS.test(platformUid)) {
    throw accountError('ACCOUNT_UID_INVALID', 400, label)
  }
  if (typeof platform !== 'string' || !platform.trim() || CONTROL_CHARS.test(platform)) {
    throw accountError('ACCOUNT_PLATFORM_UNSUPPORTED', 400, label)
  }
  return { platform: platform.trim(), platformUid: platformUid.trim() }
}

/**
 * 写库前的最低限度自校验：归属、合并键、信封四元组与摘要。
 * 完整业务校验在 validate-account.js（handlers 已跑过一遍）；这里再拦一次是防「绕过 handlers
 * 直接 require repository」把半条记录写进真源——repository 是最后一道门。
 */
function assertWritable(userId, item) {
  assertUserId(userId)
  if (!isPlainObject(item)) throw accountError('CREDENTIAL_SHAPE_INVALID', 400)
  const key = assertKey(item.platform, item.platformUid)
  const envelope = item.credential
  if (!isPlainObject(envelope)) throw accountError('CREDENTIAL_SHAPE_INVALID', 400)
  for (const field of ['iv', 'ciphertext', 'tag', 'encryptedDataKey']) {
    if (!Buffer.isBuffer(envelope[field]) || envelope[field].length === 0) {
      throw accountError('CREDENTIAL_SHAPE_INVALID', 400, field)
    }
  }
  if (typeof item.credentialDigest !== 'string' || !item.credentialDigest) {
    throw accountError('CREDENTIAL_SHAPE_INVALID', 400)
  }
  if (!item.metadataUpdatedAt || !item.credentialUpdatedAt) throw accountError('ACCOUNT_TIMESTAMP_INVALID', 400)
  return {
    ...key,
    displayName: text(item.displayName),
    accountName: text(item.accountName),
    avatar: text(item.avatar),
    followers: intText(item.followers),
    isActive: item.isActive === undefined ? true : Boolean(item.isActive),
    credentialDigest: item.credentialDigest,
    credentialUpdatedAt: item.credentialUpdatedAt,
    metadataUpdatedAt: item.metadataUpdatedAt,
    createdAt: item.createdAt || null,
    lastSyncDeviceLabel: text(item.lastSyncDeviceLabel),
    // 冲突裁决的两项透传：force 是「本机已实测裁决完」的凭据；reportedCredentialUpdatedAt 只用于
    // 回传 credentialFreshness，绝不作为存储值（存储侧时间戳由服务端盖戳）。
    force: item.force === 'local-wins' || item.force === 'cloud-wins' ? item.force : null,
    reportedCredentialUpdatedAt: item.reportedCredentialUpdatedAt || null,
    envelope,
  }
}

function mapAccount(row) {
  return {
    platform: row.platform,
    platformUid: row.platform_uid,
    displayName: text(row.display_name),
    accountName: text(row.account_name),
    avatar: text(row.avatar),
    followers: intText(row.followers) === null ? null : Number(row.followers),
    isActive: bool(row.is_active),
    credentialDigest: text(row.credential_digest),
    credentialUpdatedAt: isoTime(row.credential_updated_at),
    metadataUpdatedAt: isoTime(row.metadata_updated_at),
    lastReportedStatus: text(row.last_reported_status),
  }
}

function mapTombstone(row) {
  return { platform: row.platform, platformUid: row.platform_uid, deletedAt: isoTime(row.deleted_at) }
}

function insertParams(userId, record) {
  return [
    userId, record.platform, record.platformUid, record.displayName, record.accountName, record.avatar,
    record.followers, record.isActive,
    record.envelope.ciphertext, record.envelope.iv, record.envelope.tag, record.envelope.encryptedDataKey,
    record.credentialDigest, record.credentialUpdatedAt, record.metadataUpdatedAt,
    record.lastSyncDeviceLabel, record.createdAt,
  ]
}

/** 凭证覆盖写（`force: 'cloud-wins'`）：末位是 CAS 谓词，取本次读到的 digest。 */
function updateParams(userId, record) {
  return [
    userId, record.platform, record.platformUid, record.displayName, record.accountName, record.avatar,
    record.followers, record.isActive,
    record.envelope.ciphertext, record.envelope.iv, record.envelope.tag, record.envelope.encryptedDataKey,
    record.credentialDigest, record.credentialUpdatedAt, record.metadataUpdatedAt,
    record.lastSyncDeviceLabel,
    casDigest(record),
  ]
}

/** 元数据只写（digest 已一致的常规更新，或 `force: 'local-wins'`）：不含任何凭证列。 */
function updateMetadataParams(userId, record) {
  return [
    userId, record.platform, record.platformUid, record.displayName, record.accountName, record.avatar,
    record.followers, record.isActive, record.metadataUpdatedAt, record.lastSyncDeviceLabel,
    casDigest(record),
  ]
}

/** CAS 谓词取值：缺失即编程错误，宁可直接红，也不退化成「无条件覆盖」。 */
function casDigest(record) {
  const expected = record.expectedCredentialDigest
  if (typeof expected !== 'string' || !expected) {
    throw accountError('ACCOUNT_WRITE_FAILED', 500, 'missing CAS digest')
  }
  return expected
}

function createCloudAccountRepository(options = {}) {
  const pool = options.pool
  if (!isPlainObject(pool) || typeof pool.query !== 'function') {
    throw new TypeError('createCloudAccountRepository 需要 PostgreSQL 连接池（pool.query）')
  }
  const query = (sql, params) => pool.query(sql, params)

  async function readRow(userId, platform, platformUid) {
    const result = await query(SELECT_ROW, [userId, platform, platformUid])
    return (result && result.rows && result.rows[0]) || null
  }

  async function writeInsert(userId, record) {
    const result = await query(INSERT_ACCOUNT, insertParams(userId, record))
    return countAffected(result) > 0 || Boolean(result && result.rows && result.rows[0])
  }

  async function writeUpdate(userId, record) {
    const result = await query(UPDATE_ACCOUNT, updateParams(userId, record))
    return countAffected(result) > 0 || Boolean(result && result.rows && result.rows[0])
  }

  /** 元数据只写：语句里连凭证列名都不出现，误写凭证的可能性从形状上被排除。 */
  async function writeMetadata(userId, record) {
    const result = await query(UPDATE_ACCOUNT_METADATA, updateMetadataParams(userId, record))
    return countAffected(result) > 0 || Boolean(result && result.rows && result.rows[0])
  }

  /**
   * 一条一个独立裁决序列；任何一步抛错只影响这一条。
   *
   * 四类写分支（PRD §5.5 / §7.2，A 设备与 B 设备的差别只在有没有 `force` 这份本机实测凭据）：
   *   * digest 相同、元数据不同 → 元数据只写（凭证列与 `credential_updated_at` 一律不动）。
   *   * digest 不同 + `force: 'cloud-wins'` → 凭证覆盖写（云端那一份换成裁决胜出的那一份）。
   *   * digest 不同 + `force: 'local-wins'` → **只写元数据，凭证四列绝不覆盖**。本机的结论是
   *     「我这台继续用我这份」，而其中「两份检测都无定论」那一支并没有证明云端凭证无效；
   *     「没拿到新证据」不是反证（AGENTS.md 单向证据规则），所以这一支无权抹掉云端那半份。
   *   * digest 不同 + 没有 force → 一个字节都不写，回 `conflict` + `credentialFreshness`。
   * 每一次写都带 `credential_digest = 本次读到的值` 的 CAS 谓词；落空即重读重判，绝不盲写。
   */
  async function upsertOne(userId, rawItem) {
    const record = assertWritable(userId, rawItem)
    const existing = await readRow(userId, record.platform, record.platformUid)
    if (existing) return writeAgainst(userId, record, existing, 0)
    if (await writeInsert(userId, record)) return { outcome: 'created' }
    // INSERT 被唯一约束挡下（并发同一合并键）：回读再按内容裁决一次，绝不「猜成 created」。
    const afterConflict = await readRow(userId, record.platform, record.platformUid)
    if (!afterConflict) throw accountError('ACCOUNT_WRITE_FAILED', 500)
    return writeAgainst(userId, record, afterConflict, 0)
  }

  /**
   * 对着读到的行裁决并写。`attempt` 只用于封顶 CAS 重试（最多 2 次写），
   * 上限存在的理由：并发写热点上无上限重试会把一批的预算全烧在一条上。
   */
  async function writeAgainst(userId, record, row, attempt) {
    const decision = decideWrite(row, record)
    if (decision) return decision
    record.expectedCredentialDigest = row.credential_digest
    const mode = writeModeOf(row, record)
    if (await writeByDecision(userId, record, row)) return { outcome: 'updated' }
    // CAS 落空 = 读-判-写之间别的设备改过这条凭证。
    if (mode === WRITE_MODE_CREDENTIAL) {
      // 凭证写**绝不重试覆盖**：再写一次会把抢先赢的那台设备刚写入的有效凭证就地抹掉，
      // 而且两路都报 `updated` —— 正是本特性要消灭的无条件 LWW 形态。
      // 如实报冲突，把裁决权交回本机：下一轮同步它会重新实测再决定。
      const raced = await readRow(userId, record.platform, record.platformUid)
      if (!raced) throw accountError('ACCOUNT_WRITE_FAILED', 500)
      const afterRace = decideWrite(raced, record)
      return afterRace || { outcome: 'conflict', credentialFreshness: credentialFreshness(raced, record) }
    }
    if (attempt >= 1) {
      // 元数据写第二次仍落空：本行正被持续并发写。如实报冲突，不无限重试。
      return { outcome: 'conflict', credentialFreshness: credentialFreshness(row, record) }
    }
    const racedMeta = await readRow(userId, record.platform, record.platformUid)
    if (!racedMeta) throw accountError('ACCOUNT_WRITE_FAILED', 500)
    return writeAgainst(userId, record, racedMeta, attempt + 1)
  }

  /**
   * 按裁决选语句：只有持有 `force: 'cloud-wins'` 且 digest 真的不同才允许碰凭证四列。
   * 判点本身在 `upsert-decision.js::decideWrite`（本文件内**不得**再写一份同名局部函数——
   * 一旦遮蔽，三处调用点就会各自跟着不同的那份走，无条件覆盖就从这条缝里回来）。
   */
  function writeByDecision(userId, record, row) {
    return writeModeOf(row, record) === WRITE_MODE_CREDENTIAL
      ? writeUpdate(userId, record) : writeMetadata(userId, record)
  }

  return {
    /** GET ?view=digest（PRD §7.1）：`{ total, byPlatform[], tombstones, updatedAt }`。 */
    async listDigest(userId) {
      const owner = assertUserId(userId)
      const [grouped, tombstoneCount] = await Promise.all([
        query(SELECT_DIGEST, [owner]),
        query(SELECT_TOMBSTONE_COUNT, [owner]),
      ])
      const rows = (grouped && grouped.rows) || []
      // SQL 已按 (count desc, platform asc) 排；JS 再排一次，防不同驱动/视图把顺序打散。
      const byPlatform = rows.map((row) => ({ platform: String(row.platform), count: toCount(row.count) }))
        .sort((left, right) => (right.count - left.count) || String(left.platform).localeCompare(String(right.platform)))
      const stamps = rows.map((row) => isoTime(row.updated_at)).filter(Boolean).sort()
      return {
        total: byPlatform.reduce((sum, entry) => sum + entry.count, 0),
        byPlatform,
        tombstones: toCount(tombstoneCount && tombstoneCount.rows && tombstoneCount.rows[0] && tombstoneCount.rows[0].count),
        updatedAt: stamps.length > 0 ? stamps[stamps.length - 1] : null,
      }
    },

    /** GET ?view=full：合并所需的云端全集（不含任何凭证材料）+ 墓碑。 */
    async listFull(userId) {
      const owner = assertUserId(userId)
      const [accounts, tombstones] = await Promise.all([
        query(SELECT_FULL, [owner]),
        query(SELECT_TOMBSTONES, [owner]),
      ])
      return {
        accounts: ((accounts && accounts.rows) || []).map((row) => mapAccount(row)),
        tombstones: ((tombstones && tombstones.rows) || []).map((row) => mapTombstone(row)),
      }
    },

    /**
     * PUT /api/v1/me/accounts：逐条独立裁决，返回与入参同序的 results。
     * 这里没有 BEGIN/COMMIT——整批回滚会把已成功的账号也抹掉，违反 PRD §7.2。
     */
    async upsertMany(userId, items) {
      const owner = assertUserId(userId)
      if (!Array.isArray(items)) throw accountError('ACCOUNT_BATCH_INVALID', 400)
      if (items.length > MAX_BATCH_SIZE) throw accountError('ACCOUNT_BATCH_TOO_LARGE', 413)
      const results = []
      for (const item of items) {
        const platform = item && typeof item.platform === 'string' ? item.platform : null
        const platformUid = item && typeof item.platformUid === 'string' ? item.platformUid : null
        try {
          const outcome = await upsertOne(owner, item)
          // conflict 必须把「哪份凭证较新」一起带出去：桌面端的四分支裁决要靠它决定先验哪一份，
          // 在这里把该字段裁掉，客户端就只剩「猜」——而那正是本条冲突机制要避免的事。
          results.push({
            platform,
            platformUid,
            outcome: outcome.outcome,
            ...(outcome.credentialFreshness ? { credentialFreshness: outcome.credentialFreshness } : {}),
          })
        } catch (error) {
          // 只回语义码：驱动原文（约束名、SQLSTATE、连接串）一律不外泄。
          results.push({ platform, platformUid, outcome: 'rejected', errorCode: safeErrorCode(error, 'ACCOUNT_WRITE_FAILED') })
        }
      }
      return { results }
    },

    async listTombstones(userId) {
      const owner = assertUserId(userId)
      const result = await query(SELECT_TOMBSTONES, [owner])
      return ((result && result.rows) || []).map((row) => mapTombstone(row))
    },

    /** 幂等：重复写同一合并键不报错也不产生第二行。 */
    async addTombstone(userId, platform, platformUid) {
      const owner = assertUserId(userId)
      const key = assertKey(platform, platformUid)
      const result = await query(INSERT_TOMBSTONE, [owner, key.platform, key.platformUid])
      return { created: countAffected(result) > 0 || Boolean(result && result.rows && result.rows[0]) }
    },

    /** POST /api/v1/me/accounts/sync（本期语义 = 批量取凭证槽，PRD §7.3）。 */
    async getCredentials(userId, keys) {
      const owner = assertUserId(userId)
      if (!Array.isArray(keys)) throw accountError('ACCOUNT_BATCH_INVALID', 400)
      if (keys.length === 0) return []
      if (keys.length > MAX_BATCH_SIZE) throw accountError('ACCOUNT_BATCH_TOO_LARGE', 413)
      const platforms = []
      const uids = []
      for (const entry of keys) {
        const key = assertKey(entry && entry.platform, entry && entry.platformUid)
        platforms.push(key.platform)
        uids.push(key.platformUid)
      }
      const result = await query(SELECT_CREDENTIALS, [owner, platforms, uids])
      return ((result && result.rows) || []).map((row) => ({
        platform: row.platform,
        platformUid: row.platform_uid,
        credentialUpdatedAt: isoTime(row.credential_updated_at),
        credentialEnvelope: {
          v: ENVELOPE_VERSION,
          // alg 不落列（PRD §6.1 没有算法列）：契约固定为 A256GCM，读库时按常量回填，
          // 不去探测一个不存在的列（AGENTS.md「宿主/数据字段归属必须先核实」同源纪律）。
          alg: ENVELOPE_ALG,
          iv: row.credential_iv,
          ciphertext: row.credential_ciphertext,
          tag: row.credential_auth_tag,
          encryptedDataKey: row.encrypted_data_key,
          digest: row.credential_digest,
        },
      }))
    },

    /**
     * POST /api/v1/me/accounts/disconnect（断开云端，PRD §7.4）：账号 + 墓碑一并清除，
     * 删完回读；有残留即返回 CLOUD_DISCONNECT_PARTIAL 语义，由客户端保留入口重试。
     */
    async clearAll(userId) {
      const owner = assertUserId(userId)
      const deletedAccounts = countAffected(await query(DELETE_ACCOUNTS, [owner]))
      const deletedTombstones = countAffected(await query(DELETE_TOMBSTONES, [owner]))
      const residual = await query(SELECT_RESIDUAL, [owner])
      const row = (residual && residual.rows && residual.rows[0]) || {}
      const remaining = toCount(row.accounts) + toCount(row.tombstones)
      if (remaining > 0) {
        return { ok: false, errorCode: 'CLOUD_DISCONNECT_PARTIAL', deletedAccounts, deletedTombstones, remaining }
      }
      return { ok: true, deletedAccounts, deletedTombstones, remaining: 0 }
    },
  }
}

module.exports = {
  CLOUD_ACCOUNT_COLUMNS,
  DELETE_ACCOUNTS,
  DELETE_TOMBSTONES,
  INSERT_ACCOUNT,
  INSERT_TOMBSTONE,
  SELECT_CREDENTIALS,
  SELECT_DIGEST,
  SELECT_FULL,
  SELECT_RESIDUAL,
  SELECT_ROW,
  SELECT_TOMBSTONE_COUNT,
  SELECT_TOMBSTONES,
  UPDATE_ACCOUNT,
  UPDATE_ACCOUNT_METADATA,
  createCloudAccountRepository,
  sameRecord,
}
