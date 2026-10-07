/**
 * creator-collector-runtime.js — 真正发起网络调用的采集器
 *
 * 与 `creator-collector.js`（纯解析，无网络）分工：
 *   · creator-collector      把用户输入解析成 canonical channelId
 *   · creator-collector-runtime  用 canonical ID / videoId 去取真实数据
 *
 * 依赖全部注入，便于在无网络、无凭证环境完整测试。
 */

'use strict'

const { CREATOR_INPUT_ERRORS, YOUTUBE_API_BASE } = require('./creator-collector')
const { DEFAULT_COLLECT_PAGE_SIZE, classifyContentQuality } = require('./creator-content-quality')

/** 默认注入实现：仅用 Node 内置 https，避免为一次 GET 引入依赖 */
function defaultHttpGet (url, params) {
  // eslint-disable-next-line global-require
  const https = require('https')
  const qs = Object.entries(params || {}).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  const full = `${url}${url.includes('?') ? '&' : '?'}${qs}`
  return new Promise((resolve, reject) => {
    https.get(full, (res) => {
      let raw = ''
      res.on('data', (d) => { raw += d })
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(raw) } catch (_) { /* 非 JSON 留给上层按状态码分级 */ }
        if (res.statusCode >= 400) {
          const err = new Error(`HTTP ${res.statusCode}`)
          err.response = { status: res.statusCode, data: json }
          reject(err)
          return
        }
        resolve(json)
      })
    }).on('error', reject)
  })
}

function createCreatorCollector (deps = {}) {
  const {
    credentialProvider,          // () => { apiKey, pythonBridge } | null
    httpGet = defaultHttpGet,
    listPostsImpl,               // 可覆盖（测试/未来自实现）
    bodyImpl,                    // 可覆盖
    log,
  } = deps

  function credentials () {
    const c = typeof credentialProvider === 'function' ? credentialProvider() : null
    if (!c || !c.apiKey) {
      const e = new Error('未配置 YouTube API Key')
      e.code = CREATOR_INPUT_ERRORS.CREDENTIAL_MISSING
      throw e
    }
    return c
  }

  /** 取频道 uploads 播放列表里的最新作品（探测阶段不取正文） */
  async function listPosts (channelId) {
    if (typeof listPostsImpl === 'function') return listPostsImpl(channelId)
    const { apiKey } = credentials()
    // uploads 播放列表 ID = 'UU' + channelId.slice(2)
    const uploads = 'UU' + String(channelId).slice(2)
    const json = await httpGet(`${YOUTUBE_API_BASE}/playlistItems`, {
      part: 'snippet', playlistId: uploads, maxResults: DEFAULT_COLLECT_PAGE_SIZE, key: apiKey,
    })
    const items = Array.isArray(json && json.items) ? json.items : []
    return items.map((it) => {
      const sn = it.snippet || {}
      const vid = (it.contentDetails && it.contentDetails.videoId) || it.id || ''
      return {
        externalId: vid,
        title: sn.title || '',
        url: vid ? `https://www.youtube.com/watch?v=${vid}` : '',
        thumbnailUrl: (sn.thumbnails && (sn.thumbnails.medium || sn.thumbnails.default || {}).url) || '',
        publishedAt: sn.publishedAt || null,
        contentQuality: classifyContentQuality(null, sn.description || ''),
        description: sn.description || '',
      }
    }).filter((x) => x.externalId)
  }

  /** 取正文：有字幕走字幕，无字幕回落描述，并给出内容质量等级 */
  async function collectBody (externalId) {
    if (typeof bodyImpl === 'function') return bodyImpl(externalId)
    const creds = credentials()
    const bridge = creds.pythonBridge
    let content = ''
    let transcriptSource = 'description'
    if (bridge && typeof bridge.requestBackend === 'function') {
      try {
        const r = await bridge.requestBackend('POST', '/aggregation/collect', { url: `https://www.youtube.com/watch?v=${externalId}` })
        if (r && r.content) {
          content = String(r.content)
          transcriptSource = (r.metadata && r.metadata.transcript_source) || 'description'
        }
      } catch (e) {
        // 字幕抓取失败**不算博主级故障**：降级到描述即可，不该把监控停掉
        if (log && log.warn) log.warn('[creator] 字幕获取失败，降级为描述', (e && e.message) || e)
      }
    }
    return {
      content,
      transcriptSource,
      contentQuality: classifyContentQuality(transcriptSource, content),
    }
  }

  return { listPosts, collectBody }
}

module.exports = { createCreatorCollector, defaultHttpGet }