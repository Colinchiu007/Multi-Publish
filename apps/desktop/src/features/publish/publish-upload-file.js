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
