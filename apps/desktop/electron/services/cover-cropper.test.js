// @ts-check
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const {
  normalizeRect,
  computeTargetSize,
  pickJpegQuality,
  validateCropPayload,
} = require('./cover-cropper')

describe('cover-cropper 纯函数', () => {
  describe('normalizeRect', () => {
    it('合法 rect 原样通过', () => {
      const r = normalizeRect({ x: 0, y: 0, width: 100, height: 50 }, 1920, 1080)
      expect(r.ok).toBe(true)
      expect(r.rect).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    })

    it('rect 越界被边界裁剪', () => {
      const r = normalizeRect({ x: -10, y: -5, width: 2000, height: 1200 }, 1920, 1080)
      expect(r.ok).toBe(true)
      expect(r.rect.x).toBe(0)
      expect(r.rect.y).toBe(0)
      expect(r.rect.width).toBe(1920)
      expect(r.rect.height).toBe(1080)
    })

    it('非法 rect（非对象/缺字段/零尺寸）拒绝', () => {
      expect(normalizeRect(null, 100, 100).ok).toBe(false)
      expect(normalizeRect({ x: 0, y: 0 }, 100, 100).ok).toBe(false)
      expect(normalizeRect({ x: 0, y: 0, width: 0, height: 50 }, 100, 100).ok).toBe(false)
      expect(normalizeRect({ x: 0, y: 0, width: 50, height: 0 }, 100, 100).ok).toBe(false)
    })

    it('非数字字段拒绝', () => {
      expect(normalizeRect({ x: 'a', y: 0, width: 50, height: 50 }, 100, 100).ok).toBe(false)
    })
  })

  describe('computeTargetSize', () => {
    it('无 outputWidth 时按原尺寸', () => {
      const r = computeTargetSize({ x: 0, y: 0, width: 400, height: 200 }, 1920, 1080, undefined)
      expect(r.width).toBe(400)
      expect(r.height).toBe(200)
    })

    it('有 outputWidth 时等比缩放', () => {
      const r = computeTargetSize({ x: 0, y: 0, width: 400, height: 200 }, 1920, 1080, 200)
      expect(r.width).toBe(200)
      expect(r.height).toBe(100)
    })

    it('outputWidth 超原宽不放大', () => {
      const r = computeTargetSize({ x: 0, y: 0, width: 400, height: 200 }, 1920, 1080, 800)
      expect(r.width).toBe(400)
      expect(r.height).toBe(200)
    })
  })

  describe('pickJpegQuality', () => {
    it('低于 maxBytes 用高质量 90', () => {
      const fakeEncode = (q) => Buffer.alloc(100 * (q / 90))
      expect(pickJpegQuality(fakeEncode, 1024 * 1024).quality).toBe(90)
    })

    it('超过 maxBytes 时二分压缩到阈值内', () => {
      const fakeEncode = (q) => Buffer.alloc(Math.round(1024 * 1024 * (q / 90)))
      const r = pickJpegQuality(fakeEncode, 512 * 1024)
      expect(r.quality).toBeLessThan(90)
      expect(r.buffer.length).toBeLessThanOrEqual(512 * 1024)
      expect(r.overLimit).toBe(false)
    })

    it('最低质量仍超限时返回最低质量不失败', () => {
      const fakeEncode = () => Buffer.alloc(999999)
      const r = pickJpegQuality(fakeEncode, 512 * 1024)
      expect(r.quality).toBeGreaterThanOrEqual(30)
      expect(r.overLimit).toBe(true)
    })
  })

  describe('validateCropPayload', () => {
    it('合法 payload 通过', () => {
      const r = validateCropPayload({ imagePath: 'C:/x.jpg', rect: { x: 0, y: 0, width: 100, height: 100 } })
      expect(r.ok).toBe(true)
    })

    it('imagePath 缺失/非字符串拒绝', () => {
      expect(validateCropPayload({ rect: {} }).ok).toBe(false)
      expect(validateCropPayload({ imagePath: 123, rect: {} }).ok).toBe(false)
    })

    it('rect 缺失拒绝', () => {
      expect(validateCropPayload({ imagePath: 'C:/x.jpg' }).ok).toBe(false)
    })
  })
})

describe('cover-cropper IPC 合约（mock 依赖）', () => {
  let cropper
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('./cover-extractor', () => ({ extractVideoCover: vi.fn() }))
    cropper = require('./cover-cropper')
  })
  afterEach(() => {
    vi.resetModules()
  })

  it('cropImageFile: 文件不存在返回 ok:false', async () => {
    const r = await cropper.cropImageFile('Z:/no-such-file.jpg', { rect: { x: 0, y: 0, width: 10, height: 10 } })
    expect(r.ok).toBe(false)
  })

  it('readImageAsDataUrl: 文件不存在返回 ok:false', () => {
    const r = cropper.readImageAsDataUrl('Z:/no-such-file.jpg')
    expect(r.ok).toBe(false)
  })

  it('readImageAsDataUrl: 非图片扩展名返回 ok:false', () => {
    const r = cropper.readImageAsDataUrl('Z:/x.txt')
    expect(r.ok).toBe(false)
  })
})