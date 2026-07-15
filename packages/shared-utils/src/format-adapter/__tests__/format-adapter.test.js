/**
 * F1 格式适配器 — Vitest 单元测试
 *
 * 迁移自 manual-format-adapter.js
 */
const { formatForPlatform } = require('../index')

describe('格式适配器 / HTML 解析 normalize', () => {
  test('提取标题（h1）', () => {
    const result = formatForPlatform('<h1>标题</h1><p>正文</p>', 'weibo')
    expect(result.title).toBe('标题')
  })

  test('提取标题（无 h1 取首行）', () => {
    const result = formatForPlatform('<p>第一行</p><p>正文</p>', 'weibo')
    expect(result.title).toBeTruthy()
  })

  test('提取图片 URL', () => {
    const result = formatForPlatform('<p><img src="https://example.com/1.jpg"/></p>', 'weibo')
    expect(result.images).toContain('https://example.com/1.jpg')
  })

  test('提取 tags（#标签 格式）', () => {
    const result = formatForPlatform('<p>内容 #标签1 #标签2 结束</p>', 'weibo')
    expect(result.tags).toContain('标签1')
    expect(result.tags).toContain('标签2')
  })

  test('空输入不崩溃', () => {
    const result = formatForPlatform('', 'weibo')
    expect(result.title).toBe('')
    expect(result.content).toBe('')
    expect(Array.isArray(result.images)).toBe(true)
    expect(Array.isArray(result.tags)).toBe(true)
  })

  test('Null/undefined 不崩溃', () => {
    const r1 = formatForPlatform(null, 'weibo')
    const r2 = formatForPlatform(undefined, 'weibo')
    expect(r1.title).toBe('')
    expect(r2.title).toBe('')
  })
})

describe('格式适配器 / 长度截断', () => {
  // 以下 4 个用例依赖 platforms.yaml 中 weibo/douyin/youtube 的 max_title / max_content 字段。
  // 当前 config/platforms.yaml 对这些 API 类平台未定义 max_title / max_content，
  // 导致 rules.js 中 LIMITS[platform].maxTitle / maxContent 为 undefined，
  // truncate(str, undefined) 退化为不截断，断言无法满足。
  // 属配置缺口（非被测源码逻辑错误），按任务约定 test.skip 记录，不修改源码与配置。
  test.skip('微博标题截断到 120 字（platforms.yaml 未定义 weibo.max_title）', () => {
    const longTitle = 'x'.repeat(200)
    const result = formatForPlatform(`<h1>${longTitle}</h1>`, 'weibo')
    expect(result.title.length).toBeLessThanOrEqual(120)
  })

  test.skip('抖音标题截断到 30 字（platforms.yaml 未定义 douyin.max_title）', () => {
    const longTitle = 'x'.repeat(100)
    const result = formatForPlatform(`<h1>${longTitle}</h1>`, 'douyin')
    expect(result.title.length).toBeLessThanOrEqual(30)
  })

  test.skip('微博正文截断到 2000 字（platforms.yaml 未定义 weibo.max_content）', () => {
    const longContent = 'x'.repeat(3000)
    const result = formatForPlatform(`<p>${longContent}</p>`, 'weibo')
    expect(result.content.length).toBeLessThanOrEqual(2000)
  })

  test('微信标题截断到 64 字', () => {
    const longTitle = 'x'.repeat(100)
    const result = formatForPlatform(`<h1>${longTitle}</h1>`, 'wechat_mp')
    expect(result.title.length).toBeLessThanOrEqual(64)
  })
})

describe('格式适配器 / 平台格式器', () => {
  test('微博：纯文本，移除 HTML 标签', () => {
    const result = formatForPlatform('<h1>标题</h1><p>正文<i>斜体</i></p>', 'weibo')
    expect(result.content).not.toContain('<')
    expect(result.content).not.toContain('>')
  })

  test('微信公众号：保留基本 HTML 结构', () => {
    const result = formatForPlatform('<h1>标题</h1><p>正文<b>粗体</b></p>', 'wechat_mp')
    // 微信允许部分 HTML
    expect(result.content.includes('<b>') || result.content.includes('粗体')).toBe(true)
  })

  test.skip('YouTube：纯文本，限制 5000 字（platforms.yaml 未定义 youtube.max_content）', () => {
    const result = formatForPlatform('<p>' + 'x'.repeat(6000) + '</p>', 'youtube')
    expect(result.content.length).toBeLessThanOrEqual(5000)
  })

  test('B站：保留基础格式', () => {
    const result = formatForPlatform('<h1>标题</h1><p>正文</p>', 'bilibili')
    expect(result.title).toBeTruthy()
    expect(result.content).toBeTruthy()
  })
})

describe('格式适配器 / 边界情况', () => {
  test('不支持的平台名称 → throw 或 graceful 回退', () => {
    // 当前实现：直接 throw，错误信息包含未知平台名
    expect(() => formatForPlatform('<p>test</p>', 'unknown_platform'))
      .toThrow(/unknown_platform/)
  })

  test('格式输出含 coverSize', () => {
    const result = formatForPlatform('<h1>t</h1><p>c</p>', 'wechat_mp')
    expect(result.coverSize).toBeTruthy()
  })
})
