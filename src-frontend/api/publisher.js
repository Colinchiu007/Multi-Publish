/**
 * 发布 API 封装 — 调用 Electron IPC
 */
const api = window.electronAPI

export async function publishWechat (article) {
  if (!api) throw new Error('electronAPI not available')
  return api.publishWechat(article)
}

export async function listAccounts () {
  if (!api) return { code: 0, data: [] }
  return api.listAccounts()
}

export function onProgress (callback) {
  if (!api) return () => {}
  return api.onProgress(callback)
}