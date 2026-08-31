// @ts-check
/**
 * publish-from-project.js — 从 Story2Video 项目提取「发布」所需数据
 *
 * 职责：
 *   - 将已完成合成的 story2video 项目（历史记录/结果页）映射为发布页可用的预填充数据
 *   - 统一 CreateViewHistory「发布历史视频」与 ResultView「去发布」两条入口的数据契约
 *   - 标题/正文/话题标签的提取与兜底（含百家号标题长度截断）
 *
 * 数据来源优先级（见 story2video project.json 结构）：
 *   - video_path：project.videoPath
 *   - title：story2videoTextConfig.config.publish.title → project.title → project.sourceText
 *   - content：story2videoTextConfig.config.publish.content → project.sourceText → 拼接 segments[].text
 *   - tags：story2videoTextConfig.config.publish.tags
 *
 * 说明：百家号 API 发布不支持自定义封面（adapter 对 taskData.cover 直接拒绝），
 * 因此历史视频发布一律走视频首帧封面，不携带 cover。
 */

import { normalizePublishStringList } from './publish-contract'

/** 百家号标题上限（DEFAULT_CONTENT_LIMITS.titleMax），超长截断 */
const DEFAULT_TITLE_MAX = 100

function readPublishConfig (project) {
  if (!project || typeof project !== 'object') return {}
  const config = project.story2videoTextConfig
  if (!config || typeof config !== 'object') return {}
  const inner = config.config
  if (!inner || typeof inner !== 'object') return {}
  const publish = inner.publish
  return publish && typeof publish === 'object' ? publish : {}
}

function joinSegmentTexts (segments) {
  if (!Array.isArray(segments)) return ''
  return segments
    .map(segment => (segment && typeof segment.text === 'string' ? segment.text : ''))
    .filter(Boolean)
    .join('')
}

function truncateTitle (title, max = DEFAULT_TITLE_MAX) {
  const value = String(title || '').trim()
  if (value.length <= max) return value
  return value.slice(0, max)
}

/**
 * 从 Story2Video 项目提取发布预填充数据。
 * @param {object} project story2video 项目对象（含 videoPath/title/sourceText/segments/story2videoTextConfig）
 * @returns {{ type: 'video', video_path: string, title: string, content: string, tags: string[] }}
 */
export function buildPublishFromProject (project) {
  const publish = readPublishConfig(project)
  const sourceText = typeof project?.sourceText === 'string' ? project.sourceText.trim() : ''
  const projectTitle = typeof project?.title === 'string' ? project.title.trim() : ''
  const segmentText = joinSegmentTexts(project?.segments)

  const rawTitle = String(publish.title || projectTitle || sourceText || '').trim()
  const rawContent = String(publish.content || sourceText || segmentText || '').trim()
  const tags = normalizePublishStringList(publish.tags)
  const videoPath = typeof project?.videoPath === 'string' ? project.videoPath.trim() : ''

  return {
    type: 'video',
    video_path: videoPath,
    title: truncateTitle(rawTitle),
    content: rawContent,
    tags,
  }
}

/**
 * 将发布预填充数据编码为路由 query（供跳转 /publish 使用）。
 * 路径与文案可能含反斜杠/特殊字符，统一 encodeURIComponent 后放入 query。
 * @param {{ type: 'video', video_path: string, title: string, content: string, tags: string[] }} data
 * @returns {object} 可直接作为 router.push query 的对象
 */
export function publishDataToQuery (data) {
  const query = {
    type: 'video',
    video_path: encodeURIComponent(data.video_path),
    title: encodeURIComponent(data.title),
    content: encodeURIComponent(data.content),
  }
  if (Array.isArray(data.tags) && data.tags.length > 0) {
    query.tags = encodeURIComponent(data.tags.join(','))
  }
  return query
}
