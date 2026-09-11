// hot-topics API — 热门选题模块 IPC 桥接（渲染层）
import { invokeWithFallback } from './electron-bridge'

export async function hotTopicsFetch(force = false) {
  return invokeWithFallback('hotTopicsFetch', { code: -1, data: null }, { force })
}

export async function hotTopicsGetCache() {
  return invokeWithFallback('hotTopicsGetCache', { code: -1, data: null })
}
