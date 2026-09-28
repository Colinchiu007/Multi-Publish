/**
 * publish-capabilities.test.js — 发布能力注册表回归测试
 *
 * 注册表是 15 平台发布提交内容项的单一真源（openspec/changes/publish-capability-registry）：
 *   - titleMode（title | caption）：无标题平台标题必须合并进描述首行
 *   - limits：渲染层内容限制的唯一数据源（publish-contract.js 派生消费）
 *   - overrideFields：差异化面板数据驱动渲染的字段定义
 *   - commonFormFields：通用主表单字段支持矩阵
 *   - 分类规则：语义能力 ≥3 平台 → common；=2 → semiCommon；=1 → unique（用户 2026-10-08 确认阈值）
 */
import { describe, expect, it } from 'vitest'
import {
  PLATFORM_PUBLISH_META,
  getPlatformPublishMeta,
  isNoTitlePlatform,
  getNoTitlePlatforms,
  getPlatformOverrideFields,
  classifyPublishFields,
  getFieldSupport,
  composeNoTitleDescription,
  getCommonFormFields,
  getPlatformContentLimit,
  validateRegistry,
} from '../publish-capabilities.js'
import * as browserModule from '../publish-capabilities.browser.js'

const ALL_PLATFORMS = [
  'wechat_mp', 'zhihu', 'weibo', 'douyin', 'xiaohongshu', 'tencent_video',
  'kuaishou', 'toutiao', 'bilibili', 'baijiahao', 'youtube', 'tiktok',
  'twitter', 'instagram', 'facebook',
]

describe('publish-capabilities — 平台元数据完整性', () => {
  it('覆盖全部 15 个支持平台，无缺失无多余', () => {
    expect(Object.keys(PLATFORM_PUBLISH_META).sort()).toEqual([...ALL_PLATFORMS].sort())
  })

  it('每个平台都有合法 titleMode 与内容限制', () => {
    for (const platform of ALL_PLATFORMS) {
      const meta = PLATFORM_PUBLISH_META[platform]
      expect(['title', 'caption']).toContain(meta.titleMode)
      expect(meta.limits).toBeDefined()
      expect(Number.isFinite(meta.limits.contentMax)).toBe(true)
      expect(meta.limits.contentMax).toBeGreaterThan(0)
    }
  })

  it('isNoTitlePlatform 与 titleMode=caption 等价', () => {
    for (const platform of ALL_PLATFORMS) {
      expect(isNoTitlePlatform(platform)).toBe(PLATFORM_PUBLISH_META[platform].titleMode === 'caption')
    }
  })

  it('无标题平台清单精确等于 6 个（用户 2026-10-08 确认）', () => {
    expect(getNoTitlePlatforms().sort()).toEqual([
      'instagram', 'kuaishou', 'tencent_video', 'tiktok', 'twitter', 'weibo',
    ])
  })

  it('getPlatformPublishMeta 返回副本，调用方修改不污染全局', () => {
    const meta = getPlatformPublishMeta('wechat_mp')
    meta.limits.titleMax = 999
    meta.titleMode = 'caption'
    expect(PLATFORM_PUBLISH_META.wechat_mp.limits.titleMax).toBe(64)
    expect(PLATFORM_PUBLISH_META.wechat_mp.titleMode).toBe('title')
  })

  it('未知平台返回 null 而非崩溃', () => {
    expect(getPlatformPublishMeta('nonexistent')).toBeNull()
    expect(isNoTitlePlatform('nonexistent')).toBe(false)
    expect(getPlatformOverrideFields('nonexistent')).toEqual([])
  })
})

