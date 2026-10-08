import { describe, it, expect } from 'vitest'
import podcastEndpointsCjs from '../podcast-endpoints.js'
import { PLATFORM_LOGIN_URLS, PLATFORM_NAMES, PLATFORM_AUTH_HOSTS, PLATFORM_SESSION_COOKIE_MARKERS } from '../platform-definitions.js'
import { PLATFORM_PUBLISH_META } from '../publish-capabilities.js'

const {
  PODCAST_ENDPOINTS: CJS_MAP,
  ENDPOINT_ORDER: CJS_ORDER,
  listPodcastEndpoints,
  getPodcastEndpoint,
  podcastEndpointHref
} = podcastEndpointsCjs
import {
  PODCAST_ENDPOINTS as ESM_MAP,
  ENDPOINT_ORDER as ESM_ORDER,
  listPodcastEndpoints as esmList,
  getPodcastEndpoint as esmGet,
  podcastEndpointHref as esmHref
} from '../podcast-endpoints.browser.js'

describe('podcast-endpoints · 目录内容合同', () => {
  it('目录顺序与键一致，且至少含小宇宙/Apple/Spotify 三端', () => {
    expect(CJS_ORDER).toEqual(['xiaoyuzhou', 'apple_podcasts', 'spotify'])
    expect(listPodcastEndpoints().map((e) => e.id)).toEqual(CJS_ORDER)
  })

  it('小宇宙：App 内提交、无 web 提交地址、首次人工审核、逐期零操作', () => {
    const xy = getPodcastEndpoint('xiaoyuzhou')
    expect(xy.submitChannel).toBe('app')
    expect(xy.submitUrl).toBe(null)
    expect(xy.requiresManualFirstSubmit).toBe(true)
    expect(xy.steps.length).toBeGreaterThanOrEqual(4)
    expect(xy.timing).toContain('人工审核')
    expect(xy.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('每个条目必须有取证日期与证据，步骤为非空字符串', () => {
    for (const ep of listPodcastEndpoints()) {
      expect(ep.evidence.length).toBeGreaterThan(10)
      expect(ep.steps.every((s) => typeof s === 'string' && s.trim().length > 0)).toBe(true)
      expect(ep.name.length).toBeGreaterThan(0)
    }
  })

  it('未知 id 返回 null，不抛错', () => {
    expect(getPodcastEndpoint('not_exist')).toBe(null)
    expect(podcastEndpointHref('not_exist')).toBe(null)
    expect(podcastEndpointHref('xiaoyuzhou')).toBe(null)
  })
})

describe('podcast-endpoints · 提交地址协议判据', () => {
  it('有 submitUrl 的条目必须过共享 https 判据', () => {
    expect(podcastEndpointHref('apple_podcasts')).toBe('https://podcastsconnect.apple.com/')
    expect(podcastEndpointHref('spotify')).toBe('https://podcasters.spotify.com/')
  })
})

describe('podcast-endpoints · 与平台契约面隔离（防止被当成发布平台）', () => {
  it('分发端 id 不得出现在登录 URL 表、平台名表与发布能力注册表中', () => {
    for (const id of CJS_ORDER) {
      expect(Object.keys(PLATFORM_LOGIN_URLS)).not.toContain(id)
      expect(Object.keys(PLATFORM_NAMES)).not.toContain(id)
      expect(Object.keys(PLATFORM_PUBLISH_META)).not.toContain(id)
    }
    expect(Object.keys(PLATFORM_NAMES).length).toBe(15)
    expect(Object.keys(PLATFORM_PUBLISH_META).length).toBe(15)
  })

  it('分发端不得出现在会话标记/认证主机表（RSS 通道无凭证采集面）', () => {
    for (const id of CJS_ORDER) {
      expect(Object.keys(PLATFORM_SESSION_COOKIE_MARKERS)).not.toContain(id)
      expect(Object.keys(PLATFORM_AUTH_HOSTS)).not.toContain(id)
    }
  })
})

describe('podcast-endpoints · CJS/ESM 孪生 parity', () => {
  it('导出集合与内容逐字同构', () => {
    expect(Object.keys(podcastEndpointsCjs).sort()).toEqual(
      ['ENDPOINT_ORDER', 'PODCAST_ENDPOINTS', 'getPodcastEndpoint', 'listPodcastEndpoints', 'podcastEndpointHref'].sort()
    )
    expect(ESM_ORDER).toEqual(CJS_ORDER)
    expect(JSON.stringify(ESM_MAP)).toBe(JSON.stringify(CJS_MAP))
    expect(esmList().map((e) => e.submitChannel)).toEqual(listPodcastEndpoints().map((e) => e.submitChannel))
    expect(esmGet('xiaoyuzhou').steps).toEqual(getPodcastEndpoint('xiaoyuzhou').steps)
    expect(esmHref('apple_podcasts')).toBe(podcastEndpointHref('apple_podcasts'))
  })
})
