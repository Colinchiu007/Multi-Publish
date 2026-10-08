import { describe, expect, it } from 'vitest'
import {
  APP_ARTICLE_CONTENT_MAX,
  applyPlatformContentConversion,
  buildPublishTargets,
  getPlatformContentLimit,
  minContentBudget,
  normalizeAccountIds,
  normalizePublishFiles,
  normalizePublishMentions,
  normalizePublishStringList,
  truncateByChars,
  truncateByUtf8Bytes,
  truncateContentForPlatform,
  utf8ByteLength,
  validatePlatformContent,
  validatePublishMetadata,
  validatePublishTargets,
  validateScheduleEntries,
} from './publish-contract'

describe('publish contract', () => {
  it('将单值和数组账号选择归一化并去重', () => {
    expect(normalizeAccountIds('acc-1')).toEqual(['acc-1'])
    expect(normalizeAccountIds(['acc-1', 'acc-1', '', null, 'acc-2'])).toEqual(['acc-1', 'acc-2'])
    expect(normalizeAccountIds(null)).toEqual([])
  })

  it('归一化标签、话题、文件和 @好友为可结构化克隆值', () => {
    expect(normalizePublishStringList('AI, 效率，AI')).toEqual(['AI', '效率'])
    expect(normalizePublishFiles([
      { path: 'D:/a.png', name: 'a.png', type: 'image/png' },
      { path: 'D:/a.png', name: 'duplicate.png' },
    ])).toEqual([{ path: 'D:/a.png', name: 'a.png', type: 'image/png' }])
    expect(normalizePublishMentions('@张三, 张三, @李四')).toEqual([
      { name: '张三', text: '@张三' },
      { name: '李四', text: '@李四' },
    ])
  })

  it('元数据合同接受可选字段并拒绝不可克隆类型', () => {
    expect(validatePublishMetadata({
      tags: ['AI'],
      topics: '效率工具',
      mentions: '@张三',
      images: [{ path: 'D:/a.png', name: 'a.png' }],
      cover_file: { path: 'D:/cover.png', name: 'cover.png' },
    })).toEqual({ valid: true })
    expect(validatePublishMetadata({ tags: 42 })).toMatchObject({ valid: false, field: 'tags' })
    expect(validatePublishMetadata({ tags: [{ invalid: true }] })).toMatchObject({ valid: false, field: 'tags' })
    expect(validatePublishMetadata({ images: [{ invalid: true }] })).toMatchObject({ valid: false, field: 'images' })
    expect(validatePublishMetadata({ cover_file: { invalid: true } })).toMatchObject({ valid: false, field: 'cover_file' })
  })

  it('为同一平台展开多个独立发布目标', () => {
    expect(buildPublishTargets(
      ['wechat_mp', 'zhihu'],
      { wechat_mp: ['wx-a', 'wx-b'], zhihu: 'zh-a' },
    )).toEqual([
      { platform: 'wechat_mp', accountId: 'wx-a' },
      { platform: 'wechat_mp', accountId: 'wx-b' },
      { platform: 'zhihu', accountId: 'zh-a' },
    ])
  })

  it('没有选中账号时保留一个待绑定目标', () => {
    expect(buildPublishTargets(['wechat_mp'], {})).toEqual([
      { platform: 'wechat_mp', accountId: null },
    ])
  })

  it('拒绝过去时间、无效时间和超过头条 7 天上限的排期', () => {
    const now = Date.parse('2026-07-20T10:00:00.000Z')
    expect(validateScheduleEntries([
      { platform: 'toutiao', accountId: 'a', publishTime: '2026-07-20T09:59:00.000Z' },
    ], { now })).toMatchObject({ valid: false })
    expect(validateScheduleEntries([
      { platform: 'toutiao', accountId: 'a', publishTime: 'not-a-date' },
    ], { now })).toMatchObject({ valid: false })
    // 2026-08-20T10:01Z 距 now 恰好 31 天 + 1 分钟：头条上限 7 天 ⇒ 被拒
    expect(validateScheduleEntries([
      { platform: 'toutiao', accountId: 'a', publishTime: '2026-08-20T10:01:00.000Z' },
    ], { now })).toMatchObject({ valid: false })
  })

  it('同一平台同一账号的排期至少间隔 5 分钟', () => {
    const now = Date.parse('2026-07-20T10:00:00.000Z')
    const entries = [
      { platform: 'toutiao', accountId: 'a', publishTime: '2026-07-20T11:00:00.000Z' },
      { platform: 'toutiao', accountId: 'a', publishTime: '2026-07-20T11:04:59.000Z' },
    ]
    expect(validateScheduleEntries(entries, { now })).toMatchObject({ valid: false })
  })

  it('不同账号可以在同一时间排期', () => {
    const now = Date.parse('2026-07-20T10:00:00.000Z')
    const entries = [
      { platform: 'toutiao', accountId: 'a', publishTime: '2026-07-20T11:00:00.000Z' },
      { platform: 'toutiao', accountId: 'b', publishTime: '2026-07-20T11:00:00.000Z' },
    ]
    expect(validateScheduleEntries(entries, { now })).toEqual({ valid: true, message: '' })
  })

  // ── 平台侧定时能力门禁（2026-10-07）─────────────────────────
  // 关键安全属性：不支持平台侧定时的平台必须在**提交前**被拦住，
  // 绝不允许「用户以为已排期、内容实际立即发出」（参考产品的 7 个平台正是如此）。
  describe('平台侧定时能力门禁', () => {
    const now = Date.parse('2026-07-20T10:00:00.000Z')

    it('不支持平台侧定时的平台在提交前被阻断', () => {
      const result = validateScheduleEntries([
        { platform: 'zhihu', accountId: 'a', publishTime: '2026-07-20T11:00:00.000Z' },
      ], { now })
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('schedulePlatformUnsupported')
      expect(result.params.platform).toBe('zhihu')
    })

    it('未取证的平台同样被阻断（fail-closed，绝不默认支持）', () => {
      const result = validateScheduleEntries([
        { platform: 'totally-unknown-platform', accountId: 'a', publishTime: '2026-07-20T11:00:00.000Z' },
      ], { now })
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('schedulePlatformUnsupported')
    })

    it('批量场景中只要有一个平台不支持就整体阻断', () => {
      const result = validateScheduleEntries([
        { platform: 'toutiao', accountId: 'a', publishTime: '2026-07-20T11:00:00.000Z' },
        { platform: 'weibo', accountId: 'b', publishTime: '2026-07-20T12:00:00.000Z' },
      ], { now })
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('schedulePlatformUnsupported')
    })

    it('短于平台最小提前量（头条 5 分钟）时阻断', () => {
      const result = validateScheduleEntries([
        { platform: 'toutiao', accountId: 'a', publishTime: '2026-07-20T10:02:00.000Z' },
      ], { now })
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('scheduleTooSoon')
      expect(result.params.minMinutes).toBe(5)
    })

    it('平台跨度上限比全局上限更严时，以平台为准（头条 7 天，2026-10-08 平台 bundle 取证）', () => {
      // publishTime = now + 8 天 - 1 分钟：超过头条 7 天、但未超全局 30 天，
      // 才能命中「平台分支返回平台上限」而不是先被全局检查拦下
      const result = validateScheduleEntries([
        { platform: 'toutiao', accountId: 'a', publishTime: '2026-07-28T09:59:00.000Z' },
      ], { now })
      expect(result.valid).toBe(false)
      expect(result.reason).toBe('scheduleExceedsMaxDays')
      expect(result.params.maxDays).toBe(7)
    })

    it('支持平台在合法窗口内通过', () => {
      const result = validateScheduleEntries([
        { platform: 'toutiao', accountId: 'a', publishTime: '2026-07-21T11:00:00.000Z' },
      ], { now })
      expect(result.valid).toBe(true)
    })

    it('立即发布（无 publishTime）不受能力门禁影响', () => {
      const result = validateScheduleEntries([
        { platform: 'zhihu', accountId: 'a' },
      ], { now })
      expect(result.valid).toBe(true)
    })
  })

  it('发布目标要求每个平台至少选择一个账号', () => {
    const result = validatePublishTargets([
      { platform: 'toutiao', accountId: 'wx-1' },
      { platform: 'zhihu', accountId: null },
    ])

    expect(result).toEqual({
      valid: false,
      platform: 'zhihu',
      message: '请为知乎选择至少一个账号',
    })
  })

  it('发布目标拒绝空数组并接受多个有效账号', () => {
    expect(validatePublishTargets([])).toMatchObject({ valid: false })
    expect(validatePublishTargets([
      { platform: 'toutiao', accountId: 'wx-1' },
      { platform: 'toutiao', accountId: 'wx-2' },
    ])).toEqual({ valid: true })
  })

  it('平台内容限制来自统一契约', () => {
    expect(getPlatformContentLimit('wechat_mp')).toEqual({ titleMax: 64, contentMax: 20000 })
    expect(getPlatformContentLimit('baijiahao')).toEqual({ titleMaxBytes: 149, contentMax: 100000 })
    expect(getPlatformContentLimit('unknown')).toEqual({ titleMax: 100, contentMax: 5000 })
  })

  it('百家号标题超过 149 字节时返回明确字段', () => {
    const result = validatePlatformContent({
      platforms: ['baijiahao'],
      article: { title: '外婆的灶台总飘着豆瓣香的雾气。那年我离家求学，她往行李塞了一罐自制辣酱。十年后我回乡，罐子还在，人已不在，我终于读懂了那口辣里的甜。', content: '正文' },
      platformOverrides: {},
    })

    expect(result).toMatchObject({
      valid: false,
      platform: 'baijiahao',
      field: 'title',
      limit: 149,
      unit: '字节',
    })
    // 66 个中文字符 = 198 字节，超过 149 字节上限
    expect(result.actual).toBe(198)
  })

  it('truncateByChars 按码点截断并保留边界值', () => {
    expect(truncateByChars('外婆的灶台总飘着豆瓣香', 50)).toBe('外婆的灶台总飘着豆瓣香')
    expect(truncateByChars('外婆的灶台总飘着豆瓣香的雾气。那年我离家求学，她往行李塞了一罐自制辣酱。十年后我回乡，罐子还在，人已不在，我终于读懂了那口辣里的甜。', 50).length).toBe(50)
    // emoji 是代理对，截断不能切成半个字符
    expect(truncateByChars('a😀b', 2)).toBe('a😀')
    expect(truncateByChars(null, 5)).toBe('')
    expect(truncateByChars('  x  ', 5)).toBe('x')
  })

  it('utf8ByteLength 计算 UTF-8 字节数（中文 3 字节、英文 1 字节、emoji 4 字节）', () => {
    expect(utf8ByteLength('')).toBe(0)
    expect(utf8ByteLength('abc')).toBe(3)
    expect(utf8ByteLength('外婆')).toBe(6)
    expect(utf8ByteLength('a中b')).toBe(5)
    // emoji 😀 是 4 字节 UTF-8
    expect(utf8ByteLength('😀')).toBe(4)
    expect(utf8ByteLength(null)).toBe(0)
  })

  it('truncateByUtf8Bytes 按字节截断且不切断代理对', () => {
    // 50 个中文字符 = 150 字节，超过 149 上限，截断后必须 <= 149 字节
    const fiftyCn = '外'.repeat(50)
    const truncated = truncateByUtf8Bytes(fiftyCn, 149)
    expect(utf8ByteLength(truncated)).toBe(147)
    expect(truncated).toBe('外'.repeat(49))

    // 混合字符：49 中文 + 1 英文 = 148 字节，未超限保留
    const mixed = '外'.repeat(49) + 'a'
    expect(truncateByUtf8Bytes(mixed, 149)).toBe(mixed)

    // 边界：恰好 149 字节保留
    const atLimit = '外'.repeat(49) + 'a' + 'b'
    expect(utf8ByteLength(atLimit)).toBe(149)
    expect(truncateByUtf8Bytes(atLimit, 149)).toBe(atLimit)

    // emoji 是代理对，截断不能切成半个字符（😀=4 字节，上限 5 字节时保留完整 emoji）
    expect(truncateByUtf8Bytes('a😀b', 5)).toBe('a😀')
    expect(truncateByUtf8Bytes('a😀b', 4)).toBe('a')

    // 空值/空白
    expect(truncateByUtf8Bytes(null, 149)).toBe('')
    expect(truncateByUtf8Bytes('  x  ', 149)).toBe('x')
  })

  it('差异化内容超过平台限制时返回明确字段', () => {
    const result = validatePlatformContent({
      platforms: ['xiaohongshu'],
      article: { title: '默认标题', content: '默认正文' },
      platformOverrides: {
        xiaohongshu: { title: '超'.repeat(21), content: '正文' },
      },
    })

    expect(result).toEqual({
      valid: false,
      platform: 'xiaohongshu',
      field: 'title',
      limit: 20,
     actual: 21,
     unit: '个字符',
      message: '小红书标题最多 20 个字符，当前 21 个',
   })
  })

  it('未设置差异内容时校验默认文章并接受边界值（无标题平台按合并口径）', () => {
    // twitter 为无标题平台：标题合并进正文首行（'标题\n' + 277 字符 = 280）恰好在限。
    expect(validatePlatformContent({
      platforms: ['twitter'],
      article: { title: '标题', content: 'x'.repeat(277) },
      platformOverrides: {},
    })).toEqual({ valid: true })

    // 合并后超限：'标题\n' + 281 字符 = 284 > 280，field 为 content（合并口径）。
    expect(validatePlatformContent({
      platforms: ['twitter'],
      article: { title: '标题', content: 'x'.repeat(281) },
      platformOverrides: {},
    })).toMatchObject({ valid: false, platform: 'twitter', field: 'content', limit: 280, actual: 284 })
  })

  it('无标题平台合并校验：仅标题/仅正文/两者皆空均不误报', () => {
    // 仅标题（发布链路会把标题作为描述全文）
    expect(validatePlatformContent({
      platforms: ['weibo'],
      article: { title: '只有标题', content: '' },
      platformOverrides: {},
    })).toEqual({ valid: true })
    // 仅正文
    expect(validatePlatformContent({
      platforms: ['tencent_video'],
      article: { title: '', content: '正文'.repeat(300) },
      platformOverrides: {},
    })).toEqual({ valid: true })
    // 两者皆空
    expect(validatePlatformContent({
      platforms: ['kuaishou'],
      article: { title: '', content: '' },
      platformOverrides: {},
    })).toEqual({ valid: true })
  })

  it('无标题平台合并超限的提示文案包含「标题计入首行」', () => {
    const result = validatePlatformContent({
      platforms: ['instagram'],
      article: { title: '标题', content: 'x'.repeat(2200) },
      platformOverrides: {},
    })
    expect(result.valid).toBe(false)
    expect(result.message).toBe('Instagram正文最多 2200 个字符（标题计入首行），当前 2203 个')
  })

  it('有标题平台不合并：标题与正文分别校验', () => {
    // xiaohongshu 有标题：title 21 字超 20 上限仍按 title 字段报错（不合并）
    const result = validatePlatformContent({
      platforms: ['xiaohongshu'],
      article: { title: '超'.repeat(21), content: '正文' },
      platformOverrides: {},
    })
    expect(result).toMatchObject({ valid: false, field: 'title', limit: 20 })
  })

  it('无标题平台差异化覆盖内容同样按合并口径校验', () => {
    const result = validatePlatformContent({
      platforms: ['tiktok'],
      article: { title: '默认标题', content: '默认正文' },
      platformOverrides: { tiktok: { title: '覆盖标题', content: 'c'.repeat(2200) } },
    })
    expect(result).toMatchObject({ valid: false, platform: 'tiktok', field: 'content', actual: 2205 })
  })

  it('平台限制来自发布能力注册表（douyin/tiktok 修复项生效）', () => {
    // 旧表 douyin contentMax=0（不校验）→ 注册表 1000
    expect(getPlatformContentLimit('douyin')).toEqual({ titleMax: 55, contentMax: 5000 })
    // 旧表 tiktok title 2200/content 0 → 注册表 caption 语义 content 2200
    expect(getPlatformContentLimit('tiktok')).toEqual({ titleMax: 0, contentMax: 2200 })
    // 旧表缺条目回落默认 5000 → 注册表补齐
    expect(getPlatformContentLimit('tencent_video')).toEqual({ titleMax: 0, contentMax: 5000 })
    expect(getPlatformContentLimit('kuaishou')).toEqual({ titleMax: 0, contentMax: 480 })
    expect(getPlatformContentLimit('facebook')).toEqual({ titleMax: 100, contentMax: 63206 })
  })
})

