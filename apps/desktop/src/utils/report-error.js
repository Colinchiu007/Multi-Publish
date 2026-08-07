/**
 * 渲染进程错误上报：优先写入主进程文件日志（logs:error），
 * 无 electronAPI（浏览器开发/单测）时回退控制台，保证不吞错。
 * 供组件 catch 块统一调用，便于用户/官方/AI 从 app-*.log 排查问题。
 */
export function reportError(message, err) {
  const detail = err && err instanceof Error ? err.message : err
  const text = detail == null || detail === ''
    ? String(message ?? '')
    : `${String(message ?? '')}: ${detail}`
  try {
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.logError === 'function') {
      window.electronAPI.logError(String(text).slice(0, 2000))
      return
    }
  } catch (_) {
    // IPC 异常回退控制台
  }
  if (err !== undefined) console.error(message, err)
  else console.error(message)
}
