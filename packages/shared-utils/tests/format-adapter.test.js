/**
 * Tests for FormatAdapter — Markdown → 平台格式转换
 * Pure functions, no mocking needed
 */
const FormatAdapter = require('../src/format-adapter')

const sampleArticle = {
  title: '测试文章',
  content: '# 标题\n\n这是**正文**内容，包含[链接](https://example.com)。\n\n- 列表项1\n- 列表项2\n\n> 引用内容',
  author: '作者A',
  tags: ['科技', 'AI'],
  cover_url: 'https://example.com/cover.jpg',
}

describe('FormatAdapter', () => {
  test('format returns object for all platforms', () => {
    const platforms = ['wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu',
      'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok']
    for (const p of platforms) {
      const result = FormatAdapter.format(p, sampleArticle)
      expect(result).toBeDefined()
      expect(result.title || result.content).toBeTruthy()
    }
  })

  test('wechat: returns HTML in section', () => {
    const r = FormatAdapter.format('wechat_mp', sampleArticle)
    expect(r.title).toBe('测试文章')
    expect(r.content).toContain('<section')
    expect(r.content).toContain('<strong>')
    expect(r.content).toContain('<a href=')
    expect(r.author).toBe('作者A')
    expect(r.coverUrl).toBe('https://example.com/cover.jpg')
  })

  test('zhihu: strips h1 to h2', () => {
    const r = FormatAdapter.format('zhihu', { ...sampleArticle, content: '# H1标题\n正文' })
    expect(r.content).not.toContain('<h1>')
    expect(r.content).toContain('<h2>')
  })

  test('weibo: truncates text over 2000 chars', () => {
    const longText = 'A'.repeat(3000)
    const r = FormatAdapter.format('weibo', { ...sampleArticle, content: longText })
    expect(r.content.length).toBeLessThanOrEqual(2020)
    expect(r.content).toContain('全文见评论')
  })

  test('weibo: appends hashtags from tags', () => {
    const r = FormatAdapter.format('weibo', { ...sampleArticle, content: '正文' })
    expect(r.content).toContain('#科技#')
    expect(r.content).toContain('#AI#')
  })

  test('douyin: truncates text over 500 chars', () => {
    const longText = 'A'.repeat(600)
    const r = FormatAdapter.format('douyin', { ...sampleArticle, content: longText })
    expect(r.content.length).toBeLessThanOrEqual(520)
  })

  test('xiaohongshu: supports @ mentions', () => {
    const r = FormatAdapter.format('xiaohongshu', { ...sampleArticle, content: '你好 @张三 @李四' })
    expect(r.content).toContain('@张三')
  })

  test('youtube: has description, tags, no content', () => {
    const r = FormatAdapter.format('youtube', sampleArticle)
    expect(r.description).toBeTruthy()
    expect(r.tags).toEqual(['科技', 'AI'])
    expect(r.title).toBe('测试文章')
  })

  test('tiktok: short text with hashtags', () => {
    const r = FormatAdapter.format('tiktok', { ...sampleArticle, content: '短视频描述' })
    expect(r.content).toContain('短视频描述')
    expect(r.content).toContain('#科技')
  })

  test('unknown platform returns warning', () => {
    const r = FormatAdapter.format('unknown_platform', sampleArticle)
    expect(r._warnings).toBeDefined()
    expect(r._warnings[0]).toContain('未适配')
  })

  test('_html converts markdown correctly', () => {
    const html = FormatAdapter._html('**粗体** *斜体* `代码`')
    expect(html).toContain('<strong>')
    expect(html).toContain('<em>')
    expect(html).toContain('<code>')
  })

  test('_html handles links', () => {
    const html = FormatAdapter._html('[点击这里](https://example.com)')
    expect(html).toContain('<a href="https://example.com">点击这里</a>')
  })

  test('_html handles images', () => {
    const html = FormatAdapter._html('![图片](https://example.com/img.jpg)')
    expect(html).toContain('<img src="https://example.com/img.jpg"')
  })

  test('_plainText strips markdown syntax', () => {
    const text = FormatAdapter._plainText('# 标题\n**粗体** *斜体* [链接](url)')
    expect(text).not.toContain('#')
    expect(text).not.toContain('**')
    expect(text).toContain('标题')
    expect(text).toContain('粗体')
    expect(text).toContain('链接')
  })

  test('_truncate preserves sentence boundary', () => {
    const text = '第一句。第二句。第三句很长很长很长很长很长。'
    const truncated = FormatAdapter._truncate(text, 10)
    expect(truncated.length).toBeLessThanOrEqual(13)
    // Should break at sentence boundary
    expect(truncated).toContain('第一句')
  })
})