describe('truncateContentForPlatform（正文超平台上限时自动裁剪，2026-10-01）', () => {
  it('未超限时原样返回（不 trim 掉正文内部结构）', () => {
    expect(truncateContentForPlatform('kuaishou', '短正文', '标题')).toBe('短正文')
  })

  it('无标题平台（快手 titleMax=0）需扣除「标题计入首行」的长度', () => {
    // 快手校验口径：composeNoTitleDescription(title, content) 的长度 <= contentMax。
    // 故正文预算 = contentMax - 标题长度，否则会出现「裁到 1000 后仍报 1021」的漂移
    // （E2E 实测：正文 997 + 标题 24 = 1021 > 1000）。
    const title = '标'.repeat(20)
    const content = '正'.repeat(6000)
    const out = truncateContentForPlatform('kuaishou', content, title)
    expect(Array.from(out).length).toBe(459)
    // 合并后（标题 + 换行分隔符 + 正文）恰好等于快手上限 480，不超
    expect(Array.from(title).length + 1 + Array.from(out).length).toBe(480)
  })

  it('有标题平台（抖音 titleMax=55）按 contentMax 裁剪，不扣标题', () => {
    const title = '标'.repeat(20)
    const content = '正'.repeat(6000)
    const out = truncateContentForPlatform('douyin', content, title)
    expect(Array.from(out).length).toBe(5000)
  })

  it('上限足够大时不裁剪', () => {
    const content = '正'.repeat(5000)
    expect(truncateContentForPlatform('facebook', content, '标题')).toBe(content)
  })

  it('按码点裁剪，不切碎代理对（emoji）', () => {
    const content = '😀'.repeat(6000)
    const out = truncateContentForPlatform('douyin', content, '')
    expect(Array.from(out).length).toBe(5000)
    expect(out.endsWith('\uD83D\uDE00')).toBe(true)
  })
})

