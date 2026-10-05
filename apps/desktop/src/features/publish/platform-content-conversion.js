// @ts-check
/**
 * platform-content-conversion.js — 平台字数限制的提交文本转换（PRD-PLATFORM-CHAR-LIMITS-2026-10-02）
 *
 * 从 publish-contract 拆出的独立模块（逐文件行数门禁：契约文件不得突破 500 行上限）。
 * 职责：
 *   - APP_ARTICLE_CONTENT_MAX：应用端图文正文字数上限（编辑器计数 / Markdown maxlength /
 *     发布链路应用级截断共用，禁止组件内散落硬编码）
 *   - applyPlatformContentConversion：按平台把超限正文转换为该平台的差异化覆盖
 *   - convertBatchArticleItem：批量条目一站式转换（应用级截断 + 按平台覆盖 + 提示载荷）
 *
 * 截断口径单一真源仍在 publish-contract（getPlatformContentLimit /
 * truncateContentForPlatform / truncateByChars），本模块只做组合编排，禁止另写口径。
 */
import {
  getPlatformContentLimit,
  getPlatformLabel,
  truncateByChars,
  truncateContentForPlatform,
} from './publish-contract'

/**
 * 应用端图文正文字数上限（PRD §F1）。
 */
export const APP_ARTICLE_CONTENT_MAX = 10000

/**
 * 按平台把超限正文转换为该平台的差异化覆盖（PRD §F3）。
 *
 * 与 validatePlatformContent / truncateContentForPlatform 同源：复用注册表限制与
 * 合并预算截断，禁止另写截断口径。
 *
 * 行为契约：
 * - 超限平台写 `platformOverrides[p].content = 截断结果`（就地更新，与 diffEdits
 *   引用语义一致）；未超限平台完全不写覆盖 —— 全局正文保持全文，公众号等大限
 *   平台不再被「最小预算一刀切」误伤。
 * - 用户已有的覆盖内容（含手填）同样按平台上限截断（手填不豁免，否则平台仍拒稿）。
 * - `contentMax <= 0` 的平台跳过（维持现状语义）；未知平台回落默认 5000（与
 *   validatePlatformContent 的回落语义一致）。
 * - 幂等：对已截断内容再次调用 before == after，不产生新记录。
 *
 * @param {{ platforms?: unknown, article?: Record<string, unknown>, platformOverrides?: Record<string, unknown> }} options
 * @returns {{ overrides: Record<string, unknown>, truncations: Array<{ platform: string, label: string, limit: number, before: number, after: number }> }}
 */
export function applyPlatformContentConversion ({ platforms, article = {}, platformOverrides = {} } = {}) {
  const uniquePlatforms = [...new Set(Array.isArray(platforms) ? platforms : [])]
  const truncations = []
  for (const platform of uniquePlatforms) {
    if (typeof platform !== 'string' || !platform.trim()) continue
    const limit = getPlatformContentLimit(platform)
    const max = Number(limit && limit.contentMax)
    if (!(max > 0)) continue
    const override = platformOverrides && typeof platformOverrides[platform] === 'object' && platformOverrides[platform] !== null
      ? platformOverrides[platform]
      : null
    const source = override && typeof override.content === 'string'
      ? override.content
      : String((article && article.content) ?? '')
    const before = Array.from(source).length
    if (before <= max) continue
    // 截断口径与校验一致：无标题平台按合并预算（标题 + 换行计入）
    const converted = truncateContentForPlatform(platform, source, String((override && override.title) || (article && article.title) || ''))
    const target = override || (platformOverrides[platform] = {})
    target.content = converted
    truncations.push({
      platform,
      label: getPlatformLabel(platform),
      limit: max,
      before,
      after: Array.from(converted).length,
    })
  }
  return { overrides: platformOverrides, truncations }
}

/**
 * 批量条目一站式转换（PRD §F3 批量接入点）：
 * ① 应用级 10000 字截断（就地写回 item.content）；
 * ② 按平台生成差异化覆盖截断（就地写回 item.platformOverrides）。
 *
 * @param {{ title: string, content: string, platforms?: string[], platformOverrides?: Record<string, unknown> }} item 批量文章条目（就地变更）
 * @returns {Array<{ key: string, params: Record<string, unknown> }>} 进度提示载荷（key + 插值参数），由调用方经 progressText 渲染
 */
export function convertBatchArticleItem (item) {
  const summaries = []
  const before = Array.from(String(item.content || '')).length
  if (before > APP_ARTICLE_CONTENT_MAX) {
    item.content = truncateByChars(item.content, APP_ARTICLE_CONTENT_MAX)
    summaries.push({
      key: 'publishPage.publishFlow.articleContentTruncated',
      params: { before, after: APP_ARTICLE_CONTENT_MAX },
    })
  }
  const { truncations } = applyPlatformContentConversion({
    platforms: item.platforms,
    article: { title: item.title, content: item.content },
    platformOverrides: item.platformOverrides,
  })
  for (const truncation of truncations) {
    summaries.push({
      key: 'publishPage.publishFlow.platformContentTruncated',
      params: {
        platform: truncation.label,
        limit: truncation.limit,
        before: truncation.before,
        after: truncation.after,
      },
    })
  }
  return summaries
}
