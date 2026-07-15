/**
 * F2 封面图处理器 — Vitest 单元测试
 *
 * 迁移自 manual-cover-processor.js
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const sharp = require('sharp')
const processor = require('../index')

// 测试夹具：200x150 红色 PNG + 临时输出目录
let testDir = ''
let testImg = ''

beforeAll(async () => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-test-'))
  testImg = path.join(testDir, 'input.png')
  await sharp({
    create: { width: 200, height: 150, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toFile(testImg)
})

afterAll(() => {
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
  } catch (e) {
    // 忽略清理失败
  }
})

describe('封面处理器 / 平台预设', () => {
  test('获取有效平台的预设', () => {
    const p = processor.getPreset('wechat_mp')
    expect(p.width).toBe(900)
    expect(p.height).toBe(500)
    expect(p.format).toBe('jpeg')
  })

  test('无效平台返回 null', () => {
    expect(processor.getPreset('unknown')).toBeNull()
  })

  // config/platforms.yaml 对 weibo/douyin/youtube/bilibili/tiktok/twitter 等 API 类平台
  // 未定义 cover_size，presets.js 不会为它们生成 PRESETS，故“所有 11 平台都有预设”不成立。
  // 属配置缺口，按任务约定 test.skip 记录，不修改源码与配置。
  test.skip('所有11平台都有预设（platforms.yaml 未为 weibo 等平台定义 cover_size）', () => {
    for (const id of ['wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu', 'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok', 'bilibili']) {
      expect(processor.getPreset(id)).toBeTruthy()
    }
  })
})

describe('封面处理器 / 封面处理', () => {
  // 以下 3 个用例原手动测试以 weibo 为目标平台（期望 980x550 / JPEG），
  // 但 platforms.yaml 未定义 weibo.cover_size → getPreset('weibo') 返回 null →
  // processCover 抛出“不支持的平台: weibo”。属配置缺口，test.skip 记录。
  test.skip('处理有效图片返回正确结构（weibo 缺 cover_size 预设）', async () => {
    const r = await processor.processCover(testImg, 'weibo', testDir)
    expect(r.path).toBeTruthy()
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)
    expect(r.size).toBeGreaterThan(0)
    expect(r.format).toBeTruthy()
  })

  test.skip('裁剪到目标尺寸 (200x150 → 980x550)（weibo 缺 cover_size 预设）', async () => {
    const r = await processor.processCover(testImg, 'weibo', testDir)
    expect(r.width).toBe(980)
    expect(r.height).toBe(550)
  })

  test.skip('格式转换 PNG → JPEG（weibo 缺 cover_size 预设）', async () => {
    const r = await processor.processCover(testImg, 'weibo', testDir)
    expect(r.format).toBe('jpeg')
    expect(r.path.endsWith('.jpg')).toBe(true)
  })

  test('空路径返回错误', async () => {
    await expect(processor.processCover('', 'weibo', testDir)).rejects.toThrow()
  })

  test('不存在文件返回错误', async () => {
    await expect(processor.processCover('/no/such/file.jpg', 'weibo', testDir)).rejects.toThrow()
  })

  test('输出文件实际存在', async () => {
    const r = await processor.processCover(testImg, 'wechat_mp', testDir)
    expect(fs.existsSync(r.path)).toBe(true)
  })
})

describe('封面处理器 / 大小限制', () => {
  test('coverSize 解析', () => {
    const r = processor.parseCoverSize('900x500')
    expect(r.width).toBe(900)
    expect(r.height).toBe(500)
  })

  test('无效 coverSize 返回 null', () => {
    expect(processor.parseCoverSize('')).toBeNull()
    expect(processor.parseCoverSize('abc')).toBeNull()
  })
})
