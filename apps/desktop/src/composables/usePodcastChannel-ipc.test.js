/**
 * 播客频道 IPC 单轨链路的行为锁（走**真实桥接层**，不 mock 桥接）
 *
 * 为什么必须有这个文件：渲染层取用点从 composable 下沉到 src/api/podcast-channel.js
 * 之后，check-frontend-consistency 只会数「字面量出现没有」，数不出「调用还通不通」。
 * 本仓实测踩过「全绿但链路是断的」（跨包夹具替对方剥壳那一类），所以这里把三种
 * 结果语义逐个跑出来：命名空间缺失 / 方法缺失 / handler 抛错 / 返回非对象。
 *
 * 接缝纪律：只 mock `window.electronAPI`（preload 的暴露面），桥接层与 composable
 * 都用真实实现 —— 摘掉桥接层的 available 判定，本文件立刻红。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { reactive } from 'vue'

const seenArgs = []

function makeFakeApi () {
  return {
    podcast: {
      channelGet: vi.fn(async (...args) => { seenArgs.push(args); return { ok: true, channel: null } }),
      channelSave: vi.fn(async (...args) => { seenArgs.push(args); return { ok: true, channel: args[0] } }),
      episodeList: vi.fn(async (...args) => { seenArgs.push(args); return { ok: true, episodes: [] } }),
    },
  }
}

describe('podcast-channel 桥接层：available 语义与脱壳', () => {
  beforeEach(() => {
    seenArgs.length = 0
    vi.resetModules()
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('命名空间存在时原样带出主进程返回值，并标记 available', async () => {
    vi.stubGlobal('window', { electronAPI: makeFakeApi() })
    const { channelGet } = await import('@/api/podcast-channel')
    expect(await channelGet()).toEqual({ available: true, result: { ok: true, channel: null } })
  })

  it('podcast 命名空间缺失 → available:false，且一个方法都不被调用', async () => {
    vi.stubGlobal('window', { electronAPI: {} })
    const { channelGet } = await import('@/api/podcast-channel')
    expect(await channelGet()).toEqual({ available: false })
  })

  it('命名空间在、方法名不在 → available:false（与 handler 抛错区分开）', async () => {
    vi.stubGlobal('window', { electronAPI: { podcast: {} } })
    const { feedBuild } = await import('@/api/podcast-channel')
    expect(await feedBuild()).toEqual({ available: false })
  })

  it('reactive 载荷经桥接层后，暴露面收到的必须是 plain object（脱壳真实发生）', async () => {
    const fake = makeFakeApi()
    vi.stubGlobal('window', { electronAPI: fake })
    const { channelSave } = await import('@/api/podcast-channel')
    const form = reactive({ title: '午间电台', settings: { language: 'zh-CN' } })

    await channelSave(form)

    expect(fake.podcast.channelSave).toHaveBeenCalledTimes(1)
    const [passed] = seenArgs[0]
    expect(passed).not.toBe(form)
    expect(Object.getPrototypeOf(passed)).toBe(Object.prototype)
    expect(passed).toEqual({ title: '午间电台', settings: { language: 'zh-CN' } })
  })

  it('handler reject 原样向上抛，桥接层不吞成 available:false', async () => {
    vi.stubGlobal('window', {
      electronAPI: { podcast: { feedVerify: vi.fn(async () => { throw new Error('boom') }) } },
    })
    const { feedVerify } = await import('@/api/podcast-channel')
    await expect(feedVerify()).rejects.toThrow('boom')
  })
})

describe('usePodcastChannel：桥接结果到用户可见错误码的映射', () => {
  beforeEach(() => {
    seenArgs.length = 0
    vi.resetModules()
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('主进程可达时落地数据、错误位清空', async () => {
    vi.stubGlobal('window', { electronAPI: makeFakeApi() })
    const { usePodcastChannel } = await import('./usePodcastChannel')
    const s = usePodcastChannel()

    await s.loadEpisodes()

    expect(s.episodesError.value).toBe('')
    expect(s.episodes.value).toEqual([])
    expect(s.episodesLoaded.value).toBe(true)
  })

  it('命名空间缺失 → PODCAST_IPC_UNAVAILABLE（不是把状态抹成空列表假装成功）', async () => {
    vi.stubGlobal('window', { electronAPI: {} })
    const { usePodcastChannel, IPC_UNAVAILABLE } = await import('./usePodcastChannel')
    const s = usePodcastChannel()

    const res = await s.loadChannel()

    expect(res.code).toBe(IPC_UNAVAILABLE)
    expect(s.channelError.value).toBe(IPC_UNAVAILABLE)
    expect(s.channelLoaded.value).toBe(true)
  })

  it('handler 抛错 → PODCAST_IPC_EXCEPTION 并保留原始 message', async () => {
    vi.stubGlobal('window', {
      electronAPI: { podcast: { episodeList: vi.fn(async () => { throw new Error('db locked') }) } },
    })
    const { usePodcastChannel, IPC_EXCEPTION } = await import('./usePodcastChannel')
    const s = usePodcastChannel()

    const res = await s.loadEpisodes()

    expect(res.code).toBe(IPC_EXCEPTION)
    expect(res.message).toContain('db locked')
    expect(s.episodesError.value).toBe(IPC_EXCEPTION)
  })

  it('主进程返回非对象（契约破坏）→ PODCAST_IPC_EXCEPTION，不得退化成空数据', async () => {
    vi.stubGlobal('window', {
      electronAPI: { podcast: { episodeList: vi.fn(async () => 'ok') } },
    })
    const { usePodcastChannel, IPC_EXCEPTION } = await import('./usePodcastChannel')
    const s = usePodcastChannel()

    expect((await s.loadEpisodes()).code).toBe(IPC_EXCEPTION)
  })
})

describe('IPC 单轨制结构锁', () => {
  const METHODS = [
    'channelGet', 'channelSave', 'episodeList', 'episodeSave',
    'episodeRemove', 'feedBuild', 'feedVerify', 'endpointList',
  ]

  it('composable 源码不再出现桌面端暴露面字面量，取用点只在 src/api', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const root = path.resolve(process.cwd(), 'src')
    const src = fs.readFileSync(path.join(root, 'composables', 'usePodcastChannel.js'), 'utf8')
    expect(src).not.toMatch(/electronAPI/)

    const bridge = fs.readFileSync(path.join(root, 'api', 'podcast-channel.js'), 'utf8')
    // 每条路径的首参必须是**方法名字面量**：ipc-exposure-contract 的静态对账按字面量抽名，
    // 经辅助函数转发成变量就变成「生产侧动态取名」，该文件会当场红（本仓 C-1 同形态）。
    for (const m of METHODS) expect(bridge).toContain(`invokeNamespace(NS, '${m}'`)
    expect(bridge).not.toMatch(/invokeNamespace\(\s*NS\s*,\s*[^'"\s]/)
  })

  it('桥接层导出的 8 个名字与 preload 暴露面逐字一致（防改名漂移）', async () => {
    const api = await import('@/api/podcast-channel')
    expect(Object.keys(api).sort()).toEqual([...METHODS].sort())
  })
})
