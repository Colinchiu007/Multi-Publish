import { describe, it, expect } from 'vitest'

/**
 * adapter 模块加载契约（2026-10-07 CI 回归）
 *
 * 首版实现把 require 路径写成了 '../../base-adapter' 与
 * '../../publish/platforms/xiaohongshu-draft'，而两个模块实际都在 src/ 下 ——
 * 结果 CI 上 Gate 4 直接 `Cannot find module '../../base-adapter'`，
 * 而包内单测（只测发布链、不加载 adapter）全绿，**没有任何用例覆盖这条 require**。
 *
 * 这与 queue-delayed 那次「签名测试全绿但实现错位」同源：单元测试覆盖到了
 * 被测模块自己，却没覆盖「模块能否被加载」这条最外层契约。故此处补最小守卫：
 * 只要 adapter 能被 require 出来、且类名/接口符合预期，路径错位立刻可见。
 */
describe('xiaohongshu adapter 模块可加载性', () => {
  it('require adapter 不得抛 MODULE_NOT_FOUND（路径错位守卫）', () => {
    expect(() => require('../src/adapters/xiaohongshu')).not.toThrow()
  })

  it('adapter 必须导出可实例化的类，且接口符合 BasePlatformAdapter 契约', () => {
    const Adapter = require('../src/adapters/xiaohongshu')
    expect(typeof Adapter).toBe('function')
    const inst = new Adapter()
    expect(typeof inst.publish).toBe('function')
    expect(typeof inst.buildPostData).toBe('function')
    expect(typeof inst.getReferer).toBe('function')
    expect(inst.apiBase).toBe('https://edith.xiaohongshu.com')
  })

  it('buildPostData 默认草稿，且把 tags/images 透传给发布链', () => {
    const Adapter = require('../src/adapters/xiaohongshu')
    const post = new Adapter().buildPostData({
      title: '标题',
      content: '正文',
      tags: ['AI', '效率'],
      images: ['C:/tmp/a.png'],
    })
    expect(post.draft).toBe(true)
    expect(post.title).toBe('标题')
    expect(post.tags).toEqual(['AI', '效率'])
    expect(post.images).toEqual(['C:/tmp/a.png'])
  })

  it('draft:false 时才允许公开发布（默认值必须锁死为草稿）', () => {
    const Adapter = require('../src/adapters/xiaohongshu')
    expect(new Adapter().buildPostData({ title: 't' }).draft).toBe(true)
    expect(new Adapter().buildPostData({ title: 't', draft: false }).draft).toBe(false)
  })

  it('publish 链模块也可独立加载', () => {
    expect(() => require('../src/publish/platforms/xiaohongshu-draft')).not.toThrow()
  })
})