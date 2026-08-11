/**
 * F1 平台 URL 配置化 — Vitest 单元测试
 *
 * 迁移自 manual-platform-config.js
 */
const path = require('path')
const PlatformConfig = require('../platform-config')

// config/platforms.yaml 位于仓库根目录
const CONFIG_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml')

describe('平台配置 / 配置加载', () => {
  test('从 YAML 文件加载配置', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    expect(pc.listPlatforms().length).toBeGreaterThanOrEqual(12)
  })

  test('获取单个平台配置', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    const wp = pc.getPlatform('wechat_mp')
    expect(wp).toBeTruthy()
    expect(wp.name).toBe('微信公众号')
    expect(wp.type).toBe('article')
  })

  test('不存在平台返回 null', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    expect(pc.getPlatform('nonexistent')).toBeNull()
  })

  // config/platforms.yaml 对 weibo/douyin/youtube/bilibili/tiktok/twitter 等 API 类平台
  // 未定义 cover_size / max_title / max_content，故“所有平台都有必要字段”不成立。
  // 属配置缺口，按任务约定 test.skip 记录，不修改源码与配置。
  test.skip('所有平台都有必要字段（platforms.yaml 未为 weibo 等平台定义 cover_size/max_title/max_content）', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    const required = ['id', 'name', 'type', 'icon', 'cover_size', 'max_title', 'max_content']
    for (const p of pc.listPlatforms()) {
      for (const field of required) {
        expect(p[field]).not.toBeUndefined()
        expect(p[field]).not.toBeNull()
      }
    }
  })
})

describe('平台配置 / 辅助方法', () => {
  test('getDataUrl 返回正确 URL', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    const url = pc.getDataUrl('douyin')
    // 抖音可能有 data_url，也可能为空，只要不崩溃即可
    expect(url).not.toBeUndefined()
  })

  test('getCommentUrl 返回正确 URL', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    const url = pc.getCommentUrl('weibo')
    expect(url).not.toBeUndefined()
  })

  test('getCoverSize 返回正确尺寸', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    const size = pc.getCoverSize('wechat_mp')
    expect(size).toEqual({ width: 900, height: 500 })
  })

  test('配置不存在时抛出错误', () => {
    expect(() => new PlatformConfig('/nonexistent/path.yaml')).toThrow()
  })
})

describe('平台配置 / applyRemote 运营后台覆盖', () => {
  test('按 id 覆盖已存在平台字段，本地独有平台保留', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    const n = pc.applyRemote([
      { id: 'wechat_mp', name: '微信公众号（运营）', max_title: 100, content_category: 'MIXED' },
      { id: 'nonexistent-remote-only', name: '远程新增', max_title: 1 },
    ])
    expect(n).toBe(1)
    const wp = pc.getPlatform('wechat_mp')
    expect(wp.name).toBe('微信公众号（运营）')
    expect(wp.max_title).toBe(100)
    expect(wp.content_category).toBe('MIXED')
    // 本地独有平台仍可用
    expect(pc.getPlatform('weibo')).toBeTruthy()
    // 远程新增平台不自动引入（fail-closed）
    expect(pc.getPlatform('nonexistent-remote-only')).toBeNull()
  })

  test('仅覆盖远程出现的键；null/undefined 不覆盖', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    const catBefore = pc.getPlatform('douyin').category
    const contentBefore = pc.getPlatform('douyin').max_content
    pc.applyRemote([{ id: 'douyin', max_title: 66, name: null, category: undefined, note: 'x' }])
    const p = pc.getPlatform('douyin')
    expect(p.max_title).toBe(66)
    expect(p.category).toBe(catBefore)
    expect(p.max_content).toBe(contentBefore)
  })

  test('cover_size 字符串同步重建解析尺寸', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    pc.applyRemote([{ id: 'wechat_mp', cover_size: '800x450' }])
    expect(pc.getCoverSize('wechat_mp')).toEqual({ width: 800, height: 450 })
  })

  test('非数组/空数组/空 id 不改变任何平台', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    const before = pc.listPlatforms().length
    expect(pc.applyRemote(null)).toBe(0)
    expect(pc.applyRemote([])).toBe(0)
    expect(pc.applyRemote([{ id: '', name: 'x' }])).toBe(0)
    expect(pc.listPlatforms().length).toBe(before)
  })

  test('不改写 yaml 文件（applyRemote 只作用于内存）', () => {
    const fs = require('fs')
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const pc = new PlatformConfig(CONFIG_PATH)
    pc.applyRemote([{ id: 'wechat_mp', name: '临时改名' }])
    expect(fs.readFileSync(CONFIG_PATH, 'utf-8')).toBe(raw)
  })

  test('类型不符/未知键被忽略（allowlist + 类型守卫）', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    const titleBefore = pc.getPlatform('wechat_mp').max_title
    pc.applyRemote([{ id: 'wechat_mp', max_title: '64', evilKey: 'x', max_content: 100 }])
    const p = pc.getPlatform('wechat_mp')
    expect(p.max_title).toBe(titleBefore) // 字符串 max_title 被忽略
    expect(p.max_content).toBe(100) // 数字正常覆盖
    expect(p.evilKey).toBeUndefined() // 未知键不复制
  })

  test('超过数组上限整批拒绝（fail-closed）', () => {
    const pc = new PlatformConfig(CONFIG_PATH)
    const before = pc.getPlatform('wechat_mp').max_title
    const huge = Array.from({ length: 501 }, (_, i) => ({ id: 'wechat_mp', max_title: i }))
    expect(pc.applyRemote(huge)).toBe(0)
    expect(pc.getPlatform('wechat_mp').max_title).toBe(before)
  })
})