describe('minContentBudget（按所有选中平台取最小正文预算，2026-10-01）', () => {
  it('含无标题平台时扣除标题长度（快手的标题计入描述首行）', () => {
    // kuaishou: titleMax=0, contentMax=480；标题 20 字 + 1 个换行分隔符 ⇒ 预算 979
    // douyin:    titleMax=55, contentMax=5000 ⇒ 预算 1000
    // 取最小 ⇒ 459（否则会出现"裁到刚好后快手仍报 1001"的多轮反复）
    expect(minContentBudget(['kuaishou', 'douyin'], '标'.repeat(20))).toBe(459)
  })

  it('全为有标题平台时取最小 contentMax（不扣标题）', () => {
    const withTitle = minContentBudget(['douyin'], '标'.repeat(30))
    expect(withTitle).toBe(5000)
  })

  it('无受限平台（空列表 / 上限为 0）返回 null', () => {
    expect(minContentBudget([], '标题')).toBe(null)
    expect(minContentBudget(null, '标题')).toBe(null)
    expect(minContentBudget(['douyin', 'douyin'], '')).toBe(5000)
  })

  it('重复平台去重后不影响结果', () => {
    expect(minContentBudget(['kuaishou', 'kuaishou'], '标'.repeat(20)))
      .toBe(minContentBudget(['kuaishou'], '标'.repeat(20)))
  })
})

