// @ts-check
/**
 * publish-monitor.test.js — 发布后回查的运行态装配锁
 *
 * 立项动因（2026-10-07）：`publish-monitor.js` 此前**没有任何测试文件**。
 * #2927（B 站回查端点）与 #2968（发布侧 bvid 采集）都只在被调模块自己那侧建了锁
 * （`bilibili-audit-check.test.js` 直接调用该函数），于是「monitor 收到 postId 时，
 * 到底有没有把 postId 与列表端点交给专用实现」这一段从未被执行过 —— 属
 * 「注册 ≠ 注入 ≠ 生效」的第三种落点：分派点存在，但没人从装配入口跑过一次。
 *
 * 口径：装的是**真实现**（真 `checkPublishStatus` + 真 `checkBilibiliAuditStatus`），
 * 只把传输层 `axios.get` 的 host 换成本机回显 HTTP 服务（loopback，出站守卫放行），
 * 因此 nav→列表 的顺序、Cookie/Referer、端点来源、状态判据全部逐字真跑。
 * 规约见 AGENTS.md QM-2「测试层禁止真实出站」与 01-docs/learnings.md「跨模块契约要注入真实现」。
 */
const http = require('node:http')
const axios = require('axios')

const BVID = 'BV1xx411c79D'

// 必须在 vi.useFakeTimers() 之前抓住真实定时器句柄：轮询本身由假时钟驱动，
// 但每次 poll 内部的两次 HTTP 是真实 I/O，需要真实事件循环回合才能落定
const realSetTimeout = setTimeout
const flush = (ms = 150) => new Promise(resolve => realSetTimeout(resolve, ms))

let server = null
let baseUrl = ''
let requests = []
let scripted = []

