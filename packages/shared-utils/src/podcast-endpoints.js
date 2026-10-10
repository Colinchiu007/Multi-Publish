'use strict'
/**
 * podcast-endpoints.js — 播客 RSS 分发端目录（CJS，主进程/Node 侧）
 *
 * 数据单一来源：podcast-endpoints.json。渲染端消费 podcast-endpoints.browser.js
 * （ESM 孪生版，读同一份 JSON），两侧导出同名同构（parity 回归锁定，
 * 先例 publish-capabilities / platform-definitions）。
 *
 * 目录条目不是发布平台：不参与登录判定、凭证采集与 publish-capabilities 的
 * titleMode 判定（见 podcast-endpoints.test.js 的隔离断言）。
 */

const data = require('./podcast-endpoints.json')
const { safeHttpUrl } = require('./safe-http-url')

const PODCAST_ENDPOINTS = Object.freeze(
  Object.fromEntries(Object.entries(data.endpoints).map(([id, meta]) => [
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

const ENDPOINT_ORDER = Object.freeze(Object.keys(data.endpoints))

function listPodcastEndpoints () {
  return ENDPOINT_ORDER.map((id) => PODCAST_ENDPOINTS[id])
}

function getPodcastEndpoint (id) {
  return PODCAST_ENDPOINTS[String(id || '')] || null
}

/** 提交地址必须过共享协议判据后才可用于渲染端锚点绑定。 */
function podcastEndpointHref (id) {
  const meta = getPodcastEndpoint(id)
  if (!meta || !meta.submitUrl) return null
  return safeHttpUrl(meta.submitUrl)
}

module.exports = {
  PODCAST_ENDPOINTS,
  ENDPOINT_ORDER,
  listPodcastEndpoints,
  getPodcastEndpoint,
  podcastEndpointHref
}
