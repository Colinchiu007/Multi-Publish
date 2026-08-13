// @vitest-environment node
'use strict'
/**
 * PipelineCardBackgrounds 服务测试
 * 覆盖：provider 解析、生成/缓存复用、force 刷新、安全下载（HTTPS/SSRF/content-type/大小）、
 *      并发上限、批量/名称校验、manifest 读写、loopback 静态服务边界。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { PipelineCardBackgrounds, VALID_NAME_RE } = require('./pipeline-card-backgrounds')

function makeResponse (body, { status = 200, contentType = 'image/png' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => Buffer.from(body),
  }
}

function makeManager ({ provider = { id: 'minimax-image', is_configured: true, enabled: true }, urls = ['https://203.0.113.10/img.png'] } = {}) {
  const calls = []
  return {
    calls,
    getDefault: vi.fn(async (category) => (category === 'image' ? provider : null)),
    listProviders: vi.fn(async () => []),
    callAdapter: vi.fn(async (id, method, params) => {
      calls.push({ id, method, params })
      if (method !== 'generateImage') throw new Error('unexpected method ' + method)
      return { urls, format: 'url' }
    }),
  }
}

function makeService (overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-card-bg-'))
  const svc = new PipelineCardBackgrounds({
    userDataDir: root,
    manager: makeManager(),
    fetchImpl: async () => makeResponse('PNG-DATA'),
    resolveAddress: async () => ({ address: '203.0.113.10', family: 4 }),
    now: () => 1_000_000_000,
    ...overrides,
  })
  return { svc, root }
}

describe('PipelineCardBackgrounds 服务', () => {
  let ctx
  beforeEach(() => { ctx = makeService() })
  afterEach(async () => {
    await ctx.svc.stop()
    fs.rmSync(ctx.root, { recursive: true, force: true })
  })

  it('无可用 provider 时返回 available:false 且不触发生成', async () => {
    const { svc } = makeService({ manager: makeManager({ provider: null }) })
    const res = await svc.ensure({ names: ['cinematic'] })
    expect(res.available).toBe(false)
    expect(res.backgrounds).toEqual({})
    expect(res.generated).toEqual([])
    expect(res.failed).toEqual([])
  })

  it('首次生成：调用 generateImage、下载图片、写缓存并返回 generated URL', async () => {
    const manager = makeManager()
    const { svc, root } = makeService({ manager })
    await svc.start()
    const res = await svc.ensure({ names: ['cinematic'] })
    expect(manager.calls).toHaveLength(1)
    expect(manager.calls[0].method).toBe('generateImage')
    expect(manager.calls[0].params.prompt).toContain('soft film lens light flare')
    expect(manager.calls[0].params.prompt).toContain('Minimalist premium')
    expect(manager.calls[0].params.size).toBe('1280x720')
    expect(res.available).toBe(true)
    expect(res.generated).toEqual(['cinematic'])
    expect(res.cached).toEqual([])
    expect(res.backgrounds.cinematic.status).toBe('generated')
    expect(res.backgrounds.cinematic.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/pipeline-card-bg\/[A-Za-z0-9_-]{16,}$/)
    const file = path.join(root, 'pipeline-card-bg', 'cinematic.png')
    expect(fs.existsSync(file)).toBe(true)
    expect(fs.readFileSync(file, 'utf8')).toBe('PNG-DATA')
  })

  it('缓存复用：已生成过不再调用生成 API', async () => {
    const manager = makeManager()
    const { svc } = makeService({ manager })
    await svc.start()
    await svc.ensure({ names: ['cinematic'] })
    manager.calls.length = 0
    const res = await svc.ensure({ names: ['cinematic'] })
    expect(manager.calls).toHaveLength(0)
    expect(res.cached).toEqual(['cinematic'])
    expect(res.backgrounds.cinematic.status).toBe('cached')
  })

  it('force=true 强制重新生成', async () => {
    const manager = makeManager()
    const { svc } = makeService({ manager })
    await svc.start()
    await svc.ensure({ names: ['cinematic'] })
    manager.calls.length = 0
    const res = await svc.ensure({ names: ['cinematic'], force: true })
    expect(manager.calls).toHaveLength(1)
    expect(res.generated).toEqual(['cinematic'])
  })

  it('缓存文件丢失时按未缓存重新生成', async () => {
    const manager = makeManager()
    const { svc, root } = makeService({ manager })
    await svc.start()
    await svc.ensure({ names: ['cinematic'] })
    fs.unlinkSync(path.join(root, 'pipeline-card-bg', 'cinematic.png'))
    manager.calls.length = 0
    const res = await svc.ensure({ names: ['cinematic'] })
    expect(manager.calls).toHaveLength(1)
    expect(res.generated).toEqual(['cinematic'])
  })

  it('非法名称抛 ValidationError：空串/非法字符/超长/非字符串', async () => {
    const { svc } = ctx
    for (const bad of ['', 'a b', 'a/b', 'a..b', 'x'.repeat(81), 42, null, undefined]) {
      await expect(svc.ensure({ names: [bad] })).rejects.toThrow(/流水线名称/)
    }
  })

  it('批量超过上限抛 ValidationError', async () => {
    const { svc } = ctx
    await expect(svc.ensure({ names: Array.from({ length: 51 }, (_, i) => 'p' + i) })).rejects.toThrow(/数量/)
  })

  it('非 HTTPS 下载目标被拒绝并记为 failed，不影响其他卡', async () => {
    const manager = makeManager()
    manager.callAdapter = vi.fn(async (id, method, params) => {
      const urls = params.prompt.includes('waveform')
        ? ['https://203.0.113.10/talking.png']
        : ['http://203.0.113.10/cinematic.png']
      return { urls, format: 'url' }
    })
    const { svc } = makeService({ manager })
    const res = await svc.ensure({ names: ['cinematic', 'talking-head'] })
    expect(res.failed.map(f => f.name)).toContain('cinematic')
    expect(res.backgrounds['talking-head']).toBeDefined()
    expect(res.backgrounds.cinematic).toBeUndefined()
  })

  it('下载目标解析到私有地址被拒绝（SSRF）', async () => {
    const manager = makeManager({ urls: ['https://evil.example/img.png'] })
    const { svc } = makeService({ manager, resolveAddress: async () => ({ address: '10.0.0.5', family: 4 }) })
    const res = await svc.ensure({ names: ['cinematic'] })
    expect(res.failed[0].message).toMatch(/私有|内网|loopback|不允许/i)
  })

  it('非图片 Content-Type 被拒绝', async () => {
    const manager = makeManager({ urls: ['https://203.0.113.10/evil.txt'] })
    const { svc } = makeService({ manager, fetchImpl: async () => makeResponse('NOT-IMAGE', { contentType: 'text/html' }) })
    const res = await svc.ensure({ names: ['cinematic'] })
    expect(res.failed[0].message).toMatch(/content-type|图片/i)
  })

  it('超过大小上限的图片被拒绝', async () => {
    const manager = makeManager()
    const { svc } = makeService({ manager, fetchImpl: async () => makeResponse('x'.repeat(1024)), maxBytes: 512 })
    const res = await svc.ensure({ names: ['cinematic'] })
    expect(res.failed[0].message).toMatch(/大小|exceed/i)
  })

  it('并发生成不超过 maxConcurrent', async () => {
    const manager = makeManager()
    let active = 0
    let peak = 0
    manager.callAdapter = vi.fn(async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(r => setTimeout(r, 30))
      active -= 1
      return { urls: ['https://203.0.113.10/img.png'], format: 'url' }
    })
    const { svc } = makeService({ manager, maxConcurrent: 2 })
    const res = await svc.ensure({ names: ['a', 'b', 'c', 'd', 'e'] })
    expect(peak).toBeLessThanOrEqual(2)
    expect(res.generated).toHaveLength(5)
  })

  it('生成异常按卡记录 failed，不中断整批', async () => {
    const manager = makeManager()
    manager.callAdapter = vi.fn(async (id, method, params) => {
      if (params.prompt.includes('waveform')) throw new Error('provider boom')
      return { urls: ['https://203.0.113.10/img.png'], format: 'url' }
    })
    const { svc } = makeService({ manager })
    const res = await svc.ensure({ names: ['cinematic', 'talking-head'] })
    expect(res.failed.map(f => f.name)).toEqual(['talking-head'])
    expect(res.generated).toEqual(['cinematic'])
  })

  it('静态服务：GET 返回图片内容与 nosniff，未知 token 与非法方法 404', async () => {
    const manager = makeManager()
    const { svc } = makeService({ manager })
    await svc.start()
    const res = await svc.ensure({ names: ['cinematic'] })
    const url = res.backgrounds.cinematic.url

    const ok = await fetch(url)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await ok.text()).toBe('PNG-DATA')

    const missing = await fetch(url.replace(/[A-Za-z0-9_-]{16,}$/, 'x'.repeat(16)))
    expect(missing.status).toBe(404)

    const serverOrigin = url.slice(0, url.indexOf('/pipeline-card-bg/'))
    const post = await fetch(serverOrigin + '/pipeline-card-bg/' + url.split('/').pop(), { method: 'POST' })
    expect(post.status).toBe(404)
  })

  it('manifest 损坏时安全重建（不抛错）', async () => {
    const manager = makeManager()
    const { svc, root } = makeService({ manager })
    fs.mkdirSync(path.join(root, 'pipeline-card-bg'), { recursive: true })
    fs.writeFileSync(path.join(root, 'pipeline-card-bg', 'manifest.json'), '{broken json')
    const res = await svc.ensure({ names: ['cinematic'] })
    expect(res.generated).toEqual(['cinematic'])
  })

  it('VALID_NAME_RE 只接受白名单字符', () => {
    expect(VALID_NAME_RE.test('story2video-compose')).toBe(true)
    expect(VALID_NAME_RE.test('A_B-1')).toBe(true)
    expect(VALID_NAME_RE.test('a b')).toBe(false)
    expect(VALID_NAME_RE.test('a/b')).toBe(false)
    expect(VALID_NAME_RE.test('a.b')).toBe(false)
  })
})
