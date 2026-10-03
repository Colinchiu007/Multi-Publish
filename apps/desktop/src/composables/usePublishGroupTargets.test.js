import { describe, it, expect, vi } from 'vitest'
import { usePlatformSelection } from './usePlatformSelection'
import { usePublishGroupTargets } from './usePublishGroupTargets'
import i18n from '@/i18n'

const PLATFORMS = [
  { id: 'wechat_mp', label: '微信公众号' },
  { id: 'douyin', label: '抖音' },
  { id: 'zhihu', label: '知乎' },
]

const ACCOUNTS = [
  { id: 'w1', platform: 'wechat_mp' },
  { id: 'd1', platform: 'douyin' },
  { id: 'd2', platform: 'douyin', is_active: false },
  { id: 'z1', platform: 'zhihu' },
]

function makeHarness (opts = {}) {
  const accountStore = {
    accounts: ACCOUNTS,
    byPlatform: {
      wechat_mp: ACCOUNTS.filter(a => a.platform === 'wechat_mp'),
      douyin: ACCOUNTS.filter(a => a.platform === 'douyin'),
      zhihu: ACCOUNTS.filter(a => a.platform === 'zhihu'),
    },
    getDefault: () => null,
    groups: opts.groups ?? [],
    groupsStatus: opts.groupsStatus ?? 'ok',
  }
  // 这里注入**真的** usePlatformSelection，不 mock 选择层：本文件最要紧的三条结论
  // （平台被真的选中、账号进的是那个键、二次点击不产生写入）只有跑真实选中集才算证。
  const selection = usePlatformSelection(accountStore, null)
  const notifyInfo = vi.fn()
  const notifyWarning = vi.fn()
  const api = usePublishGroupTargets({ accountStore, selection, platforms: PLATFORMS, notifyInfo, notifyWarning })
  return { accountStore, selection, notifyInfo, notifyWarning, api }
}

const t = (key, named) => i18n.global.t(key, named || {})

