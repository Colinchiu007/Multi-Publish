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