describe('publish-capabilities — 内容限制对齐表（design §5）', () => {
  it.each([
    ['wechat_mp', { titleMax: 64, contentMax: 20000 }],
    ['zhihu', { titleMax: 50, contentMax: 100000 }],
    ['weibo', { titleMax: 0, contentMax: 2000 }],
    // 修复项：渲染层旧值 contentMax=0（不校验）→ 1000（platforms.yaml + 引擎一致）
    ['douyin', { titleMax: 55, contentMax: 1000 }],
    ['xiaohongshu', { titleMax: 20, contentMax: 1000 }],
    // 补齐项：渲染层旧表缺条目回落默认 5000 → 1000（platforms.yaml）
    ['tencent_video', { titleMax: 0, contentMax: 1000 }],
    ['kuaishou', { titleMax: 0, contentMax: 1000 }],
    ['toutiao', { titleMax: 30, contentMax: 100000 }],
    ['bilibili', { titleMax: 80, contentMax: 2000 }],
    ['youtube', { titleMax: 100, contentMax: 5000 }],
    // 修复项：旧表 title 2200/content 0 → caption 语义 contentMax 2200
    ['tiktok', { titleMax: 0, contentMax: 2200 }],
    ['twitter', { titleMax: 0, contentMax: 280 }],
    ['instagram', { titleMax: 0, contentMax: 2200 }],
    // 补齐项：渲染层旧表缺条目 → platforms.yaml 真实值
    ['facebook', { titleMax: 100, contentMax: 63206 }],
  ])('%s 限制 = %j', (platform, expected) => {
    const meta = getPlatformPublishMeta(platform)
    expect(meta.limits.titleMax).toBe(expected.titleMax)
    expect(meta.limits.contentMax).toBe(expected.contentMax)
  })

  it('百家号按 UTF-8 字节数校验标题（titleMaxBytes=149）', () => {
    const limit = getPlatformContentLimit('baijiahao')
    expect(limit.titleMaxBytes).toBe(149)
    expect(limit.contentMax).toBe(100000)
  })

  it('getPlatformContentLimit 对无条目平台不再回落 5000 默认（注册表全覆盖）', () => {
    for (const platform of ALL_PLATFORMS) {
      const limit = getPlatformContentLimit(platform)
      expect(limit.contentMax).toBeGreaterThan(0)
    }
  })
})

