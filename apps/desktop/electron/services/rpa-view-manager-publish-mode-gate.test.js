// @ts-check
/**
 * RpaViewManager API-first 闸门：publishMode（§5.1 三态总闸）优先于 has_api（D5）。
 *
 * 背景：本路径此前只读 `apiRouter.shouldUseApi`（由 has_api 派生），
 * 完全无视 `publishMode` 字段。实测存在平台配了 `publishMode: dom-only`
 * 却 `has_api: true`（youtube / twitter / facebook），于是配置写的
 * 「只用 DOM」被绕过、仍进 API 轨。config/platforms.yaml 在 2026-10-06
 * 只修了 douyin / tencent_video 两处同类矛盾，rpa-view 侧这三个原封不动。
 *
 * 判据不写死平台名：mock getPublishMode/shouldUseApi 的任意组合，
 * 断言 publishMode 是唯一权威。将来配置再新增矛盾平台也会被覆盖。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

__enableElectronMock()

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), notify: vi.fn() }
__registerMock('./logger', log)

const getPublishMode = vi.fn()
const shouldUseApi = vi.fn()
const supportsApi = vi.fn()
const publishViaApi = vi.fn()
__registerMock('@multi-publish/api-publish-engine', {
  supportsApi,
  publishViaApi,
  apiRouter: { shouldUseApi, getPublishMode },
})

__registerMock('./auth-partition', {
  collectAuthPartitionCookies: vi.fn().mockResolvedValue({ cookieString: '', partition: null, count: 0 }),
})

let RpaViewManager

/**
 * 造一个能直接观察「走了哪条轨」的 manager。
 *
 * DOM 轨的分派在 `_publish_<platform>` / `_publish_generic` 那一层，且 youtube /
 * facebook 未必有专属方法，故桩在**通用分发点**上：`_execHook` 是所有平台
 * 发布必经的一跳（见文件头「平台发布逻辑」注释），桩它即可覆盖任意平台。
 * 只桩 _publish_generic 会让 youtube/facebook 这类无专属方法的平台落空。
 */
function armedManager () {
  const manager = new RpaViewManager()
  const win = { destroy: vi.fn() }
  // 窗口池化：publish 走 _acquireWindow 而非 _createWindow，两者都要桩，
  // 否则测试会停在窗口获取上（这正是最初两条用例失败的原因）。
  vi.spyOn(manager, '_createWindow').mockReturnValue(win)
  vi.spyOn(manager, '_acquireWindow').mockResolvedValue({ win, reused: true })
  vi.spyOn(manager, '_windowKey').mockReturnValue('k')
  vi.spyOn(manager, '_emitProgress').mockImplementation(() => {})
  const ran = vi.fn().mockResolvedValue({ success: true, platform: 'dom-track' })
  manager.__domTrack = ran
  vi.spyOn(manager, '_execHook').mockImplementation(ran)
  // DOM 轨的**权威**观测点：_acquireWindow —— API 轨不开窗口，DOM 轨必开。
  // （_execHook 只在配置了 preFill/prePublishHook 的平台上走，不是必经跳。）
  // 各平台专属 _publish_<platform> 与 _publish_generic 都要能观测 DOM 轨。
  // ⚠️ 这些方法由 rpa-view-platforms mixin 经 Object.assign 挂到原型上，
  // 因此**原型链上不止一层**——只遍历 getOwnPropertyNames(Object.getPrototypeOf(manager))
  // 会漏掉 mixin 贡献的方法（这正是最初两条用例失败的原因：桩没生效）。
  const noop = vi.fn().mockResolvedValue({ success: true, platform: 'dom-track' })
  let obj = manager
  const seen = new Set()
  while (obj && obj !== Object.prototype) {
    for (const k of Object.getOwnPropertyNames(obj)) {
      if (seen.has(k)) continue
      seen.add(k)
      if (k.startsWith('_publish_') && typeof manager[k] === 'function') {
        vi.spyOn(manager, k).mockImplementation(noop)
      }
    }
    obj = Object.getPrototypeOf(obj)
  }
  expect(vi.isMockFunction(manager._publish_generic)).toBe(true)
  return manager
}

/** 断言「走了 DOM 轨」：窗口被取用（DOM 轨必经），且 API 轨未被调用。 */
function expectDomTrack (manager) {
  expect(publishViaApi).not.toHaveBeenCalled()
  expect(manager._acquireWindow).toHaveBeenCalled()
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  supportsApi.mockReturnValue(true)
  publishViaApi.mockResolvedValue({ success: true, publishId: 'pid' })
  const module = await import('./rpa-view-manager.js')
  RpaViewManager = module.default || module
})

describe('RpaViewManager API-first 闸门：publishMode 优先于 has_api（D5）', () => {
  it('publishMode=dom-only 压过 has_api=true：不得进 API 轨', async () => {
    shouldUseApi.mockReturnValue(true)
    getPublishMode.mockReturnValue('dom-only')
    const manager = armedManager()
    await manager.publish('youtube', { title: 't', accountId: 'a' }, { cookies: 'c=1' }, 1000)
    expectDomTrack(manager)
  })

  it('publishMode=api-then-dom 压过 has_api=false：应进 API 轨', async () => {
    shouldUseApi.mockReturnValue(false)
    getPublishMode.mockReturnValue('api-then-dom')
    const manager = armedManager()
    await manager.publish('kuaishou', { title: 't', accountId: 'a' }, { cookies: 'c=1' }, 1000)
    expect(publishViaApi).toHaveBeenCalledTimes(1)
  })

  it('publishMode=api-only 同样进 API 轨', async () => {
    shouldUseApi.mockReturnValue(false)
    getPublishMode.mockReturnValue('api-only')
    const manager = armedManager()
    await manager.publish('bilibili', { title: 't', accountId: 'a' }, { cookies: 'c=1' }, 1000)
    expect(publishViaApi).toHaveBeenCalledTimes(1)
  })

  it('配置矛盾（publishMode 与 has_api 冲突）时必须留痕', async () => {
    shouldUseApi.mockReturnValue(true)
    getPublishMode.mockReturnValue('dom-only')
    const manager = armedManager()
    await manager.publish('facebook', { title: 't', accountId: 'a' }, { cookies: 'c=1' }, 1000)
    const warned = log.warn.mock.calls.some(([, event]) => event === 'publish-mode-overrides-has-api')
    expect(warned).toBe(true)
  })

  it('两字段一致时不产生矛盾告警（避免噪声掩盖真信号）', async () => {
    shouldUseApi.mockReturnValue(true)
    getPublishMode.mockReturnValue('api-then-dom')
    const manager = armedManager()
    await manager.publish('douyin', { title: 't', accountId: 'a' }, { cookies: 'c=1' }, 1000)
    const warned = log.warn.mock.calls.some(([, event]) => event === 'publish-mode-overrides-has-api')
    expect(warned).toBe(false)
  })

  it('账号配了代理时仍强制 DOM（既有语义不变，优先于 publishMode）', async () => {
    shouldUseApi.mockReturnValue(true)
    getPublishMode.mockReturnValue('api-then-dom')
    const manager = armedManager()
    await manager.publish('kuaishou', { title: 't', accountId: 'a' }, { cookies: 'c=1', proxy: 'http://p' }, 1000)
    expectDomTrack(manager)
  })
})