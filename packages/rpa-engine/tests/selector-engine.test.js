/**
 * SelectorEngine 单元测试
 */
const { SelectorEngine } = require('../src/selector-engine')
const platformSelectors = require('../src/platform-selectors')

describe('SelectorEngine', () => {
  describe('platform-selectors 配置完整性', () => {
    test('所有 12 个平台都有登录 URL', () => {
      const platforms = [
        'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu',
        'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok',
        'bilibili', 'baijiahao'
      ]
      for (const p of platforms) {
        expect(platformSelectors.PLATFORM_LOGIN_URLS[p]).toBeDefined()
        expect(platformSelectors.PLATFORM_LOGIN_URLS[p]).toMatch(/^https?:\/\//)
      }
    })

    test('所有 12 个平台都有登录成功选择器', () => {
      const platforms = [
        'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu',
        'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok',
        'bilibili', 'baijiahao'
      ]
      for (const p of platforms) {
        const selectors = platformSelectors.PLATFORM_LOGIN_SUCCESS_SELECTORS[p]
        expect(selectors).toBeDefined()
        expect(Array.isArray(selectors)).toBe(true)
      }
    })

    test('所有 12 个平台都有发布选择器', () => {
      const platforms = [
        'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu',
        'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok',
        'bilibili', 'baijiahao'
      ]
      for (const p of platforms) {
        const selectors = platformSelectors.PLATFORM_PUBLISH_SELECTORS[p]
        expect(selectors).toBeDefined()
        expect(typeof selectors).toBe('object')
      }
    })

    test('publish_btn 选择器覆盖所有 12 个平台', () => {
      const platforms = [
        'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu',
        'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok',
        'bilibili', 'baijiahao'
      ]
      for (const p of platforms) {
        const selectors = platformSelectors.PLATFORM_PUBLISH_SELECTORS[p]
        expect(selectors.publish_btn).toBeDefined()
        expect(selectors.publish_btn.length).toBeGreaterThan(0)
      }
    })
  })

  describe('SelectorEngine._buildSemanticSelectors', () => {
    test('publish_btn 返回语义选择器列表', () => {
      const selectors = SelectorEngine._buildSemanticSelectors('any', 'publish_btn')
      expect(selectors.length).toBeGreaterThan(0)
      expect(selectors.some(s => s.includes('发布'))).toBe(true)
    })

    test('title_input 返回语义选择器列表', () => {
      const selectors = SelectorEngine._buildSemanticSelectors('any', 'title_input')
      expect(selectors.length).toBeGreaterThan(0)
    })

    test('未知元素返回空列表', () => {
      const selectors = SelectorEngine._buildSemanticSelectors('any', 'unknown_element')
      expect(selectors).toEqual([])
    })
  })
})
