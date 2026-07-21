import { describe, expect, it } from 'vitest'
import {
  buildPublishTargets,
  normalizeAccountIds,
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
})
