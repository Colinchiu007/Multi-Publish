'use strict'
/**
 * upsert-decision.js — 「对着已经读到的那一行，这次 PUT 到底能不能写」的唯一判点（纯函数）。
 *
 * 单独成文件的两个理由：
 *   1) **判点只允许有一处**。`cloud-account-repository.js` 里对着同一份裁决要走三条路径抵达：
 *      首轮读到已存在的行、CAS 落空后重读、INSERT 撞唯一约束后回读。判点若散在这三处各抄一份，
 *      漏掉的那一份就退回本特性的原始事故形态——无条件 LWW 覆盖，设备 A 的旧凭证静默抹掉
 *      设备 B 刚刷新的有效凭证（PRD §5.5 / docs/adr/0005）。
 *   2) 判点是纯函数：给一行数据库返回值 + 一条待写记录，返回结论。它可以被逐分支直接断言，
 *      不需要 fake pool、不需要 SQL 文本，也就不会像「只有贯通用例才看得见」那样静默失效。
 *
 * 行值归一化器（`text` / `bool` / `intText` / `isoTime`）跟着搬过来：判点比较的每一列都出自它们，
 * 与比较规则分在两个文件里会让「pg 把 BIGINT 回读成字符串」这类口径漂移只能靠两边同时改来兜住。
 *
 * 输入侧的合法性（归属、合并键、信封形状）在 `validate-account.js` 与 repository 的
 * `assertWritable`，本模块只管「能不能写、写哪些列」，不做任何校验也不抛语义码。
 */

function text(value) {
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

function bool(value) {
  return value === true || value === 't' || value === 't ' || value === 1 || value === '1'
}

/** pg 的 int8 以字符串回读，与 Number 比较前统一成字符串（null 保持 null，不与 0 混同）。 */
function intText(value) {
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

function isoTime(value) {
  if (value === undefined || value === null) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function timeOf(value) {
  if (value === undefined || value === null || value === '') return NaN
  const date = value instanceof Date ? value : new Date(value)
  return date.getTime()
}

/**
 * 凭证谁更新：拿本机上报的时刻与云端存储的时刻比。
 * 本机没报时刻（旧客户端 / 首次）时保守按「云端较新」，让本机实测先去验云端那一份，
 * 而不是凭空声称本机较新从而覆盖云端。
 *
 * **相等一律判 'cloud'**（PRD §5.5）：同一毫秒分辨不出先后，而两个猜错方向的代价不对称——
 * 先测云端那一份的最坏结果是多跑一次本机检测，先测本机那一份的最坏结果是把云端仍有效的
 * 凭证就地覆盖掉，且用户无从得知是同步干的。
 */
function credentialFreshness(row, record) {
  const storedAt = timeOf(row && row.credential_updated_at)
  const reportedAt = timeOf(record && record.reportedCredentialUpdatedAt)
  if (!Number.isFinite(reportedAt)) return 'cloud'
  if (!Number.isFinite(storedAt)) return 'local'
  return storedAt >= reportedAt ? 'cloud' : 'local'
}

/** 凭证本体是否不同（只看 digest，不看元数据）：不同才需要本机实测裁决。 */
function digestDiffers(row, record) {
  return ((row && row.credential_digest) || null) !== record.credentialDigest
}

/** 元数据列是否等价（digest 之外的那几列）：决定 `local-wins` 到底还有没有东西可写。 */
function sameMetadata(row, record) {
  return text(row.display_name) === record.displayName
    && text(row.account_name) === record.accountName
    && text(row.avatar) === record.avatar
    && intText(row.followers) === record.followers
    && bool(row.is_active) === record.isActive
    && text(row.last_sync_device_label) === record.lastSyncDeviceLabel
}

/**
 * 内容是否等价：digest + 全部元数据列。
 * 时间戳列不参与（它们是服务端盖戳的镜像值，不是内容）；`last_reported_status` 也不参与——
 * 它是服务端只读快照、客户端不再上报（PRD §6.1），留在比较里会让「库里有一个快照、待写记录没有」
 * 永远判成不等，每轮同步都刷一次假 `updated` 并白改一次 `updated_at`。
 */
function sameRecord(row, record) {
  return !digestDiffers(row, record) && sameMetadata(row, record)
}

/**
 * 发任何写请求之前的裁决。返回 `null` 表示「本方持有写权」，写哪几列由 `writeModeOf` 决定。
 *
 * 四类终态（`force` 的方向以 PRD §7.2 第 235 行为准：`'local-wins'` 才是「本机实测胜出、
 * 授权覆盖云端凭证」的凭据；`'cloud-wins'` 只是把云端自己那份回写、本机接受了它，
 * 因此它**无权**覆盖凭证列——把两侧读反会让本机验证过的新凭证永远写不上去，
 * 云端长期存着一份已失效的钥匙，用户每次都要重登）：
 *   * digest 相同且元数据相同 → `unchanged`（一条写请求都不发）。
 *   * digest 不同且**没有** `force` → `conflict` + `credentialFreshness`，一个字节都不写。
 *     这是「不在服务端按时间戳悄悄覆盖」的落点：只有本机实测裁决完并带上来这份凭据才允许动凭证列。
 *   * digest 不同且 `force: 'cloud-wins'` → 元数据也没变时 `unchanged`（本方没有任何可写的东西，
 *     而凭证列无权覆盖）；否则放行，走元数据只写分支。
 *   * 其余（digest 相同仅元数据变、或 `force: 'local-wins'`）→ 放行。
 */
function decideWrite(row, record) {
  if (sameRecord(row, record)) return { outcome: 'unchanged' }
  if (digestDiffers(row, record) && record.force !== 'local-wins') {
    if (!record.force) return { outcome: 'conflict', credentialFreshness: credentialFreshness(row, record) }
    if (sameMetadata(row, record)) return { outcome: 'unchanged' }
  }
  return null
}

/** 写分支：只有持有 `force: 'local-wins'`（本机实测证明云端那份不可用）且 digest 真的不同才允许碰凭证四列。 */
const WRITE_MODE_CREDENTIAL = 'credential'
const WRITE_MODE_METADATA = 'metadata'

function writeModeOf(row, record) {
  return digestDiffers(row, record) && record.force === 'local-wins'
    ? WRITE_MODE_CREDENTIAL : WRITE_MODE_METADATA
}

module.exports = {
  WRITE_MODE_CREDENTIAL,
  WRITE_MODE_METADATA,
  bool,
  credentialFreshness,
  decideWrite,
  digestDiffers,
  intText,
  isoTime,
  sameMetadata,
  sameRecord,
  text,
  writeModeOf,
}
