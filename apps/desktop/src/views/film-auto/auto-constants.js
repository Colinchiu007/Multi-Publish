// @ts-check
/**
 * 自动模式常量（单一真源，前端面板与测试共用）
 *
 * 与后端 `electron/services/film-engineering/auto-plan.js` 的判据同源；任一侧变更必须同步另一侧，
 * 并由 auto-plan.test.js 的边界矩阵锁定（design D10 / spec「自动模式输入与校验契约」）。
 */
export const MAX_AUTO_SCRIPT_LENGTH = 10000
export const MAX_AUTO_REFS = 8
export const MIN_AUTO_DURATION_SEC = 10
export const MAX_AUTO_DURATION_SEC = 600
export const MAX_AUTO_SHOTS = 120
export const AUTO_ASPECTS = Object.freeze(['16x9', '9x16'])
export const AUTO_SHOT_SECONDS = Object.freeze([5, 8, 10])
export const AUTO_DEFAULT_ASPECT = '16x9'
export const AUTO_DEFAULT_SHOT_SECONDS = 5
export const AUTO_DEFAULT_TARGET_DURATION_SEC = 60
/** 单镜提示词上限（与后端 auto-project.js 的 MAX_SHOT_PROMPT_LENGTH 同值：50000） */
export const MAX_AUTO_SHOT_PROMPT_LENGTH = 50000

/** 目标时长 ÷ 单镜秒数 → 目标镜数（与后端同公式：clamp(round(T/s), 1, MAX_AUTO_SHOTS)） */
export function planShotCount (targetDurationSec, shotSeconds) {
  const t = Number(targetDurationSec)
  const s = Number(shotSeconds)
  if (!Number.isFinite(t) || !Number.isFinite(s) || s <= 0) return 1
  const n = Math.round(t / s)
  return Math.min(Math.max(Number.isFinite(n) ? n : 1, 1), MAX_AUTO_SHOTS)
}
