/**
 * 渲染进程错误上报：优先写入主进程文件日志（logs:error），
 * 无 electronAPI（浏览器开发/单测）时回退控制台，保证不吞错。
 * 供组件 catch 块统一调用，便于用户/官方/AI 从 app-*.log 排查问题。
 */
import { getApi } from '@/api/electron-bridge'
export function reportError(message, err) {
  const detail = err && err instanceof Error ? err.message : err
  const text = detail == null || detail === ''
    ? String(message ?? '')
    : `${String(message ?? '')}: ${detail}`
  const toConsole = () => {
    if (err !== undefined) console.error(message, err)
    else console.error(message)
  }
  try {
    const api = getApi()
    if (api && typeof api.logError === 'function') {
      const ret = api.logError(String(text).slice(0, 2000))
      // logError 走 ipcRenderer.invoke，返回的是 Promise。上面的 try/catch 只能兜住
      // **同步**抛错；Promise 的**异步拒绝**会直接逃出去变成 unhandledrejection，
      // 而此处若照旧早退 return，console 兜底就永远不可达 —— 于是错误既没进主进程
      // 日志、也没进控制台，彻底丢失（这正是 M-5）。
      // 故对 thenable 单独挂 catch，把兜底接回去。
      if (ret && typeof ret.catch === 'function') {
        ret.catch(toConsole)
      }
      return
    }
  } catch (_) {
    // IPC 同步异常回退控制台
  }
  toConsole()
}
