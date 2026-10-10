// 渲染端（vite dev / build）使用的 ESM 播客分发端目录孪生文件。
// 主进程仍使用 podcast-endpoints.js（CommonJS）。
// 数据单一来源：podcast-endpoints.json（两侧共同消费，禁止复制数据）。
// 函数层与 CJS 版逐字对齐；漂移由 __tests__/podcast-endpoints.test.js 的 parity 回归拦截。
import endpointsData from './podcast-endpoints.json'
import { safeHttpUrl } from './safe-http-url.browser.js'

export const PODCAST_ENDPOINTS = Object.freeze(
  Object.fromEntries(Object.entries(endpointsData.endpoints).map(([id, meta]) => [
    id,
    Object.freeze({
      id,
      name: meta.name,
      submitChannel: meta.submitChannel,
      submitUrl: meta.submitUrl || null,
      requiresManualFirstSubmit: meta.requiresManualFirstSubmit === true,
      timing: meta.timing,
      docUrl: meta.docUrl || null,
      verifiedAt: meta.verifiedAt,
      evidence: meta.evidence,
      steps: Object.freeze([...meta.steps])
    })
  ]))
)

export const ENDPOINT_ORDER = Object.freeze(Object.keys(endpointsData.endpoints))

export function listPodcastEndpoints () {
  return ENDPOINT_ORDER.map((id) => PODCAST_ENDPOINTS[id])
}

export function getPodcastEndpoint (id) {
  return PODCAST_ENDPOINTS[String(id || '')] || null
}

export function podcastEndpointHref (id) {
  const meta = getPodcastEndpoint(id)
  if (!meta || !meta.submitUrl) return null
  return safeHttpUrl(meta.submitUrl)
}
