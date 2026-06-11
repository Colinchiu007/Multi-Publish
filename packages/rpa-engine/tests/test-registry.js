/**
 * Test: registry.js — 平台注册中心
 * 测试: 10 个平台都能正确注册，getPublisherClass 抛错处理
 */

const { getPublisherClass, listPlatforms } = require('../src/publishers/registry')

// 10 个平台都在 registry 里
const EXPECTED = [
  'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu',
  'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok'
]

describe('Registry', () => {
  test('listPlatforms 返回 10 个平台', () => {
    const platforms = listPlatforms()
    expect(platforms).toHaveLength(10)
  })

  test('listPlatforms 包含所有预期平台', () => {
    const platforms = listPlatforms()
    for (const p of EXPECTED) {
      expect(platforms).toContain(p)
    }
  })

  test('getPublisherClass 返回正确的类', () => {
    expect(getPublisherClass('wechat_mp')).toBe(require('../src/publishers/wechat-mp-rpa'))
    expect(getPublisherClass('zhihu')).toBe(require('../src/publishers/zhihu-rpa'))
    expect(getPublisherClass('weibo')).toBe(require('../src/publishers/weibo-rpa'))
    expect(getPublisherClass('douyin')).toBe(require('../src/publishers/douyin-rpa'))
    expect(getPublisherClass('xiaohongshu')).toBe(require('../src/publishers/xiaohongshu-rpa'))
    expect(getPublisherClass('tencent_video')).toBe(require('../src/publishers/tencent-video-rpa'))
    expect(getPublisherClass('kuaishou')).toBe(require('../src/publishers/kuaishou-rpa'))
    expect(getPublisherClass('toutiao')).toBe(require('../src/publishers/toutiao-rpa'))
    expect(getPublisherClass('youtube')).toBe(require('../src/publishers/youtube-rpa'))
    expect(getPublisherClass('tiktok')).toBe(require('../src/publishers/tiktok-rpa'))
  })

  test('不支持的平台抛错', () => {
    expect(() => getPublisherClass('fake_platform')).toThrow('不支持的平台: fake_platform')
  })
})
