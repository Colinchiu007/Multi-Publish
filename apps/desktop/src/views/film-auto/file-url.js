// @ts-check
/**
 * 本地文件 → 可播放 URL（渲染端）
 *
 * 为什么要单独一个函数：Windows 路径的反斜杠在 `file://` URL 里不合法，且盘符路径必须补足三斜杠
 * （`C:\a\b.mp4` → `file:///C:/a/b.mp4`），而 POSIX 绝对路径只需两斜杠（`/a/b.mp4` → `file:///a/b.mp4`
 * 也成立，因为补三斜杠后为 `file:////a/b.mp4`——故此处按首字符分流）。
 * 允许 `file:` 是因为宿主就是 Electron 桌面应用、路径来自主进程（受控媒体根），并非外部输入。
 */
export function toFileUrl (filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') return ''
  const normalized = filePath.trim().replace(/\\/g, '/')
  // UNC 路径（//server/share）本身已带两斜杠，补 'file:' 即可
  if (normalized.startsWith('//')) return 'file:' + normalized
  if (normalized.startsWith('/')) return 'file://' + normalized
  return 'file:///' + normalized
}
