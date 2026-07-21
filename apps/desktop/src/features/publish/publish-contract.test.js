import { describe, expect, it } from 'vitest'
import {
  buildPublishTargets,
  getPlatformContentLimit,
  normalizeAccountIds,
  validatePlatformContent,
  validatePublishTargets,
  validateScheduleEntries,
} from './publish-contract'

describe('publish contract', () => {
  it('将单值和数组账号选择归一化并去重', () => {
    expect(normalizeAccountIds('acc-1')).toEqual(['acc-1'])
    expect(normalizeAccountIds(['acc-1', 'acc-1', '', null, 'acc-2'])).toEqual(['acc-1', 'acc-2'])
    expect(normalizeAccountIds(null)).toEqual([])
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

  it('拒绝过去时间、无效时间和超过 30 天的排期', () => {
    const now = Date.parse('2026-07-20T10:00:00.000Z')
    expect(validateScheduleEntries([
      { platform: 'wechat_mp', accountId: 'a', publishTime: '2026-07-20T09:59:00.000Z' },
    ], { now })).toMatchObject({ valid: false })
    expect(validateScheduleEntries([
      { platform: 'wechat_mp', accountId: 'a', publishTime: 'not-a-date' },
    ], { now })).toMatchObject({ valid: false })
    expect(validateScheduleEntries([
      { platform: 'wechat_mp', accountId: 'a', publishTime: '2026-08-20T10:01:00.000Z' },
    ], { now })).toMatchObject({ valid: false })
  })

  it('同一平台同一账号的排期至少间隔 5 分钟', () => {
    const now = Date.parse('2026-07-20T10:00:00.000Z')
    const entries = [
      { platform: 'wechat_mp', accountId: 'a', publishTime: '2026-07-20T11:00:00.000Z' },
      { platform: 'wechat_mp', accountId: 'a', publishTime: '2026-07-20T11:04:59.000Z' },
    ]
    expect(validateScheduleEntries(entries, { now })).toMatchObject({ valid: false })
  })

  it('不同账号可以在同一时间排期', () => {
    const now = Date.parse('2026-07-20T10:00:00.000Z')
    const entries = [
      { platform: 'wechat_mp', accountId: 'a', publishTime: '2026-07-20T11:00:00.000Z' },
      { platform: 'wechat_mp', accountId: 'b', publishTime: '2026-07-20T11:00:00.000Z' },
    ]
    expect(validateScheduleEntries(entries, { now })).toEqual({ valid: true, message: '' })
  })

  it('发布目标要求每个平台至少选择一个账号', () => {
    const result = validatePublishTargets([
      { platform: 'wechat_mp', accountId: 'wx-1' },
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
      { platform: 'wechat_mp', accountId: 'wx-1' },
      { platform: 'wechat_mp', accountId: 'wx-2' },
    ])).toEqual({ valid: true })
  })

  it('平台内容限制来自统一契约', () => {
    expect(getPlatformContentLimit('wechat_mp')).toEqual({ titleMax: 64, contentMax: 20000 })
    expect(getPlatformContentLimit('unknown')).toEqual({ titleMax: 100, contentMax: 5000 })
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
      message: '小红书标题最多 20 个字符，当前 21 个',
    })
  })

  it('未设置差异内容时校验默认文章并接受边界值', () => {
    expect(validatePlatformContent({
      platforms: ['twitter'],
      article: { title: '标题', content: 'x'.repeat(280) },
      platformOverrides: {},
    })).toEqual({ valid: true })

    expect(validatePlatformContent({
      platforms: ['twitter'],
      article: { title: '标题', content: 'x'.repeat(281) },
      platformOverrides: {},
    })).toMatchObject({ valid: false, platform: 'twitter', field: 'content' })
  })
})
