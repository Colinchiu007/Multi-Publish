/**
 * podcast IPC handler 合同锁
 *
 * 三条不可让的判据：
 * ① envelope 键名逐字对齐 preload/composable 合同（错一个键渲染层静默拿到 undefined）；
 * ② 服务返回 false（删除时 id 不存在）不得被包成 removed:true——那是「界面显示已删除而库里没动」；
 * ③ 失败返回体不得携带用户未发布的标题/音频地址/xml 正文（日志与响应同纪律）。
 *
 * event 传 `{}`：未打包应用（app.isPackaged === false）+ vitest 环境下 withSenderCheck 走
 * 兼容分支放行（见 helpers._isTestEnv）。⛔ 该放行依赖 helpers 在 **load 期** 解构到的
 * `app` 是 mock 对象，所以必须先 `__enableElectronMock()` 再动态 import 本模块 ——
 * 静态 import 会被提升到 `__enableElectronMock()` 之前，helpers 就绑到真实 electron
 * （`require('electron')` 在纯 Node 下返回二进制路径字符串，`app` 变 undefined，
 * 所有 handler 统一回 AUTH_ERROR -3，而测试看起来像「合同键名错了」）。
 * 先例：`account-batch-check.test.js:34`。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

__enableElectronMock()

/** @type {any} */
let registerHandlers
/** @type {any} */
let unwrapObject
/** @type {any} */
let toIpcError

beforeEach(async () => {
  vi.resetModules()
  __electronMock.app.isPackaged = false
  const mod = await import('./podcast')
  registerHandlers = mod.default || mod
  unwrapObject = mod.unwrapObject
  toIpcError = mod.toIpcError
})

const EC = require('../core/error-codes').ERROR

function makeIpcMain () {
  const handlers = new Map()
  return {
    handlers,
    handle: (channel, fn) => handlers.set(channel, fn),
  }
}

function makeService (overrides = {}) {
  return {
    getChannel: vi.fn(() => ({ title: '午间电台' })),
    saveChannel: vi.fn((c) => Object.assign({ id: 'ch' }, c)),
    listEpisodes: vi.fn(() => [{ id: 'ep-1' }]),
    saveEpisode: vi.fn((e) => Object.assign({ updatedAt: 'now' }, e)),
    removeEpisode: vi.fn(() => true),
    buildFeed: vi.fn(() => ({ path: 'C:/tmp/feed.xml', itemCount: 2, bytes: 1234 })),
    verifyFeed: vi.fn(async () => ({ issues: [], checks: [{ name: 'parse', ok: true }], itemCount: 2 })),
    listEndpoints: vi.fn(() => [{ id: 'xiaoyuzhou' }]),
    episodeCap: vi.fn(() => 1000),
    readFeedSync: vi.fn(() => null),
    writeFeedSync: vi.fn((p) => Object.assign({ updatedAt: 'now' }, p)),
    ...overrides,
  }
}

async function invoke (ipcMain, channel, payload) {
  return ipcMain.handlers.get(channel)({}, payload)
}

function setup (overrides) {
  const ipcMain = makeIpcMain()
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const service = makeService(overrides)
  registerHandlers(ipcMain, { podcastChannelService: service, log })
  return { ipcMain, service, log }
}

describe('podcast handler · 通道注册', () => {
  it('十三条通道全部注册（缺一条即渲染层拿到 "No handler registered"）', () => {
    const { ipcMain } = setup()
    expect([...ipcMain.handlers.keys()].sort()).toEqual([
      'podcast:channel:create', 'podcast:channel:get', 'podcast:channel:list',
      'podcast:channel:migrate:resolve', 'podcast:channel:rename',
      'podcast:channel:save', 'podcast:channel:setDefault',
      'podcast:endpoints:list', 'podcast:episode:list',
      'podcast:episode:remove', 'podcast:episode:save',
      'podcast:feed:build', 'podcast:feed:verify',
    ].sort())
  })

  it('注册阶段不得触碰 userData：未注入服务时也能完成注册，第一次调用才惰性建服务', () => {
    const ipcMain = makeIpcMain()
    expect(() => registerHandlers(ipcMain, { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })).not.toThrow()
    expect(ipcMain.handlers.size).toBe(13)
  })
})

