/**
 * publish-upload-file.js — el-upload 文件对象 → 发布用路径描述符的单一实现
 *
 * 自 Publish.vue 迁出（P2-7 批量模式字段面，2026-10-09）。批量条目的封面选择与单篇的
 * 图片/视频/封面选择必须走同一份解析：两份实现必然漂移，漂移表现为「同一张图在单篇能发、
 * 批量发不出去」（Electron sandbox 下 File.path 已废弃，只能经 getPathForFile 取，
 * 浏览器 dev server 下又只能取 raw.path）。
 */
import { getApi } from '@/api/electron-bridge'
import { normalizePublishFile } from '@/features/publish/publish-contract'

export async function resolveUploadFilePath (file) {
  const raw = file?.raw || file
  const directPath = raw?.path || raw?.filePath || raw?.file_path || file?.path
  if (typeof directPath === 'string' && directPath.trim()) return directPath.trim()
  try {
    const resolvedPath = await getApi()?.getPathForFile?.(raw)
    if (typeof resolvedPath === 'string' && resolvedPath.trim()) return resolvedPath.trim()
  } catch (_) {
    // Path resolution is best effort; the caller reports an actionable error.
  }
  return ''
}

/**
 * 归一化上传文件为 `{ path, name, type, size, lastModified }`。
 * @returns {Promise<object|null>} 解析不出本机路径时返回 null（调用方须出声报错，
 *   不得静默写空串——那会把「解析失败」伪装成「用户清空了封面」）。
 */
export async function normalizeUploadFile (file) {
  const raw = file?.raw || file
  const path = await resolveUploadFilePath(file)
  if (!path) return null
  return normalizePublishFile({
    path,
    name: raw?.name || file?.name,
    type: raw?.type || file?.type,
    size: raw?.size || file?.size,
    lastModified: raw?.lastModified || file?.lastModified,
  })
}

/**
 * 解析封面三键（`cover_file` / `cover_path` / `cover_url`）为**互斥**的载荷形状。
 * 单篇（`usePublishFlow.buildArticleData`）与批量（`useBatchPublish.buildBatchArticlePayload`）
 * 必须共用本实现——两模式各写一份优先级，漂移的方向必然是「一端显示本地封面、
 * 另一端发布 URL」。
 *
 * 为什么必须由渲染层收口，而不是让主进程判优先级：主进程取值表达式是
 * `cover_url || cover_path`（`publisher-router.js` 的 `buildPublishArticle`），
 * **URL 优先**；而渲染层算缩略图用的是 `cover_file || cover_path || cover_url`，
 * **本地优先**。两层优先级相反时，用户「先填 URL 再选本地文件」= 界面显示刚选的图、
 * 实际发出那个更早的 URL；DOM RPA 轨更糟——它会把 URL 字符串当文件路径塞进
 * `<input type=file>`（`rpa-view-platforms.js` 的 `article.cover_path` 分支）。
 *
 * 判据取 `cover_file.path` 是否存在：本仓每个「用户选中本地封面」的写点都会同时落
 * `cover_file` 描述符（文件选择器、裁剪、AI 封面、草稿恢复白名单），而 `cover_path`
 * 单独存在时无法与「URL 字符串回填」区分，故不据它改写语义。
 *
 * @returns {{cover_url: string, cover_path: string, cover_file: object|null}}
 */
export function resolveCoverFields (source) {
  const a = source || {}
  const coverFile = normalizePublishFile(a.cover_file || a.cover_path || a.cover_url)
  const coverPath = coverFile?.path || String(a.cover_path || a.cover_url || '').trim()
  const localPath = a.cover_file?.path
  const hasLocalCover = typeof localPath === 'string' && localPath.trim() !== ''
  return {
    // 本地封面胜出时清空 URL：残留 URL 不得遮蔽用户刚选中的文件
    cover_url: hasLocalCover ? '' : (a.cover_url || ''),
    cover_path: coverPath,
    cover_file: coverFile,
  }
}
