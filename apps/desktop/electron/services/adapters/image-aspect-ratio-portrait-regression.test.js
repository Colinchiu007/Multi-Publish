// @ts-check
/**
 * image-aspect-ratio-portrait-regression.test.js — 竖屏出图行为锁（2026-10-06 回归）
 *
 * ## 场景
 *
 * 项目 mur2tzc8_ru1r：Story2Video 输出分辨率选 720x1280（9:16 竖屏），成片确实是竖屏，
 * 但**生成的图片是横屏**，合成时画面没充满、两侧留黑。
 *
 * ## 根因
 *
 * 2026-10-02 的 #2787 只修了 agnes-image 一个适配器。实测 9 个图片适配器里有 6 个
 * **根本不读画幅**：`openai-image` / `grok-image` / `recraft` / `flux` /
 * `local-diffusion` / `comfyui`。它们各自退回供应商的横图/方图默认值，于是复现同一现象。
 *
 * ## 本文件的定位
 *
 * `image-adapter-aspect-contract.test.js` 是**结构锁**（扫源码，保证新适配器不会漏）。
 * 本文件是**行为锁**：真实执行每个适配器的 generateImage，断言**下游请求体里的尺寸/画幅
 * 确实是竖屏**。两者缺一不可 —— 结构锁保证「有读」，行为锁保证「读对了、且真的下发了」。
 *
 * 反证纪律：把任一适配器的画幅换算删掉（或改成读错键），本文件对应断言立即变红。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn(), notify: vi.fn() })

const { OpenAIImageAdapter } = require('./openai-image')
const { GrokImageAdapter } = require('./grok-image')
const { RecraftAdapter } = require('./recraft')
const { FluxAdapter } = require('./flux')
const { LocalDiffusionAdapter } = require('./local-diffusion')
const { PexelsAdapter } = require('./pexels')
const { PixabayAdapter } = require('./pixabay')

// ─── fetch mock 工具（与既有适配器测试同构） ───
function createFetchResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(),
    async json() { return body },
    async text() { return JSON.stringify(body) },
    async arrayBuffer() { return new ArrayBuffer(0) },
    body: null,
  }
}

function createFetchMock(responses = []) {
  const calls = []
  const mock = vi.fn(async (url, opts = {}) => {
    calls.push({ url: String(url), opts })
    return responses.shift() || createFetchResponse({})
  })
  mock.calls = calls
  return mock
}

/** 取出 mock 收到的第一个请求体（已 JSON.parse） */
function firstBody(fetchMock) {
  return JSON.parse(fetchMock.calls[0].opts.body)
}

/** 竖屏判定：height > width 才算竖图（本 issue 的核心反证） */
function expectPortraitSize(size, label) {
  const [w, h] = String(size).split('x').map(Number)
  expect(Number.isFinite(w) && Number.isFinite(h), `${label} 尺寸不可解析: ${size}`).toBe(true)
  expect(h, `${label} 期望竖图（height>width），实际 ${size}`).toBeGreaterThan(w)
}

