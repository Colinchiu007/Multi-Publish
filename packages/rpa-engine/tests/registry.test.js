/**
 * Test: registry.js — 平台注册中心（已废弃）
 *
 * P2-E: 所有平台已迁移到 RpaViewManager（executeJavaScript 引擎），
 * registry 保持空对象（仅向后 require 兼容），不注册任何平台。
 *
 * 测试验证废弃状态下的行为契约。
 */

const { getPublisherClass, listPlatforms } = require('../src/publishers/registry')

describe('Registry（已废弃）', () => {
  test('listPlatforms 返回空数组（注册中心已废弃）', () => {
    const platforms = listPlatforms()
    expect(platforms).toEqual([])
  })

  test('getPublisherClass 对所有平台抛出未知平台错误', () => {
    const platforms = [
      'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu',
      'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok',
      'bilibili', 'baijiahao', 'twitter', 'instagram', 'facebook',
    ]
    for (const p of platforms) {
      expect(() => getPublisherClass(p)).toThrow(`未知平台: ${p}`)
    }
  })
})
