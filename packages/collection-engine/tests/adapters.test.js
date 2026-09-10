import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const req = createRequire(import.meta.url)
const {
  WechatMpAdapter, ZhihuAdapter, BilibiliAdapter, XiaohongshuAdapter, DouyinAdapter,
} = req('../src/index.js')
const { generateWbiSign, mixinKey } = req('../src/platform-adapters/bilibili-adapter')

describe('WechatMpAdapter', () => {
  it('should extract content from js_content div', () => {
    const a = new WechatMpAdapter()
    const r = a.extractContent({ body: '<div id="js_content"><p>正文</p></div>', title: '标题' })
    expect(r.text).toContain('正文')
    expect(r.title).toBe('标题')
  })

  it('should build URL from string', () => {
    const a = new WechatMpAdapter()
    expect(a.buildUrl('https://mp.weixin.qq.com/s/x')).toBe('https://mp.weixin.qq.com/s/x')
  })
})

describe('ZhihuAdapter', () => {
  it('should detect captcha block', () => {
    const a = new ZhihuAdapter()
    const r = a.detectBlock({ status: 200, body: '请完成安全验证' })
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('captcha')
  })

  it('should detect login expired', () => {
    const a = new ZhihuAdapter()
    const r = a.detectBlock({ status: 200, body: 'class="SignFlow"' })
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('login_expired')
  })

  it('should build answer URL from aid/qid', () => {
    const a = new ZhihuAdapter()
    expect(a.buildUrl({ qid: '123', aid: '456' })).toBe('https://www.zhihu.com/question/123/answer/456')
  })
})

describe('BilibiliAdapter', () => {
  it('should detect rate limit code -412', () => {
    const a = new BilibiliAdapter()
    const r = a.detectBlock({ status: 200, json: { code: -412 } })
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('rate_limited')
  })

  it('should detect login expired code -101', () => {
    const a = new BilibiliAdapter()
    const r = a.detectBlock({ status: 200, json: { code: -101 } })
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('login_expired')
  })

  it('should build bvid URL', () => {
    const a = new BilibiliAdapter()
    expect(a.buildUrl({ bvid: 'BV1xx411c7mD' })).toContain('bvid=BV1xx411c7mD')
  })
})

describe('generateWbiSign / mixinKey', () => {
  it('should produce deterministic mixin key', () => {
    const a = mixinKey('abcdefghijklmnopqrstuvwxyz123456')
    const b = mixinKey('abcdefghijklmnopqrstuvwxyz123456')
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('should add w_rid and wts', () => {
    const params = generateWbiSign({ bvid: 'BV1xx411c7mD' }, 'imgkey', 'subkey')
    expect(params.w_rid).toBeTruthy()
    expect(params.wts).toBeTruthy()
  })
})

describe('XiaohongshuAdapter', () => {
  it('should detect captcha', () => {
    const a = new XiaohongshuAdapter()
    const r = a.detectBlock({ status: 200, body: '请完成滑块验证' })
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('captcha')
  })

  it('should build note URL', () => {
    const a = new XiaohongshuAdapter()
    expect(a.buildUrl({ noteId: 'abc123' })).toBe('https://www.xiaohongshu.com/explore/abc123')
  })
})

describe('DouyinAdapter', () => {
  it('should detect captcha', () => {
    const a = new DouyinAdapter()
    const r = a.detectBlock({ status: 200, body: '请完成安全验证' })
    expect(r.blocked).toBe(true)
    expect(r.reason).toBe('captcha')
  })

  it('should build video URL', () => {
    const a = new DouyinAdapter()
    expect(a.buildUrl({ videoId: 'v123' })).toBe('https://www.douyin.com/video/v123')
  })
})