describe('publish-capabilities — 语义分类（3+ 阈值）', () => {
  it('合集语义 5 平台 → common（B站/YouTube/百家号 implemented + 快手/视频号 platform-capable）', () => {
    const support = getFieldSupport('collection')
    expect(support.count).toBe(5)
    expect(support.platforms.sort()).toEqual(['baijiahao', 'bilibili', 'kuaishou', 'tencent_video', 'youtube'])
    expect(classifyPublishFields().common.map(f => f.semantic)).toContain('collection')
  })

  it('可见性语义 5 平台 → common（蚁小二证据：抖音/快手/微博也支持）', () => {
    const support = getFieldSupport('visibility')
    expect(support.count).toBe(5)
    expect(support.platforms.sort()).toEqual(['douyin', 'kuaishou', 'tiktok', 'weibo', 'youtube'])
    expect(classifyPublishFields().common.map(f => f.semantic)).toContain('visibility')
  })

  it('位置语义 3 平台 → common（百家号 implemented + 快手/视频号 platform-capable）', () => {
    expect(getFieldSupport('location').count).toBe(3)
    expect(classifyPublishFields().common.map(f => f.semantic)).toContain('location')
  })

  it('商品语义 4 平台 → common（抖音/小红书 implemented + 快手/视频号 platform-capable）', () => {
    expect(getFieldSupport('goods').count).toBe(4)
    expect(classifyPublishFields().common.map(f => f.semantic)).toContain('goods')
  })

  it('平台活动语义 3 平台 → common（抖音/快手/视频号 platform-capable）', () => {
    expect(getFieldSupport('activity').count).toBe(3)
    expect(classifyPublishFields().common.map(f => f.semantic)).toContain('activity')
  })

  it('评论控制语义 3 平台 → common（公众号/知乎 implemented + B站 platform-capable）', () => {
    expect(getFieldSupport('comment-control').count).toBe(3)
    expect(classifyPublishFields().common.map(f => f.semantic)).toContain('comment-control')
  })

  it('下载权限语义 2 平台 → semiCommon（抖音/快手 platform-capable）', () => {
    expect(getFieldSupport('download').count).toBe(2)
    expect(classifyPublishFields().semiCommon.map(f => f.semantic)).toContain('download')
  })

  it('配乐语义 2 平台 → semiCommon（抖音/视频号 platform-capable）', () => {
    expect(getFieldSupport('music').count).toBe(2)
    expect(classifyPublishFields().semiCommon.map(f => f.semantic)).toContain('music')
  })

  it('分类语义 2 平台 → semiCommon（B站/YouTube）', () => {
    expect(getFieldSupport('category').count).toBe(2)
    expect(classifyPublishFields().semiCommon.map(f => f.semantic)).toContain('category')
  })

  it('原创声明语义 2 平台 → semiCommon（B站版权/百家号原创）', () => {
    expect(getFieldSupport('originality').count).toBe(2)
    expect(classifyPublishFields().semiCommon.map(f => f.semantic)).toContain('originality')
  })

  it('摘要语义 1 平台 → unique（公众号）', () => {
    expect(getFieldSupport('digest').count).toBe(1)
    expect(classifyPublishFields().unique.map(f => f.semantic)).toContain('digest')
  })

  it('标题/正文/定时为通用语义（15 平台）', () => {
    expect(getFieldSupport('title').count).toBe(15)
    expect(getFieldSupport('content').count).toBe(15)
    expect(getFieldSupport('schedule').count).toBe(15)
  })

  it('AI 声明恰好 3 平台（快手/B站/百家号）→ common', () => {
    expect(getFieldSupport('ai-declaration').count).toBe(3)
    expect(getFieldSupport('ai-declaration').platforms.sort()).toEqual(['baijiahao', 'bilibili', 'kuaishou'])
    expect(classifyPublishFields().common.map(f => f.semantic)).toContain('ai-declaration')
  })

  it('草稿语义 5 平台 → common（知乎/抖音/B站/视频号/公众号）', () => {
    expect(getFieldSupport('draft').count).toBe(5)
    expect(classifyPublishFields().common.map(f => f.semantic)).toContain('draft')
  })

  it('分类是计算属性：每个语义恰好归入一类', () => {
    const { common, semiCommon, unique } = classifyPublishFields()
    const all = [...common, ...semiCommon, ...unique]
    const semantics = all.map(f => f.semantic)
    expect(new Set(semantics).size).toBe(semantics.length) // 无重复
    for (const field of all) {
      expect(field.count).toBe(getFieldSupport(field.semantic).count)
    }
  })

  it('分类条目携带 status 汇总（implemented / platform-capable 共存可见）', () => {
    const visibility = classifyPublishFields().common.find(f => f.semantic === 'visibility')
    expect(visibility.statuses.sort()).toEqual(['implemented', 'implemented', 'platform-capable', 'platform-capable', 'platform-capable'].sort())
  })
})

