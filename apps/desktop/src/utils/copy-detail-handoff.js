// @ts-check
/**
 * copy-detail-handoff — 「文案库 → 发布页(文案详情态)」跳转交接
 *
 * 与 rewrite-handoff 同模式（sessionStorage 一次性载荷，读后即焚）：
 * 文案正文可达数万字符，放进 URL query 有长度与双重转义风险；
 * 一次性交接 + `/publish?from=copy-library` 标志，发布页挂载/激活时取回预填。
 *
 * 载荷字段（与文案库 UNIFIED_ITEM 对齐）：
 * - content   文案正文（必填；视频来源为全文，拉取失败降级列表截断预览）
 * - title     文案标题（可为空串）
 * - origin    来源标识：collect | rewrite | draft | video（白名单校验）
 * - sourceId  去掉 origin 前缀后的原始 id（采集记录 id / 改写记录 id / 草稿 id / story2video projectId）
 * - platform  目标平台（采集/改写自带，可为空）
 * - sourceUrl 原文链接（可为空）
 */

export const COPY_DETAIL_HANDOFF_KEY = 'copy_detail_handoff_v1'

/** 来源白名单：与 useCopyLibrary / useCopyLibrarySources 的 ORIGIN_* 常量一致 */
export const COPY_DETAIL_ORIGINS = ['collect', 'rewrite', 'draft', 'video']

/**
 * 写入交接载荷（一次性）。
 * @param {{ content?: string, title?: string, origin?: string, sourceId?: string, platform?: string, sourceUrl?: string }} payload
 * @returns {boolean} 写入成功返回 true；content 空/origin 越界/sessionStorage 不可用或超额时返回 false
 */
export function setCopyDetailHandoff (payload) {
  if (!payload || typeof payload !== 'object') return false
  const content = String(payload.content == null ? '' : payload.content)
  if (!content.trim()) return false
  if (!COPY_DETAIL_ORIGINS.includes(payload.origin)) return false
  try {
    sessionStorage.setItem(COPY_DETAIL_HANDOFF_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

/**
 * 取出并清除交接载荷（一次性语义：读后即焚，刷新/再次进入不重复预填）。
 * @returns {object|null} 载荷；不存在或解析失败返回 null
 */
export function takeCopyDetailHandoff () {
  try {
    const raw = sessionStorage.getItem(COPY_DETAIL_HANDOFF_KEY)
    if (!raw) return null
    sessionStorage.removeItem(COPY_DETAIL_HANDOFF_KEY)
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** 供测试使用：清空交接键 */
export function clearCopyDetailHandoff () {
  try { sessionStorage.removeItem(COPY_DETAIL_HANDOFF_KEY) } catch { /* noop */ }
}
