/**
 * Test: registry.js — 平台注册中心
 * 测试: 15 个平台都能正确注册，getPublisherClass 抛错处理
 */

const { getPublisherClass, listPlatforms } = require('../src/publishers/registry')

// 15 个平台都在 registry 里
const EXPECTED = [
  'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu',
  'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok',
  'bilibili', 'baijiahao', 'twitter', 'instagram', 'facebook'
]

describe('Registry', () => {
  test('listPlatforms 返回 15 个平台', () => {
    const platforms = listPlatforms()
    expect(platforms).toHaveLength(15)
  })

  test('listPlatforms 包含所有预期平台', () => {
    const platforms = listPlatforms()
    for (const p of EXPECTED) {
      expect(platforms).toContain(p)
    }
  })

  test('getPublisherClass 返回有效的类', () => {
    // wechat_mp 直接导出，其他平台可能被 makeApiRpa 包装
    expect(getPublisherClass('wechat_mp')).toBe(require('../src/publishers/wechat-mp-rpa'))
    // 验证所有平台都能获取到类（不要求精确匹配，因为 makeApiRpa 返回匿名类）
    const platforms = ['zhihu', 'weibo', 'douyin', 'xiaohongshu', 'tencent_video',
      'kuaishou', 'toutiao', 'youtube', 'tiktok', 'bilibili', 'baijiahao',
      'twitter', 'instagram', 'facebook']
    for (const p of platforms) {
      const cls = getPublisherClass(p)
      expect(cls).toBeDefined()
      expect(typeof cls).toBe('function')
    }
  })

  test('不支持的平台抛错', () => {
    expect(() => getPublisherClass('fake_platform')).toThrow('不支持的平台: fake_platform')
  })
})