describe('publish-capabilities — 差异化字段定义', () => {
  it('每平台字段定义结构合法（key/semantic/status/type/label）', () => {
    const validTypes = ['text', 'textarea', 'select', 'checkbox', 'tags', 'collection', 'object', 'object-list', 'image']
    for (const platform of ALL_PLATFORMS) {
      for (const field of getPlatformOverrideFields(platform)) {
        expect(typeof field.key).toBe('string')
        expect(field.key.length).toBeGreaterThan(0)
        expect(typeof field.semantic).toBe('string')
        expect(['implemented', 'platform-capable']).toContain(field.status)
        expect(validTypes).toContain(field.type)
        expect(typeof field.label).toBe('string')
        expect(field.label.length).toBeGreaterThan(0)
        expect('default' in field).toBe(true)
        expect(typeof field.uiExposed).toBe('boolean')
      }
    }
  })

  it('platform-capable 字段必须带证据说明（note）', () => {
    for (const platform of ALL_PLATFORMS) {
      for (const field of getPlatformOverrideFields(platform)) {
        if (field.status !== 'platform-capable') continue
        expect(typeof field.note).toBe('string')
        expect(field.note.length).toBeGreaterThan(0)
      }
    }
  })

  it('select 字段必须带 options 且 default 在 options 值集内', () => {
    for (const platform of ALL_PLATFORMS) {
      for (const field of getPlatformOverrideFields(platform)) {
        if (field.type !== 'select') continue
        expect(Array.isArray(field.options)).toBe(true)
        expect(field.options.length).toBeGreaterThan(0)
        const values = field.options.map(o => o.value)
        expect(values).toContain(field.default)
      }
    }
  })

  it('UI 未暴露能力全量收录：抖音商品/任务/可见性/合作投稿、小红书商品标记 uiExposed=false', () => {
    const douyinKeys = getPlatformOverrideFields('douyin').map(f => f.key)
    expect(douyinKeys).toContain('goods')
    expect(douyinKeys).toContain('taskId')
    expect(douyinKeys).toContain('visibilityType')
    expect(douyinKeys).toContain('cooperationInfo')
    const goods = getPlatformOverrideFields('douyin').find(f => f.key === 'goods')
    expect(goods.uiExposed).toBe(false)
    const xhsGoods = getPlatformOverrideFields('xiaohongshu').find(f => f.key === 'goods')
    expect(xhsGoods.uiExposed).toBe(false)
  })

  it('蚁小二证据字段标记 platform-capable 且不进 UI 渲染集', () => {
    const douyinVisibility = getPlatformOverrideFields('douyin').find(f => f.key === 'visibilityType')
    expect(douyinVisibility.status).toBe('platform-capable')
    expect(douyinVisibility.uiExposed).toBe(false)
    const weiboVote = getPlatformOverrideFields('weibo').find(f => f.key === 'vote')
    expect(weiboVote.status).toBe('platform-capable')
    const biliDanmu = getPlatformOverrideFields('bilibili').find(f => f.key === 'upCloseDanmu')
    expect(biliDanmu.status).toBe('platform-capable')
  })

  it('既有 8 平台差异化字段零丢失（重构快照，按 uiExposed 过滤）', () => {
    const keysOf = platform => getPlatformOverrideFields(platform).filter(f => f.uiExposed).map(f => f.key)
    expect(keysOf('wechat_mp').sort()).toEqual(['digest', 'massSend', 'openComment'])
    expect(keysOf('zhihu').sort()).toEqual(['commentPermission', 'declare', 'draft', 'topics'])
    expect(keysOf('douyin')).toEqual(['draft'])
    expect(keysOf('bilibili').sort()).toEqual(['category', 'collectionId', 'copyright'])
    expect(keysOf('youtube').sort()).toEqual(['categoryId', 'playlistId', 'privacy'])
    expect(keysOf('tiktok')).toEqual(['privacyLevel'])
    expect(keysOf('baijiahao').sort()).toEqual(['collectionIdText', 'locationName', 'original'])
    expect(keysOf('weibo')).toEqual([])
    expect(keysOf('tencent_video')).toEqual([])
    expect(keysOf('kuaishou')).toEqual([])
  })

  it('getPlatformOverrideFields 返回副本', () => {
    const fields = getPlatformOverrideFields('zhihu')
    fields.push({ key: 'injected' })
    expect(getPlatformOverrideFields('zhihu').length).toBe(6)
  })
})

describe('publish-capabilities — 通用主表单字段支持矩阵', () => {
  it('通用字段全部 ≥3 平台支持（阈值自洽）', () => {
    for (const field of getCommonFormFields()) {
      expect(field.platforms.length).toBeGreaterThanOrEqual(3)
      for (const platform of field.platforms) {
        expect(ALL_PLATFORMS).toContain(platform)
      }
    }
  })

  it('标题字段覆盖 15 平台（无标题平台走合并口径）', () => {
    const title = getCommonFormFields().find(f => f.key === 'title')
    expect(title.platforms.length).toBe(15)
    expect(title.noTitleBehavior).toBe('caption-first-line')
  })
})

