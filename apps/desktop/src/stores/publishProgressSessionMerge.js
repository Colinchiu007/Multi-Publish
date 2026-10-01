// @ts-check
/**
 * publishProgressSessionMerge.js — 发布进度会话「收养/合并」纯逻辑
 *
 * 拆分自 src/stores/publishProgress.js（2026-10 publish-progress-dup-upload）：
 * 主文件已 495 行，逐文件行数门禁（.github/scripts/check-max-lines.js，limit=500）
 * 下无膨胀余量，而 Bug A 的修复（registerSession 收养孤儿会话）需新增纯函数。
 * 故按本仓既有范式外置：函数只依赖传入的 sessions 数组与会话对象本身，
 * 不反向依赖 store 实例、不触响应式副作用（sessions 的增删由调用方执行）。
 */

/**
 * 查找可被收养的会话：已包含任一 taskId，或 batchId 命中。
 *
 * 取证（2026-10 抖音发布日志）：主进程在 `publish:batch` 处理器内同步 `taskQueue.add()`
 * 并**立即** `webContents.send('publish:progress')`（`starting browser...` 早于
 * `publish:batch ok`）。渲染端几乎总是先收到事件（R3 孤儿收纳建会话1），随后
 * `usePublishFlow.registerSession({taskIds,title})` 才到达；不收养就会再建会话2，
 * 而同一 taskId 在 _findSessionByTaskId 下先命中会话1 ⇒ 会话2 的任务永远停在
 * 'queued'（幽灵任务）⇒ 面板出现两个会话、聚合「成功 1/2」、面板永不结束。
 *
 * @param {object[]} sessions 当前会话列表（store.sessions.value）
 * @param {string[]} ids 归一化后的 taskId 列表
 * @param {string|null} batchId 归一化后的批次号（无则 null）
 * @returns {object[]} 命中会话（按创建顺序，越靠前越旧）
 */
export function findAdoptableSessions(sessions, ids, batchId) {
  const list = Array.isArray(sessions) ? sessions : []
  const hits = []
  for (const s of list) {
    if (batchId && s.batchId === batchId) {
      hits.push(s)
      continue
    }
    if (ids.some((id) => Object.prototype.hasOwnProperty.call(s.tasks, id))) hits.push(s)
  }
  return hits
}

/**
 * 把 other 的任务与日志并入 primary（多个命中会话收敛为一个时调用）。
 * 任务对象整体搬迁——相位/阶段/结果原样保留，**绝不**重置为 queued：
 * 相位重置正是「幽灵任务永远排队中」的直接成因。
 *
 * @param {object} primary 保留下来的会话
 * @param {object} other 被合并掉的会话
 * @returns {object} primary（便于链式/直接返回）
 */
export function mergeSessionInto(primary, other) {
  for (const taskId of other.taskOrder) {
    const task = other.tasks[taskId]
    if (!task || Object.prototype.hasOwnProperty.call(primary.tasks, taskId)) continue
    primary.tasks[taskId] = task
    primary.taskOrder.push(taskId)
  }
  if (Array.isArray(other.log) && other.log.length > 0) {
    primary.log = primary.log.concat(other.log).slice(-200)
  }
  if (!primary.title && other.title) primary.title = other.title
  return primary
}
