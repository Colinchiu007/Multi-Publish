/**
 * 真机 E2E 发现的三个 UI 缺陷的回归锁（2026-10-07，PR #3033）。
 *
 * D1「定时发布 15/15 平台支持」：fieldSupportText('schedule') 统计的是
 *    「发布链路接入了 schedule 字段」，与平台能否真正接下排期无关。
 *    平台侧定时架构下 14 个平台的排期会在提交前被显式阻断，
 *    徽标却宣称 15/15 支持 —— 这是「以为已排期、实际已发出」的前置诱因。
 * D2 阻断原因只在页面底部结果面板，点发布后当场无 toast。
 * D3 提示里出现内部 id（baijiahao / toutiao）而非界面上的中文平台名。
 */
import { describe, expect, it } from 'vitest'

import { usePublishFieldSurface } from './usePublishFieldSurface'
import { validateScheduleEntries } from './publish-schedule-contract'

const surface = () => usePublishFieldSurface()

describe('定时发布能力提示（D1：徽标不再谎报支持范围）', () => {
  it('所选平台全部支持时，给出平台名而非「15/15 支持」', () => {
    const text = surface().scheduleCapabilityHint(['toutiao'])
    expect(text).toBeTruthy()
    expect(text).toContain('今日头条')
    // 关键：不得再出现「N/15 平台支持」这种与真实能力无关的徽标文案
    expect(text).not.toMatch(/\d+\s*\/\s*15/)
    expect(text).not.toContain('平台支持')
  })

  it('混选时点名不支持的平台，让用户在勾选阶段就看到后果', () => {
    const text = surface().scheduleCapabilityHint(['toutiao', 'baijiahao', 'zhihu'])
    expect(text).toContain('今日头条')
    expect(text).toContain('百家号')
    expect(text).toContain('知乎')
    // 不支持的平台必须被区分出来，而不是混在「支持」里
    expect(text).not.toMatch(/\d+\s*\/\s*15/)
  })

  it('未选平台 / 所选全部不支持 ⇒ 空串（不渲染徽标，不显示假证据）', () => {
    expect(surface().scheduleCapabilityHint([])).toBe('')
    expect(surface().scheduleCapabilityHint(undefined)).toBe('')
    expect(surface().scheduleCapabilityHint(['zhihu', 'weibo'])).toBe('')
  })

  it('不影响其它字段的既有徽标语义（tags/cover 仍走注册表口径）', () => {
    const fn = surface().fieldSupportText
    expect(fn('tags')).toMatch(/\d+\s*\/\s*15/)
    expect(fn('schedule')).toMatch(/\d+\s*\/\s*15/) // 注册表口径未被改动
    // 两者分离：字段徽标仍是注册表口径，定时提示走能力表
    expect(surface().scheduleCapabilityHint(['toutiao'])).not.toBe(fn('schedule'))
  })
})

describe('定时校验提示（D3：显示平台名而非内部 id）', () => {
  const now = Date.parse('2026-10-07T10:00:00.000Z')

  it('注入 platformLabel 后，阻断提示显示平台展示名', () => {
    const label = (id) => ({ baijiahao: '百家号', zhihu: '知乎' }[id] || id)
    // 模拟真实 locale 模板：只插值 {platform}（zh: '{platform} 暂不支持定时发布…'），
    // 而不是把整个 params 序列化 —— 否则 params 里的 platformId 会混进文案，
    // 让断言测到的是夹具的假象而不是真实呈现。
    const translate = (key, p) => `${key}: ${p.platform}`.trim()
    const r = validateScheduleEntries(
      [{ platform: 'baijiahao', accountId: 'a', publishTime: '2026-10-08T10:00:00.000Z' }],
      { now, translate, platformLabel: label }
    )
    expect(r.valid).toBe(false)
    expect(r.params.platform).toBe('百家号')
    expect(r.params.platformId).toBe('baijiahao') // 内部 id 仍保留，便于定位
    expect(r.message).toContain('百家号')
    expect(r.message).not.toContain('baijiahao')
  })

  it('未注入 platformLabel 时保持原行为（哑实现：默认恒等，不臆造文案）', () => {
    const r = validateScheduleEntries(
      [{ platform: 'zhihu', accountId: 'a', publishTime: '2026-10-08T10:00:00.000Z' }],
      { now }
    )
    expect(r.valid).toBe(false)
    expect(r.params.platform).toBe('zhihu')
  })

  it('提前量不足的提示同样使用平台展示名', () => {
    const r = validateScheduleEntries(
      [{ platform: 'toutiao', accountId: 'a', publishTime: '2026-10-07T10:02:00.000Z' }],
      { now, translate: (k, p) => `${k}: ${p.platform}`, platformLabel: () => '今日头条' }
    )
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('scheduleTooSoon')
    expect(r.params.platform).toBe('今日头条')
  })
})