describe('usePublishGroupTargets（按组添加接线层）', () => {
  it('真源读不到时不给出可操作分组（groups 残留 ≠ 可以点，§九 L6）', () => {
    const groups = [{ id: 'g1', name: '主力', platformFilter: null, accountIds: ['w1', 'd1'] }]
    const unreadable = makeHarness({ groups, groupsStatus: 'unreadable' })
    expect(unreadable.api.groupPickerItems.value).toEqual([])
    // 状态面判据之外的路径也必须拒绝：越权直接调 id 也不得改选中集
    const before = JSON.stringify(unreadable.selection.selectedPlatforms.value)
    expect(unreadable.api.applyGroupById('g1')).toEqual({ ok: false, reason: 'invalid-group' })
    expect(JSON.stringify(unreadable.selection.selectedPlatforms.value)).toBe(before)
  })

  it('可操作态照常给出「可添加/成员」，停用账号只减可添加数不减成员数', () => {
    const groups = [{ id: 'g1', name: '主力', platformFilter: null, accountIds: ['w1', 'd1', 'd2'] }]
    const { api } = makeHarness({ groups })
    expect(api.groupPickerItems.value).toEqual([{ id: 'g1', name: '主力', applicable: 2, total: 3 }])
  })

  it('点组：真实选中集同时拿到平台与账号，播报里的数字与实际写入条数一致', () => {
    const groups = [{ id: 'g1', name: '跨平台组', platformFilter: null, accountIds: ['w1', 'd1'] }]
    const { api, selection, notifyInfo, notifyWarning } = makeHarness({ groups })
    // 起始态：只有默认勾选的 wechat_mp，且它的选中集里还没有账号
    expect(selection.selectedPlatforms.value).toEqual(['wechat_mp'])

    const result = api.applyGroupById('g1')

    // 起始态实测：wechat_mp 虽已勾选平台，但选中集是空的（`{}`），所以 w1 也是新增；
    // 新启用的平台只有 douyin —— 这两件事必须分开播报，见 §五 第 4 条。
    expect(result.added).toEqual([
      { platformId: 'wechat_mp', accountId: 'w1' },
      { platformId: 'douyin', accountId: 'd1' },
    ])
    expect(result.platforms).toEqual(['douyin'])
    expect(selection.selectedPlatforms.value).toEqual(['wechat_mp', 'douyin'])
    expect(selection.getSelectedAccountIds('douyin')).toEqual(['d1'])
    expect(selection.getSelectedAccountIds('wechat_mp')).toEqual(['w1'])
    expect(notifyWarning).not.toHaveBeenCalled()
    expect(notifyInfo).toHaveBeenCalledTimes(1)
    const message = notifyInfo.mock.calls[0][1].message
    expect(message).toBe(t('publishPage.groupPicker.added', {
      name: '跨平台组',
      added: 2,
      platformText: t('publishPage.groupPicker.platformsEnabled', { platforms: '抖音' }),
    }))
    expect(notifyInfo.mock.calls[0][0]).toBe('publishPage.groupPicker.added')
  })

  it('再点同一组：不产生任何写入、不谎报添加（幂等，§九 L4）', () => {
    const groups = [{ id: 'g1', name: '主力', platformFilter: null, accountIds: ['d1'] }]
    const { api, selection, notifyInfo, notifyWarning } = makeHarness({ groups })
    api.applyGroupById('g1')
    notifyInfo.mockClear()

    const snapshot = JSON.stringify({ p: selection.selectedPlatforms.value, a: selection.selectedAccounts.value })
    const again = api.applyGroupById('g1')

    expect(again.added).toEqual([])
    expect(again.already).toEqual([{ platformId: 'douyin', accountId: 'd1' }])
    expect(JSON.stringify({ p: selection.selectedPlatforms.value, a: selection.selectedAccounts.value })).toBe(snapshot)
    expect(notifyWarning).not.toHaveBeenCalled()
    // 播报必须换成"已在选中集"，且文案里不得出现"添加 N 个"
    expect(notifyInfo.mock.calls[0][0]).toBe('publishPage.groupPicker.alreadySelected')
    expect(notifyInfo.mock.calls[0][1].message).toBe(t('publishPage.groupPicker.alreadySelected', { count: 1 }))
  })

  it('组内账号全部不可用时不启用任何平台，并走 warning（不得留下半个选中集）', () => {
    const groups = [{ id: 'g1', name: '死号组', platformFilter: null, accountIds: ['d2', 'ghost'] }]
    const { api, selection, notifyInfo, notifyWarning } = makeHarness({ groups })

    const result = api.applyGroupById('g1')

    expect(result.added).toEqual([])
    expect(result.skipped).toEqual([
      { accountId: 'd2', reason: 'inactive' },
      { accountId: 'ghost', reason: 'missing' },
    ])
    expect(selection.selectedPlatforms.value).toEqual(['wechat_mp'])
    expect(selection.getSelectedAccountIds('douyin')).toEqual([])
    expect(notifyInfo).not.toHaveBeenCalled()
    expect(notifyWarning.mock.calls[0][0]).toBe('publishPage.groupPicker.nothingToAdd')
  })

  it('空组只提示"还没有成员"，不触碰选中集', () => {
    const groups = [{ id: 'g1', name: '空组', platformFilter: null, accountIds: [] }]
    const { api, selection, notifyWarning, notifyInfo } = makeHarness({ groups })

    expect(api.groupPickerItems.value).toEqual([{ id: 'g1', name: '空组', applicable: 0, total: 0 }])
    const result = api.applyGroupById('g1')

    expect(result.reason).toBe('empty-group')
    expect(selection.selectedPlatforms.value).toEqual(['wechat_mp'])
    expect(notifyInfo).not.toHaveBeenCalled()
    expect(notifyWarning.mock.calls[0][1].message).toBe(t('publishPage.groupPicker.emptyGroup'))
  })

  it('部分成员被跳过时，播报必须同时带上新启用平台与跳过条数（不得只报成功的一半）', () => {
    const groups = [{ id: 'g1', name: '混合组', platformFilter: null, accountIds: ['d1', 'd2', 'z1'] }]
    const { api, notifyInfo } = makeHarness({ groups })

    api.applyGroupById('g1')

    const message = notifyInfo.mock.calls[0][1].message
    expect(message).toBe(
      t('publishPage.groupPicker.added', {
        name: '混合组',
        added: 2,
        platformText: t('publishPage.groupPicker.platformsEnabled', { platforms: '抖音、知乎' }),
      }) + t('publishPage.groupPicker.skipped', { skipped: 1 }),
    )
  })
})