describe('竖屏出图行为锁：aspect_ratio=9:16 必须真正影响下游请求（2026-10-06 回归）', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('openai-image（DALL·E 官方只接受三档尺寸）', () => {
    it('aspect_ratio 9:16 → 请求体取竖屏档位 1024x1792（回归前恒为 1024x1024 方图）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ data: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      await adapter.generateImage({ prompt: 'a cat', aspect_ratio: '9:16' })
      expect(firstBody(fetchMock).size).toBe('1024x1792')
      expectPortraitSize(firstBody(fetchMock).size, 'openai-image')
    })

    it('aspect_ratio 16:9 → 1792x1024 横屏档', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ data: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      await adapter.generateImage({ prompt: 'a cat', aspect_ratio: '16:9' })
      expect(firstBody(fetchMock).size).toBe('1792x1024')
    })

    it('显式 size 优先于画幅（不破坏既有直调方）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ data: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      await adapter.generateImage({ prompt: 'a cat', size: '1024x1024', aspect_ratio: '9:16' })
      expect(firstBody(fetchMock).size).toBe('1024x1024')
    })

    it('无画幅时维持既有方图默认（向后兼容）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ data: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new OpenAIImageAdapter({ id: 'openai-image', apiKey: 'sk-test' })
      await adapter.generateImage({ prompt: 'a cat' })
      expect(firstBody(fetchMock).size).toBe('1024x1024')
    })
  })

  describe('grok-image（xAI 原生 aspect_ratio 枚举）', () => {
    it('aspect_ratio 9:16 → 请求体带 aspect_ratio=9:16（回归前完全不下发该字段）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ data: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new GrokImageAdapter({ id: 'grok-image', apiKey: 'xai-test' })
      await adapter.generateImage({ prompt: 'a cat', aspect_ratio: '9:16' })
      const body = firstBody(fetchMock)
      expect(body.aspect_ratio).toBe('9:16')
      // 绝不能臆造 size 字段（xAI 该端点不认）
      expect(body.size).toBeUndefined()
    })

    it('1080x1920 这类像素画幅归一到官方枚举内的 9:16（枚举外值会被上游 400）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ data: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new GrokImageAdapter({ id: 'grok-image', apiKey: 'xai-test' })
      await adapter.generateImage({ prompt: 'a cat', aspect_ratio: '1080x1920' })
      expect(firstBody(fetchMock).aspect_ratio).toBe('9:16')
    })

    it('无画幅时不下发 aspect_ratio，交由模型自选（保持历史行为）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ data: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new GrokImageAdapter({ id: 'grok-image', apiKey: 'xai-test' })
      await adapter.generateImage({ prompt: 'a cat' })
      expect(firstBody(fetchMock).aspect_ratio).toBeUndefined()
    })
  })

  describe('recraft（沿用本适配器既有 WxH 方言）', () => {
    it('asset-generator 实参（aspect_ratio + width/height）→ 竖图（回归前恒为 1024x1024 方图）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ images: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new RecraftAdapter({ id: 'recraft', apiKey: 'recraft-test' })
      // 复刻 asset-generator.generateImage 的真实下发形态：aspect_ratio + resolveImageSize 产物
      await adapter.generateImage({ prompt: 'a cat', aspect_ratio: '9:16', width: 720, height: 1280 })
      const body = firstBody(fetchMock)
      expect(body.size).toBe('720x1280')
      expectPortraitSize(body.size, 'recraft')
    })

    it('只有画幅没有 width/height 时按画幅换算（下游直调方）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ images: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new RecraftAdapter({ id: 'recraft', apiKey: 'recraft-test' })
      await adapter.generateImage({ prompt: 'a cat', aspect_ratio: '9:16' })
      const body = firstBody(fetchMock)
      expect(body.size).toBe('576x1024')
      expectPortraitSize(body.size, 'recraft')
    })

    it('显式 size 优先于画幅', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ images: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new RecraftAdapter({ id: 'recraft', apiKey: 'recraft-test' })
      await adapter.generateImage({ prompt: 'a cat', size: '1024x1024', aspect_ratio: '9:16' })
      expect(firstBody(fetchMock).size).toBe('1024x1024')
    })

    it('无画幅时维持方图默认（向后兼容）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ images: [{ url: 'x' }] })])
      global.fetch = fetchMock
      const adapter = new RecraftAdapter({ id: 'recraft', apiKey: 'recraft-test' })
      await adapter.generateImage({ prompt: 'a cat' })
      expect(firstBody(fetchMock).size).toBe('1024x1024')
    })
  })

  describe('flux（无 width/height 也必须按画幅出图）', () => {
    it('aspect_ratio 9:16 → 下发 width/height 竖图（回归前完全不发尺寸）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ result: { sample: 'x' } })])
      global.fetch = fetchMock
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({ prompt: 'a cat', aspect_ratio: '9:16' })
      const body = firstBody(fetchMock)
      expect(body.width).toBe(576)
      expect(body.height).toBe(1024)
      expectPortraitSize(`${body.width}x${body.height}`, 'flux')
    })

    it('显式 width/height 优先于画幅', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ result: { sample: 'x' } })])
      global.fetch = fetchMock
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({ prompt: 'a cat', width: 1024, height: 1024, aspect_ratio: '9:16' })
      const body = firstBody(fetchMock)
      expect(body.width).toBe(1024)
      expect(body.height).toBe(1024)
    })

    it('image_size 预设优先于画幅（既有行为不变）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ result: { sample: 'x' } })])
      global.fetch = fetchMock
      const adapter = new FluxAdapter({ id: 'flux', apiKey: 'flux-test' })
      await adapter.generateImage({ prompt: 'a cat', image_size: 'portrait_16_9', aspect_ratio: '16:9' })
      const body = firstBody(fetchMock)
      expect(body.width).toBe(768)
      expect(body.height).toBe(1366)
    })
  })

  describe('local-diffusion（SD WebUI 只认 width/height）', () => {    it('aspect_ratio 9:16 → 下发竖图尺寸（回归前恒为 512x512 方图）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ images: ['b64'] })])
      global.fetch = fetchMock
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.generateImage({ prompt: 'a cat', aspect_ratio: '9:16' })
      const body = firstBody(fetchMock)
      expectPortraitSize(`${body.width}x${body.height}`, 'local-diffusion')
      expect(body.height).toBeGreaterThan(body.width)
    })

    it('显式 width/height 优先于画幅', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ images: ['b64'] })])
      global.fetch = fetchMock
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.generateImage({ prompt: 'a cat', width: 640, height: 640, aspect_ratio: '9:16' })
      const body = firstBody(fetchMock)
      expect(body.width).toBe(640)
      expect(body.height).toBe(640)
    })

    it('无画幅时维持 512x512 既有默认（向后兼容）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ images: ['b64'] })])
      global.fetch = fetchMock
      const adapter = new LocalDiffusionAdapter({ id: 'local-sd' })
      await adapter.generateImage({ prompt: 'a cat' })
      const body = firstBody(fetchMock)
      expect(body.width).toBe(512)
      expect(body.height).toBe(512)
    })
  })

  describe('pexels / pixabay（图库检索：画幅只能靠 orientation 表达）', () => {
    it('pexels: 9:16 → orientation=portrait（回归前完全不下发，取回横构图照片）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ total_results: 0, photos: [] })])
      global.fetch = fetchMock
      const adapter = new PexelsAdapter({ id: 'pexels', apiKey: 'pexels-test' })
      await adapter.generateImage({ prompt: 'cat', aspect_ratio: '9:16' })
      expect(fetchMock.calls[0].url).toContain('orientation=portrait')
    })

    it('pexels: 16:9 → landscape；1:1 → square；无画幅 → 不下发（不臆造方向）', async () => {
      const land = createFetchMock([createFetchResponse({ photos: [] })])
      global.fetch = land
      await new PexelsAdapter({ id: 'pexels', apiKey: 'k' }).generateImage({ prompt: 'c', aspect_ratio: '16:9' })
      expect(land.calls[0].url).toContain('orientation=landscape')

      const sq = createFetchMock([createFetchResponse({ photos: [] })])
      global.fetch = sq
      await new PexelsAdapter({ id: 'pexels', apiKey: 'k' }).generateImage({ prompt: 'c', aspect_ratio: '1:1' })
      expect(sq.calls[0].url).toContain('orientation=square')

      const none = createFetchMock([createFetchResponse({ photos: [] })])
      global.fetch = none
      await new PexelsAdapter({ id: 'pexels', apiKey: 'k' }).generateImage({ prompt: 'c' })
      expect(none.calls[0].url).not.toContain('orientation=')
    })

    it('pixabay: 9:16 → orientation=vertical（Pixabay 只有 horizontal/vertical）', async () => {
      const fetchMock = createFetchMock([createFetchResponse({ hits: [] })])
      global.fetch = fetchMock
      const adapter = new PixabayAdapter({ id: 'pixabay', apiKey: 'pixabay-test' })
      await adapter.generateImage({ prompt: 'cat', aspect_ratio: '9:16' })
      const url = fetchMock.calls[0].url
      expect(url).toContain('orientation=vertical')
      expect(url).not.toContain('orientation=horizontal')
    })

    it('pixabay: 16:9 → horizontal；方屏与无画幅 → 不下发', async () => {
      const land = createFetchMock([createFetchResponse({ hits: [] })])
      global.fetch = land
      await new PixabayAdapter({ id: 'pixabay', apiKey: 'k' }).generateImage({ prompt: 'c', aspect_ratio: '16:9' })
      expect(land.calls[0].url).toContain('orientation=horizontal')

      const sq = createFetchMock([createFetchResponse({ hits: [] })])
      global.fetch = sq
      await new PixabayAdapter({ id: 'pixabay', apiKey: 'k' }).generateImage({ prompt: 'c', aspect_ratio: '1:1' })
      expect(sq.calls[0].url).not.toContain('orientation=')
    })
  })
})
