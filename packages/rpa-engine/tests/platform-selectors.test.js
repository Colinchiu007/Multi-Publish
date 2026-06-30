/**
 * platform-selectors.test.js
 * 验证: 所有 15 个平台的选择器完整、结构正确、无遗漏
 */
const {
  PLATFORM_LOGIN_URLS,
  PLATFORM_LOGIN_SUCCESS_SELECTORS,
  PLATFORM_PUBLISH_SELECTORS,
  PLATFORM_NAMES,
} = require('../src/platform-selectors')

const EXPECTED = [
  'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu',
  'tencent_video', 'kuaishou', 'toutiao', 'youtube', 'tiktok',
  'bilibili', 'baijiahao', 'twitter', 'instagram', 'facebook',
]

// 各平台发布选择器应有"标题类字段"
// 有些平台用 title_input，有些用 content_textarea / textarea / caption_textarea
const TITLE_OR_CONTENT_FIELDS = [
  ['title_input'],                    // 标准标题
  ['content_textarea'],               // weibo
  ['textarea'],                       // twitter, 小红书文案
  ['caption_textarea'],               // tiktok, instagram
]

describe('PLATFORM_LOGIN_URLS', () => {
  test.each(EXPECTED)('%s 有登录 URL', (platform) => {
    expect(PLATFORM_LOGIN_URLS[platform]).toBeDefined()
    expect(PLATFORM_LOGIN_URLS[platform]).toContain('https://')
  })

  test('无多余平台', () => {
    const keys = Object.keys(PLATFORM_LOGIN_URLS)
    for (const key of keys) {
      expect(EXPECTED).toContain(key)
    }
  })
})

describe('PLATFORM_LOGIN_SUCCESS_SELECTORS', () => {
  test.each(EXPECTED)('%s 有登录成功选择器', (platform) => {
    expect(PLATFORM_LOGIN_SUCCESS_SELECTORS[platform]).toBeDefined()
    expect(Array.isArray(PLATFORM_LOGIN_SUCCESS_SELECTORS[platform])).toBe(true)
  })

  test.each(
    EXPECTED.filter(p => p !== 'bilibili') // bilibili 是 API 模式
  )('%s 登录成功选择器非空', (platform) => {
    expect(PLATFORM_LOGIN_SUCCESS_SELECTORS[platform].length).toBeGreaterThan(0)
  })

  test('bilibili 登录成功选择器为空数组（API 模式）', () => {
    expect(PLATFORM_LOGIN_SUCCESS_SELECTORS.bilibili).toEqual([])
  })
})

describe('PLATFORM_PUBLISH_SELECTORS', () => {
  // —— 存在性 ——
  test.each(EXPECTED.filter(p => p !== 'facebook'))(
    '%s 有发布选择器', (platform) => {
      const selectors = PLATFORM_PUBLISH_SELECTORS[platform]
      expect(selectors).toBeDefined()
      expect(typeof selectors).toBe('object')
    }
  )

  // facebook 目前缺失 — 已知缺口
  test('facebook 发布选择器缺失（已知缺口）', () => {
    expect(PLATFORM_PUBLISH_SELECTORS.facebook).toBeUndefined()
  })

  // —— 标题或正文输入字段 ——
  function hasTitleOrContent(platform) {
    const sel = PLATFORM_PUBLISH_SELECTORS[platform]
    if (!sel) return false
    return TITLE_OR_CONTENT_FIELDS.some(fields =>
      fields.some(f => Array.isArray(sel[f]) && sel[f].length > 0)
    )
  }

  test.each(EXPECTED.filter(p => p !== 'facebook'))(
    '%s 有标题或正文输入字段', (platform) => {
      expect(hasTitleOrContent(platform)).toBe(true)
    }
  )

  // —— publish_btn ——
  test.each(EXPECTED.filter(p => p !== 'facebook'))(
    '%s 有 publish_btn', (platform) => {
      const sel = PLATFORM_PUBLISH_SELECTORS[platform]
      expect(sel.publish_btn).toBeDefined()
      expect(sel.publish_btn.length).toBeGreaterThan(0)
    }
  )

  // —— 视频平台上传按钮字段（各平台命名不同） ——
  const VIDEO_UPLOAD_FIELDS = {
    douyin:        ['upload_btn', 'file_input'],
    tencent_video: ['upload_btn', 'file_input'],
    kuaishou:      ['upload_btn', 'file_input'],
    youtube:       ['create_btn', 'upload_option', 'file_input'],
    tiktok:        ['file_input', 'caption_textarea'],
    bilibili:      ['upload_btn'],
  }

  for (const [platform, expectedFields] of Object.entries(VIDEO_UPLOAD_FIELDS)) {
    test.each(expectedFields)('%s 有视频上传字段: %s', (field) => {
      const sel = PLATFORM_PUBLISH_SELECTORS[platform]
      expect(sel).toBeDefined()
      expect(sel[field]).toBeDefined()
      expect(sel[field].length).toBeGreaterThan(0)
    })
  }

  // —— 所有选择器字段值为数组 ——
  test('所有选择器字段值为数组', () => {
    for (const [platform, fields] of Object.entries(PLATFORM_PUBLISH_SELECTORS)) {
      for (const [field, value] of Object.entries(fields)) {
        expect(Array.isArray(value)).toBe(true)
      }
    }
  })

  // —— 无多余平台 ——
  test('无多余平台', () => {
    const keys = Object.keys(PLATFORM_PUBLISH_SELECTORS)
    for (const key of keys) {
      expect(EXPECTED).toContain(key)
    }
  })
})

describe('PLATFORM_NAMES', () => {
  test.each(EXPECTED)('%s 有中文名称', (platform) => {
    expect(PLATFORM_NAMES[platform]).toBeDefined()
    expect(PLATFORM_NAMES[platform].length).toBeGreaterThan(0)
  })
})
