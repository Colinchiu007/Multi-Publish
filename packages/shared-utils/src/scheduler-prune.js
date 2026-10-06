// @ts-check
/**
 * 定时任务 JSONL 的终态记录剪枝。
 *
 * 为什么需要独立成模块：scheduler.js 是定时发布的单一业务实现，行数已逼近
 * 逐文件行数门禁（500 行）。剪枝是**纯维护策略**，与「调度/派发/恢复」业务
 * 无关，混在一起会让核心实现持续膨胀。单独成文件也便于单独测试。
 *
 * 背景：`scheduled-tasks.jsonl` 是 append-only，且 scheduler 的状态迁移每次都
 * 「全量读-改-写」整个文件。若终态记录永不清理，文件体积随历史线性增长，
 * 单次改写成本 O(n)、累计 O(n²)。策略：
 *   - 超过保留天数的终态记录丢弃；
 *   - 即便都是近期终态，也只保留最近 MAX_TERMINAL_ENTRIES 条；
 *   - pending / dispatching **任何情况下都不裁剪**（丢了就是静默数据丢失）。
 */
const TERMINAL_STATUSES = new Set(['executed', 'cancelled', 'failed'])
const TERMINAL_RETENTION_DAYS = 30
const MAX_TERMINAL_ENTRIES = 200
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 计算剪枝后应保留的行（保持原有顺序）。
 *
 * @param {string[]} lines JSONL 原始行
 * @param {number} [now] 当前时间戳（注入以便测试）
 * @returns {{ kept: string[], removed: number }}
 */
function planPrune (lines, now = Date.now()) {
  const cutoff = now - TERMINAL_RETENTION_DAYS * DAY_MS
  const kept = []
  const terminalKept = []
  let removed = 0

  for (const line of lines) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      // 非法行不属于任何终态语义，按原样保留 —— 剪枝是维护动作，
      // 不得吞掉人工排查所需的证据。
      kept.push(line)
      continue
    }
    if (!TERMINAL_STATUSES.has(entry.status)) {
      kept.push(line)
      continue
    }
    const stamp = new Date(entry.createdAt || entry.publishTime || 0).getTime()
    if (Number.isFinite(stamp) && stamp < cutoff) {
      removed += 1
      continue
    }
    terminalKept.push({ line, stamp: Number.isFinite(stamp) ? stamp : 0 })
  }

  if (terminalKept.length > MAX_TERMINAL_ENTRIES) {
    // 按时间倒序保留最近的 N 条，其余丢弃
    terminalKept.sort((a, b) => b.stamp - a.stamp)
    removed += terminalKept.length - MAX_TERMINAL_ENTRIES
    kept.push(...terminalKept.slice(0, MAX_TERMINAL_ENTRIES).map(item => item.line))
  } else {
    kept.push(...terminalKept.map(item => item.line))
  }

  return { kept, removed }
}

/**
 * 在给定文件上执行剪枝并原子重写。
 *
 * @param {{ existsSync: Function, readFileSync: Function, writeFileSync: Function, renameSync: Function }} fs
 * @param {string} filePath JSONL 路径
 * @param {number} [now] 当前时间戳
 * @returns {number} 被裁剪的记录条数；0 表示无需改写
 */
function pruneTerminalEntries (fs, filePath, now = Date.now()) {
  if (!fs.existsSync(filePath)) return 0
  const raw = fs.readFileSync(filePath, 'utf-8')
  const lines = raw.trim().split('\n').filter(Boolean)
  if (lines.length === 0) return 0

  const { kept, removed } = planPrune(lines, now)
  if (removed === 0) return 0

  const temporaryPath = filePath + '.tmp'
  fs.writeFileSync(temporaryPath, kept.join('\n') + '\n', 'utf-8')
  fs.renameSync(temporaryPath, filePath)
  return removed
}

module.exports = {
  planPrune,
  pruneTerminalEntries,
  TERMINAL_STATUSES,
  TERMINAL_RETENTION_DAYS,
  MAX_TERMINAL_ENTRIES,
}