'use strict';

/**
 * infer-effort.js — 需求工作量档位判定（HIGH / MEDIUM / LOW）的**唯一实现**
 *
 * ## 为什么要抽出来（2026-10-07）
 *
 * 本仓曾有两份**独立的**关键词实现：
 *
 * | 位置 | 状态 |
 * |---|---|
 * | `verifier/requirements-verifier.js` 的 `_estimateEffort` | ❌ 中文词在 `d52dcc0`（v0.8.0）被写成 U+FFFD |
 * | `ai-analyzer.js` 的 `inferEffortFromText` | ✅ 中文完好 |
 *
 * 后果实测：同一批输入，两份实现**9 例里 5 例不一致，且全部是中文**
 * （`批量导入用户数据`、`自动化工作流`、`用户列表展示`、`设置提示按钮`、`API 集成`），
 * 英文输入 100% 一致 ⇒ 缺陷完全静默。
 *
 * 真实影响：`ai-analyzer.js` 的决策分支
 * `analysis.requirements.uncovered.filter(u => u.effort === 'HIGH')`
 * 据此决定是否升级为 `NEED_HUMAN`。**中文 PRD 的高复杂度需求永远识别不出来**，
 * 永远走 `FIX_AND_RETRY`。
 *
 * ## 词表来源
 *
 * 损坏那一份的原文取自本组件 v0.5.0（`9b29306`，U+FFFD=0）：
 * `批量|batch|自动化|automate` 与 `显示|展示|提示|按钮|show|display`。
 * 合并后词表比两份原稿都全（`ai-analyzer` 那份另含
 * `integrate|api|oauth|sso|jwt` 与 `button|label|style`）。
 *
 * ## 纪律
 *
 * **这是唯一实现，不再新增第二份。** 新增关键词改这里；
 * 各调用方一律 `require` 本模块，不要就地写正则——
 * 上一轮的教训正是「就地写正则 → 各自漂移 → 有一份静默坏掉而没人知道」。
 */

/** 判为 HIGH：涉及导入导出 / 批量 / 自动化 / 外部系统对接 / 加密 */
const HIGH_PATTERN =
  /(import|export|批量|batch|自动化|automate|integrate|api|oauth|sso|jwt|crypt)/

/** 判为 LOW：纯展示层改动（改文案 / 改样式 / 改名） */
const LOW_PATTERN =
  /(显示|展示|提示|按钮|show|display|button|label|rename|style|css|color)/

const HIGH_EFFORT = 'HIGH'
const MEDIUM_EFFORT = 'MEDIUM'
const LOW_EFFORT = 'LOW'

/**
 * @param {string} text 需求名 / 特性名
 * @returns {'HIGH'|'MEDIUM'|'LOW'}
 */
function inferEffortFromText (text) {
  if (!text) return MEDIUM_EFFORT
  const s = String(text).toLowerCase()
  if (HIGH_PATTERN.test(s)) return HIGH_EFFORT
  if (LOW_PATTERN.test(s)) return LOW_EFFORT
  return MEDIUM_EFFORT
}

module.exports = { inferEffortFromText, HIGH_EFFORT, MEDIUM_EFFORT, LOW_EFFORT }