function startServer () {
  return new Promise(resolve => {
    server = http.createServer((req, res) => {
      requests.push({ url: req.url, cookie: req.headers.cookie || '', referer: req.headers.referer || '' })
      const next = scripted.shift()
      if (!next) { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{}'); return }
      const body = next && next.__delay ? next.body : next
      const send = () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
      if (next && next.__delay) realSetTimeout(send, next.__delay); else send()
    })
    server.listen(0, '127.0.0.1', () => { baseUrl = 'http://127.0.0.1:' + server.address().port; resolve() })
  })
}

const originalGet = axios.get

function installTransportSeam () {
  // 只改 host，保留 path+query：真实代码算出来的端点必须原样到达本机回显服务，
  // 否则「pollUrl 是否真的被用上了」这一整类断链无法表示
  axios.get = (url, config) => {
    const parsed = new URL(url)
    // 必须显式钉住 node http 适配器：本套件的 axios 默认会选 XHR（jsdom），而 XHR 按浏览器规则
    // **静默丢弃手工设置的 Cookie 头**、并把 Referer 换成页面 origin —— 那会让「凭证是否随请求带走」
    // 这类断言结构性失效（实测 cookie='' referer='http://localhost:3000/'）
    return originalGet.call(axios, baseUrl + parsed.pathname + parsed.search, Object.assign({}, config, { adapter: 'http' }))
  }
}

const archiveEnvelope = archive => ({ code: 0, message: '0', data: { arc_audits: [{ Archive: archive, Review: null }] } })

describe('publish-monitor — B 站专用分派的装配锁', () => {
  beforeAll(async () => { await startServer(); installTransportSeam() })
  afterAll(() => { axios.get = originalGet; if (server) server.close() })
  beforeEach(() => { requests = []; scripted = []; vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const load = async () => await import('./publish-monitor')

  it('T1 真实现端到端：nav 通过后用列表端点命中 bvid，回调收到 published 且带 raw', async () => {
    scripted = [
      { code: 0, data: { mid: 12345 } },
      archiveEnvelope({ bvid: BVID, aid: 170001, state: 0, primary_state: 0 }),
    ]
    const { createMonitorTask } = await load()
    const callback = vi.fn()
    const task = createMonitorTask({ platform: 'bilibili', postId: BVID, cookies: 'SESSDATA=abc', callback })
    await vi.advanceTimersByTimeAsync(10000)
    await flush()
    task.stop()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0].status).toBe('published')
    expect(callback.mock.calls[0][0].postId).toBe(BVID)
    expect(callback.mock.calls[0][0].raw.Archive.bvid).toBe(BVID)

    // 两跳顺序与凭证头都是真跑出来的：第一跳必须是 nav，第二跳必须是 CHECK_URLS 里那个列表端点
    expect(requests).toHaveLength(2)
    expect(requests[0].url).toContain('/x/web-interface/nav')
    expect(requests[1].url).toContain('/x/web/archives')
    expect(requests[0].cookie).toBe('SESSDATA=abc')
    expect(requests[1].cookie).toBe('SESSDATA=abc')
    expect(requests[1].referer).toContain('member.bilibili.com')
  })

  it('T2 pollUrl 真的是列表端点来源：改 CHECK_URLS 的 bilibili 项后第二跳必须随之改变', async () => {
    scripted = [{ code: 0, data: { mid: 1 } }, archiveEnvelope({ bvid: BVID, state: 0, primary_state: 0 })]
    const mod = await load()
    const original = mod.CHECK_URLS.bilibili
    mod.CHECK_URLS.bilibili = 'https://member.bilibili.com/x/other/archives'
    try {
      const callback = vi.fn()
      const task = mod.createMonitorTask({ platform: 'bilibili', postId: BVID, cookies: 'SESSDATA=abc', callback })
      await vi.advanceTimersByTimeAsync(10000)
      await flush()
      task.stop()
      expect(requests[1].url).toContain('/x/other/archives')
      expect(callback.mock.calls[0][0].status).toBe('published')
    } finally {
      mod.CHECK_URLS.bilibili = original
    }
  })

  it('T3 命中但 state 未观测 ⇒ 无定论，不回调终态，耗尽后回调 timeout 且带 reason', async () => {
    scripted = [
      { code: 0, data: { mid: 1 } },
      archiveEnvelope({ bvid: BVID, state: 13, primary_state: 0 }),
    ]
    const { createMonitorTask } = await load()
    const callback = vi.fn()
    const task = createMonitorTask({ platform: 'bilibili', postId: BVID, cookies: 'SESSDATA=abc', callback, maxRetries: 2 })
    await vi.advanceTimersByTimeAsync(10000)
    await flush()
    await vi.advanceTimersByTimeAsync(10000)
    await flush()
    task.stop()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0].status).toBe('timeout')
  })

  it('T4 无凭证不发请求：cookies 缺失时零 HTTP，且不得判成失效', async () => {
    const { createMonitorTask } = await load()
    const callback = vi.fn()
    const task = createMonitorTask({ platform: 'bilibili', postId: BVID, cookies: '', callback, maxRetries: 1 })
    await vi.advanceTimersByTimeAsync(10000)
    await flush()
    task.stop()
    expect(requests).toHaveLength(0)
    expect(callback.mock.calls[0][0].status).toBe('timeout')
  })

  it('T5 nav 不成会话（拿不到 mid）⇒ 不猜列表主体，零第二跳', async () => {
    scripted = [{ code: -101, message: 'NOTLOGIN' }]
    const { createMonitorTask } = await load()
    const callback = vi.fn()
    const task = createMonitorTask({ platform: 'bilibili', postId: BVID, cookies: 'SESSDATA=abc', callback, maxRetries: 1 })
    await vi.advanceTimersByTimeAsync(10000)
    await flush()
    task.stop()
    expect(requests).toHaveLength(1)
    expect(callback.mock.calls[0][0].status).toBe('timeout')
  })

  it('T6 未登记平台直接 skipped 且一次 HTTP 都不发（kuaishou 从表里移除后的既有语义）', async () => {
    const { createMonitorTask, CHECK_URLS } = await load()
    expect(CHECK_URLS.kuaishou).toBeUndefined()
    const callback = vi.fn()
    const task = createMonitorTask({ platform: 'kuaishou', postId: 'x', cookies: 'c', callback })
    await vi.advanceTimersByTimeAsync(20000)
    await flush()
    task.stop()
    expect(callback.mock.calls[0][0].status).toBe('skipped')
    expect(requests).toHaveLength(0)
  })

  it('T7 通用平台仍是 GET + params.id + Cookie（防「专用化」时顺手改掉别人的形状）', async () => {
    scripted = [{ code: 0, data: { list: [{ id: '987', status: 'published' }] } }]
    const { createMonitorTask } = await load()
    const callback = vi.fn()
    const task = createMonitorTask({ platform: 'weibo', postId: '987', cookies: 'SUB=x', callback })
    await vi.advanceTimersByTimeAsync(10000)
    await flush()
    task.stop()
    const mine = requests.filter(r => r.url.includes('/ajax/statuses/mymblog'))
    expect(mine).toHaveLength(1)
    expect(mine[0].url).toContain('id=987')
    expect(mine[0].cookie).toBe('SUB=x')
    expect(callback.mock.calls[0][0].status).toBe('published')
  })

  it('T8 请求在途时 stop() ⇒ 迟到的轮询不得再回调（cancelled 守卫，非仅 clearTimeout）', async () => {
    scripted = [
      { __delay: 80, body: { code: 0, data: { mid: 1 } } },
      archiveEnvelope({ bvid: BVID, state: 0, primary_state: 0 }),
    ]
    const { createMonitorTask } = await load()
    const callback = vi.fn()
    const task = createMonitorTask({ platform: 'bilibili', postId: BVID, cookies: 'SESSDATA=abc', callback, maxRetries: 5 })
    await vi.advanceTimersByTimeAsync(10000)
    task.stop()
    await flush(300)
    expect(callback).not.toHaveBeenCalled()
  })
})