describe('podcast handler · 成功信封', () => {
  it('每条通道都回 { code:0, data:{…} }，键名与合同逐字一致', async () => {
    const { ipcMain } = setup()
    expect(await invoke(ipcMain, 'podcast:channel:get')).toEqual({ code: 0, data: { channel: { title: '午间电台' } } })
    expect(await invoke(ipcMain, 'podcast:episode:list')).toEqual({ code: 0, data: { episodes: [{ id: 'ep-1' }], cap: 1000, count: 1 } })
    expect(await invoke(ipcMain, 'podcast:endpoints:list')).toEqual({ code: 0, data: { endpoints: [{ id: 'xiaoyuzhou' }] } })
    expect(await invoke(ipcMain, 'podcast:feed:build')).toEqual({ code: 0, data: { path: 'C:/tmp/feed.xml', itemCount: 2, bytes: 1234 } })
    const verified = await invoke(ipcMain, 'podcast:feed:verify')
    expect(verified).toEqual({ code: 0, data: { issues: [], checks: [{ name: 'parse', ok: true }], itemCount: 2 } })
    // xml 正文不得出现在任何返回值里（feed 里含用户未发布标题）
    expect(JSON.stringify(verified)).not.toContain('xml')
  })

  it('保存频道：两种载荷形状（对象本体 / {channel:…}）都收到同一个对象', async () => {
    const { ipcMain, service } = setup()
    await invoke(ipcMain, 'podcast:channel:save', { title: 'A' })
    await invoke(ipcMain, 'podcast:channel:save', { channel: { title: 'B' } })
    expect(service.saveChannel.mock.calls.map((c) => c[0])).toEqual([{ title: 'A' }, { title: 'B' }])
  })

  it('删除单集：字符串与 {id:…} 两种载荷都按 id 转交服务', async () => {
    const { ipcMain, service } = setup()
    await invoke(ipcMain, 'podcast:episode:remove', 'ep-1')
    await invoke(ipcMain, 'podcast:episode:remove', { id: 'ep-2' })
    expect(service.removeEpisode.mock.calls.map((c) => c[0])).toEqual(['ep-1', 'ep-2'])
  })
})

describe('podcast handler · 失败映射', () => {
  it('服务判定 false（id 不存在）→ NOT_FOUND，绝不回 removed:true', async () => {
    const { ipcMain } = setup({ removeEpisode: vi.fn(() => false) })
    const res = await invoke(ipcMain, 'podcast:episode:remove', 'missing')
    expect(res.code).toBe(EC.NOT_FOUND)
    expect(res.removed).toBeUndefined()
    expect(res.data).toBeUndefined()
  })

  it('空 id 直接拒绝，且不进服务（防把「没传参」变成「删掉了别的东西」）', async () => {
    const { ipcMain, service } = setup()
    const res = await invoke(ipcMain, 'podcast:episode:remove', '   ')
    expect(res.code).toBe(EC.VALIDATION_ERROR)
    expect(service.removeEpisode).not.toHaveBeenCalled()
  })

  it('校验失败：issues 原样透传，message 只含校验码，不含用户文本', async () => {
    const issues = [{ code: 'CHANNEL_TITLE_REQUIRED', field: 'title', message: '频道标题不能为空' }]
    const err = new Error('PODCAST_CHANNEL_INVALID: CHANNEL_TITLE_REQUIRED')
    err.code = 'PODCAST_CHANNEL_INVALID'
    err.issues = issues
    const { ipcMain, log } = setup({ saveChannel: vi.fn(() => { throw err }) })
    const res = await invoke(ipcMain, 'podcast:channel:save', { title: '用户的私密标题' })
    expect(res.code).toBe(EC.VALIDATION_ERROR)
    expect(res.issues).toEqual(issues)
    expect(JSON.stringify(res)).not.toContain('用户的私密标题')
    // 日志同样只记通道名 + 错误消息
    const logged = log.warn.mock.calls.map((c) => String(c[0])).join('|')
    expect(logged).toContain('[ipc:podcast] channel:save')
    expect(logged).not.toContain('用户的私密标题')
  })

  it('无 issues 的服务错误按码分档：损坏/超限/非法 → 校验错，其它 → 请求错', async () => {
    for (const [code, expected] of [
      ['PODCAST_STORE_CORRUPT', EC.VALIDATION_ERROR],
      ['PODCAST_EPISODES_FULL', EC.VALIDATION_ERROR],
      ['PODCAST_FEED_NOT_BUILT', EC.REQUEST_ERROR],
    ]) {
      const err = new Error(code)
      err.code = code
      expect(toIpcError(err).code).toBe(expected)
    }
  })
})

describe('podcast handler · unwrapObject 形状判据', () => {
  it('数组与非对象一律判缺失（交给服务/引擎出 CHANNEL_MISSING，不在本层另写判据）', () => {
    expect(unwrapObject([], 'channel')).toBeNull()
    expect(unwrapObject(null, 'channel')).toBeNull()
    expect(unwrapObject('x', 'channel')).toBeNull()
    expect(unwrapObject({ channel: ['a'] }, 'channel')).toBeNull()
    expect(unwrapObject({ title: 'A' }, 'channel')).toEqual({ title: 'A' })
  })
})
