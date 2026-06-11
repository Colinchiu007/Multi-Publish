/**
 * Test: base-rpa-publisher.js — 基类方法
 * 测试: progress 回调、子类必须实现方法、publishArticle 流程
 */

const BaseRPAPublisher = require('../src/publishers/base-rpa-publisher')

// Mock: 替换 playwrightManager.newPage
jest.mock('../src/playwright-manager', () => ({
  newPage: jest.fn(() => Promise.resolve({ close: jest.fn() })),
  getContext: jest.fn(() => Promise.resolve({ cookies: jest.fn(() => Promise.resolve([])) }))
}))

// Mock: 替换 cookieStore
jest.mock('../src/cookie-store', () => ({
  saveCookies: jest.fn(),
  loadCookies: jest.fn(() => null)
}))

class MockPublisher extends BaseRPAPublisher {
  async init() {
    this.page = { close: jest.fn() }
    this.context = { cookies: jest.fn(() => Promise.resolve([])) }
  }
  async checkLogin() { return true }
  async waitForLogin() { return true }
  async publish(article) {
    return { success: true, url: 'http://test.com/123' }
  }
  async cleanup() { if (this.page) this.page.close() }
}

describe('BaseRPAPublisher', () => {
  test('构造函数设置 platform', () => {
    const pub = new MockPublisher('wechat_mp', { userDataDir: '/tmp/test' })
    expect(pub.platform).toBe('wechat_mp')
  })

  test('progress 回调被调用', async () => {
    const pub = new MockPublisher('test', { userDataDir: '/tmp/test' })
    const stages = []
    pub.onProgress((stage) => stages.push(stage))
    await pub.init()
    const result = await pub.publishArticle({ title: 'Test' })
    expect(result.success).toBe(true)
    expect(stages.length).toBeGreaterThan(0)
    expect(stages).toContain('发布完成')
  })

  test('checkLogin 未实现抛错', () => {
    const base = new BaseRPAPublisher('test')
    expect(() => base.checkLogin()).toThrow('checkLogin')
  })

  test('waitForLogin 未实现抛错', () => {
    const base = new BaseRPAPublisher('test')
    expect(() => base.waitForLogin()).toThrow('waitForLogin')
  })

  test('publish 未实现抛错', () => {
    const base = new BaseRPAPublisher('test')
    expect(() => base.publish({})).toThrow('publish')
  })
})