describe('publish-capabilities — composeNoTitleDescription', () => {
  it('标题与正文都有：标题为首行', () => {
    expect(composeNoTitleDescription('标题', '正文')).toBe('标题\n正文')
  })

  it('仅标题：即描述全文', () => {
    expect(composeNoTitleDescription('标题', '')).toBe('标题')
  })

  it('仅正文：原样返回', () => {
    expect(composeNoTitleDescription('', '正文')).toBe('正文')
  })

  it('两者皆空：空字符串', () => {
    expect(composeNoTitleDescription('', '')).toBe('')
  })

  it('null/undefined 输入安全', () => {
    expect(composeNoTitleDescription(null, undefined)).toBe('')
    expect(composeNoTitleDescription('T', null)).toBe('T')
  })

  it('超长截断：标题优先存活', () => {
    const composed = composeNoTitleDescription('十个字标题十个字标题', '正文'.repeat(20), { maxLen: 15 })
    expect(composed.length).toBeLessThanOrEqual(15)
    expect(composed.startsWith('十个字标题')).toBe(true)
  })

  it('maxLen 缺省或非正数：不截断', () => {
    expect(composeNoTitleDescription('T', 'C')).toBe('T\nC')
    expect(composeNoTitleDescription('T', 'C', { maxLen: 0 })).toBe('T\nC')
    expect(composeNoTitleDescription('T', 'C', { maxLen: -1 })).toBe('T\nC')
  })

  it('截断不切断代理对（emoji）', () => {
    const composed = composeNoTitleDescription('😀😀😀', '😀'.repeat(10), { maxLen: 4 })
    expect(Array.from(composed).length).toBeLessThanOrEqual(4)
  })
})

describe('publish-capabilities — 注册表结构自检与双版本 parity', () => {
  it('validateRegistry 无问题', () => {
    expect(validateRegistry()).toEqual([])
  })

  it('浏览器版（ESM）导出与 CJS 版同名同构', () => {
    const exports = [
      'PLATFORM_PUBLISH_META',
      'NO_TITLE_PLATFORMS',
      'getPlatformPublishMeta',
      'isNoTitlePlatform',
      'getNoTitlePlatforms',
      'getPlatformContentLimit',
      'getPlatformOverrideFields',
      'getCommonFormFields',
      'getFieldSupport',
      'classifyPublishFields',
      'composeNoTitleDescription',
      'validateRegistry',
    ]
    for (const name of exports) {
      expect(browserModule).toHaveProperty(name)
    }
    expect(Object.keys(browserModule.PLATFORM_PUBLISH_META).sort())
      .toEqual(Object.keys(PLATFORM_PUBLISH_META).sort())
    expect(browserModule.getNoTitlePlatforms().sort()).toEqual(getNoTitlePlatforms().sort())
    expect(browserModule.validateRegistry()).toEqual([])
  })

  it('双版本函数行为一致（分类 / 合成 / 限制）', () => {
    expect(browserModule.classifyPublishFields()).toEqual(classifyPublishFields())
    expect(browserModule.composeNoTitleDescription('T', 'C', { maxLen: 3 })).toBe(composeNoTitleDescription('T', 'C', { maxLen: 3 }))
    expect(browserModule.getPlatformContentLimit('tiktok')).toEqual(getPlatformContentLimit('tiktok'))
    expect(browserModule.getFieldSupport('visibility')).toEqual(getFieldSupport('visibility'))
    expect(browserModule.getPlatformOverrideFields('zhihu', { uiOnly: true }))
      .toEqual(getPlatformOverrideFields('zhihu', { uiOnly: true }))
  })
})
