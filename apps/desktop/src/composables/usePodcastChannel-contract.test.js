/**
 * usePodcastChannel ↔ 引擎 契约锁
 *
 * 锁的是「表单键名 → 引擎合同键名」这一层映射，夹具用**真引擎校验器**（不 mock）：
 * 本仓实测踩过「夹具代替对方剥壳 → 断链在本地全绿下躺了一整轮」，
 * 所以这里必须让真 validateChannel 来判映射后的载荷，而不是断言映射函数返回了某个键。
 *
 * 反证设计：同一份表单**不经映射**直接喂引擎必须判不合格（CHANNEL_CATEGORY_REQUIRED），
 * 这一条就是「映射不是装饰性代码」的现场——把 channelFormToPayload 改成恒等，本用例立刻红。
 */
import { describe, it, expect } from 'vitest'
import { channelFormToPayload, channelPayloadToForm } from './usePodcastChannel'
import podcastRss from '@multi-publish/shared-utils/src/podcast-rss'

const { validateChannel } = podcastRss

/** 用户「看起来已经填全」的频道表单（界面形状：category + subCategory + feedType） */
const FORM = {
  title: '午间电台',
  description: '每天十分钟的科技闲聊',
  subtitle: '',
  language: 'zh-CN',
  author: '老王',
  ownerName: '老王',
  ownerEmail: 'oldwang@example.com',
  explicit: 'no',
  feedType: 'episodic',
  coverUrl: 'https://example.com/cover.png',
  coverSize: '3000x3000',
  category: 'Technology',
  subCategory: 'Podcasting',
  audioSource: 'url',
}

const codesOf = (result) => result.issues.map((i) => i.code)

describe('usePodcastChannel · 表单→引擎合同映射', () => {
  it('映射后的载荷被真引擎判为合格（键名断链在此暴露）', () => {
    const payload = channelFormToPayload(FORM)
    expect(validateChannel(payload).ok).toBe(true)
  })

  it('不经映射的同一份表单被真引擎判为「分类不能为空」——映射是承重的', () => {
    const result = validateChannel({ ...FORM })
    expect(result.ok).toBe(false)
    expect(codesOf(result)).toContain('CHANNEL_CATEGORY_REQUIRED')
  })

  it('categoryId 由「顶级/子级」拼成，且表单键名不外泄', () => {
    const payload = channelFormToPayload(FORM)
    expect(payload.categoryId).toBe('Technology/Podcasting')
    expect(Object.prototype.hasOwnProperty.call(payload, 'category')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(payload, 'subCategory')).toBe(false)
  })

  it('未选子分类时只写顶级，不得留下尾随斜杠', () => {
    expect(channelFormToPayload({ ...FORM, subCategory: '  ' }).categoryId).toBe('Technology')
    expect(codesOf(validateChannel(channelFormToPayload({ ...FORM, subCategory: '' })))).not.toContain('CHANNEL_SUBCATEGORY_UNKNOWN')
  })

  it('回填：已存的 categoryId 拆回两个下拉，未知键原样保留', () => {
    const form = channelPayloadToForm({ ...channelFormToPayload(FORM), createdAt: '2026-10-09T00:00:00.000Z' })
    expect(form.category).toBe('Technology')
    expect(form.subCategory).toBe('Podcasting')
    expect(form.feedType).toBe('episodic')
    expect(form.createdAt).toBe('2026-10-09T00:00:00.000Z')
  })

  it('回填兜底：频道尚未配置时返回完整草稿（不得返回 undefined 让表单塌成空白）', () => {
    for (const bad of [null, undefined, 'x', 0]) {
      const form = channelPayloadToForm(bad)
      expect(form.feedType).toBe('episodic')
      expect(form.language).toBe('zh-CN')
      expect(form.category).toBe('')
    }
  })
})
