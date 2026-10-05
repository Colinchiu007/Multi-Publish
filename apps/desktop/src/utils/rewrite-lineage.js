/**
 * 改写关联 id（rewriteHistoryId）的渲染层唯一提取实现。
 *
 * 关联链见 PRD-PUBLISH-REWRITE-LINEAGE-2026-10-05：主进程侧（phase4-events 读
 * task.article?.rewriteHistoryId → store 写列 → 归因按列筛）从写下第一行起就齐了，
 * 断的一直是渲染层 —— 四个改写入口谁都没读过这个字段。
 *
 * 这里只把一件事判准并**只实现一次**：信封里到底有没有一个可用的 id。
 * 四个入口各抄一份读法，漂移的症状不是报错，是归因榜静默少一路。
 *
 * 返回 null 而不是空串：下游全部按「键缺席 = 不挂载」处理（草稿指纹、payload 条件挂载），
 * 空串会被读成「有值」，等于把断链换成假关联 —— 比 NULL 更糟。
 */

/** 长度上限：拦住「把整段别的字段塞进来」，不是格式校验（真实 id 实测 15–16 字符）。 */
export const REWRITE_LINEAGE_MAX_LENGTH = 64

// 控制字符永不该出现在 base36 id 里；放过去就是脏数据进 SQL 参数
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/**
 * 从 `aiRewrite` 的完整 IPC 信封里取改写关联 id。
 *
 * 入参是**信封**而不是 `res.data`：四个调用点都在判完 `code === 0 && data.success`
 * 之后才用数据，判据放在信封层可以顺带把"失败信封里残留的字段"挡掉。
 *
 * @param {{code?:number, data?:{success?:boolean, rewriteHistoryId?:unknown}}|null|undefined} res
 * @returns {string|null} 合法 id（已去首尾空白）或 null
 */
export function extractRewriteHistoryId (res) {
  if (!res || typeof res !== 'object') return null
  if (res.code !== 0) return null
  const data = res.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  if (data.success !== true) return null
  const raw = data.rewriteHistoryId
  // 不做 String() 兜底：把 123 变成 "123" 是"猜"，不是"取"
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  if (!id) return null
  if (id.length > REWRITE_LINEAGE_MAX_LENGTH) return null
  if (CONTROL_CHARS.test(id)) return null
  return id
}

/**
 * 归一化「已有的值」：从 article / 草稿 / 批量条目里读出来的东西可能是任何形状
 * （手改的、旧版草稿缺键的、被别的字段污染的），一律折成 `string | null`。
 *
 * 判据与 {@link extractRewriteHistoryId} 同源（不复制第二份），
 * 因为「什么算一个可用 id」只该有一个答案。
 *
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeRewriteLineage (value) {
  if (typeof value !== 'string') return null
  const id = value.trim()
  if (!id) return null
  if (id.length > REWRITE_LINEAGE_MAX_LENGTH) return null
  if (CONTROL_CHARS.test(id)) return null
  return id
}

/**
 * 条件挂载：只在拿到合法 id 时才把键挂上去，否则**键不出现**。
 *
 * 草稿快照、payload、批量 payload 三处共用这一条挂载规则 —— 三处都出现过
 * `visibilitySemantic` 式的条件挂载先例（usePublishFlow.js:227 / useBatchPublish.js:190），
 * 而"无条件挂 undefined"会让下游的 `if (draft.rewriteHistoryId)` 判据与
 * "键缺席"变得不可区分。
 *
 * @param {Record<string, unknown>} target 会被就地修改（返回同一对象便于链式）
 * @param {string|null|undefined} id
 */
export function attachRewriteLineage (target, value) {
  if (!target || typeof target !== 'object') return target
  const id = normalizeRewriteLineage(value)
  if (id) target.rewriteHistoryId = id
  return target
}