describe('applyPlatformContentConversion（按平台生成差异化截断覆盖，2026-10-02）', () => {
  it('只截断超限平台：未超限平台保留全文且不写覆盖', () => {
    // wechat_mp contentMax=20000（不超）；xiaohongshu contentMax=5000（超）
    const content = '正'.repeat(8000)
    const article = { title: '标题', content }
    const overrides = {}
    const { truncations } = applyPlatformContentConversion({
      platforms: ['wechat_mp', 'xiaohongshu'],
      article,
      platformOverrides: overrides,
    })
    expect(article.content).toBe(content) // 全局正文不被改（公众号保持全文）
    expect(overrides.wechat_mp).toBeUndefined()
    expect(Array.from(overrides.xiaohongshu.content).length).toBe(5000)
    expect(truncations).toEqual([
      { platform: 'xiaohongshu', label: '小红书', limit: 5000, before: 8000, after: 5000 },
    ])
  })

  it('无标题平台按合并预算截断（快手：标题计入首行）', () => {
    const title = '标'.repeat(20)
    const article = { title, content: '正'.repeat(6000) }
    const overrides = {}
    const { truncations } = applyPlatformContentConversion({
      platforms: ['kuaishou'],
      article,
      platformOverrides: overrides,
    })
    // 预算 480 - 20 - 1 = 459（与 truncateContentForPlatform 同口径）
    expect(Array.from(overrides.kuaishou.content).length).toBe(459)
    expect(truncations).toEqual([
      { platform: 'kuaishou', label: '快手', limit: 480, before: 6000, after: 459 },
    ])
  })

  it('尊重用户已有的平台覆盖：只对超限覆盖值截断', () => {
    const article = { title: '标题', content: '正'.repeat(6000) }
    const overrides = { douyin: { title: '', content: '覆'.repeat(6000) } }
    const { truncations } = applyPlatformContentConversion({
      platforms: ['douyin'],
      article,
      platformOverrides: overrides,
    })
    // douyin 覆盖 6000 > 5000 → 截断覆盖值，而不是全局正文
    expect(Array.from(overrides.douyin.content).length).toBe(5000)
    expect(article.content.length).toBe(6000)
    expect(truncations).toEqual([
      { platform: 'douyin', label: '抖音', limit: 5000, before: 6000, after: 5000 },
    ])
  })

  it('幂等：对已截断内容再次调用不产生新记录', () => {
    const article = { title: '标题', content: '正'.repeat(8000) }
    const overrides = {}
    const first = applyPlatformContentConversion({
      platforms: ['xiaohongshu'],
      article,
      platformOverrides: overrides,
    })
    expect(first.truncations.length).toBe(1)
    const second = applyPlatformContentConversion({
      platforms: ['xiaohongshu'],
      article,
      platformOverrides: overrides,
    })
    expect(second.truncations).toEqual([])
    expect(overrides.xiaohongshu.content).toBe(first.overrides.xiaohongshu.content)
  })

  it('边界：空平台列表 / 未知平台 / 上限为 0 时安全跳过', () => {
    const article = { title: 't', content: '正'.repeat(10000) }
    const overrides = {}
    expect(applyPlatformContentConversion({ platforms: [], article, platformOverrides: overrides }).truncations).toEqual([])
    expect(applyPlatformContentConversion({ platforms: null, article, platformOverrides: overrides }).truncations).toEqual([])
    // unknown 平台回落 contentMax=5000 → 会截断（回落语义与 validatePlatformContent 一致）
    const unknown = applyPlatformContentConversion({ platforms: ['unknown_platform'], article, platformOverrides: overrides })
    expect(unknown.truncations).toEqual([
      { platform: 'unknown_platform', label: 'unknown_platform', limit: 5000, before: 10000, after: 5000 },
    ])
  })

  it('全平台未超限时 overrides 原对象保持不变（引用相等）', () => {
    const content = '短正文'
    const article = { title: 't', content }
    const overrides = { weibo: { title: '', content: '手填描述' } }
    const result = applyPlatformContentConversion({
      platforms: ['wechat_mp', 'facebook'],
      article,
      platformOverrides: overrides,
    })
    expect(result.truncations).toEqual([])
    expect(result.overrides).toBe(overrides)
    expect(overrides.weibo.content).toBe('手填描述')
  })

  it('多平台截断记录顺序与平台选择顺序一致', () => {
    const article = { title: '标'.repeat(20), content: '正'.repeat(6000) }
    const overrides = {}
    const { truncations } = applyPlatformContentConversion({
      platforms: ['douyin', 'kuaishou', 'twitter'],
      article,
      platformOverrides: overrides,
    })
    expect(truncations.map(t => t.platform)).toEqual(['douyin', 'kuaishou', 'twitter'])
    // twitter caption 上限 280，标题 20 + 分隔 1 → 预算 259
    expect(truncations[2]).toMatchObject({ platform: 'twitter', limit: 280, after: 259 })
  })
})

describe('APP_ARTICLE_CONTENT_MAX（应用端图文正文字数上限）', () => {
  it('应用上限为 10000 且挂入契约常量', () => {
    expect(APP_ARTICLE_CONTENT_MAX).toBe(10000)
  })
})
