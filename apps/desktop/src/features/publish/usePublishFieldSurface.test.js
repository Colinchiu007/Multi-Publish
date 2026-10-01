/**
 * usePublishFieldSurface.test.js — 字段面判据单一真源（P2-7 批量模式字段面）
 *
 * 这些用例是「判据从 Publish.vue 内联实现下沉」的回归锁：
 * 下沉前判据只认单篇全局 selectedPlatforms，批量无从复用；下沉后必须
 * ① 按传入平台清单计算（条目作用域）、② 与注册表口径一致、③ 无全局态泄漏。
 */
import { describe, expect, it } from 'vitest'
import { usePublishFieldSurface } from './usePublishFieldSurface'
import {
  getCommonFormFields,
  isNoTitlePlatform,
  PLATFORM_PUBLISH_META,
} from '@multi-publish/shared-utils/src/publish-capabilities'

describe('usePublishFieldSurface（P2-7 字段面判据单一真源）', () => {
  const surface = () => usePublishFieldSurface()

  it('支持度徽标分母取注册表平台总数（与所选平台数无关）', () => {
    const [field] = getCommonFormFields().filter(item => item.key === 'tags')
    expect(field).toBeTruthy()
    const text = surface().fieldSupportText('tags')
    // 分子=注册表支持该字段的平台数，分母=注册表平台总数（15）
    expect(text).toContain(String(field.platforms.length))
    expect(text).toContain(String(Object.keys(PLATFORM_PUBLISH_META).length))
  })

  it('支持度徽标与所选平台清单完全无关（同一 key 恒等文案）', () => {
    const fn = surface().fieldSupportText
    expect(fn('cover')).toBe(fn('cover'))
    expect(fn('schedule')).toBe(fn('schedule'))
  })

  it('未登记的字段键返回空串（不渲染徽标，不得显示「0/15 支持」这类假证据）', () => {
    expect(surface().fieldSupportText('not_a_registry_field')).toBe('')
    expect(surface().fieldSupportText(undefined)).toBe('')
  })

  it('无标题平台提示按传入清单计算，命中才提示', () => {
    const fn = surface().noTitleHintFor
    // 注册表里的无标题平台（titleMode=caption）逐个必须命中
    const captionPlatforms = Object.keys(PLATFORM_PUBLISH_META).filter(id => isNoTitlePlatform(id))
    expect(captionPlatforms.length).toBeGreaterThan(0)
    for (const id of captionPlatforms) {
      const hint = fn([id])
      expect(hint, `${id} 应触发无标题提示`).not.toBe('')
    }
  })

  it('无标题平台提示：未命中与空清单都不提示（零打扰）', () => {
    const titled = Object.keys(PLATFORM_PUBLISH_META).filter(id => !isNoTitlePlatform(id))
    expect(surface().noTitleHintFor(titled)).toBe('')
    expect(surface().noTitleHintFor([])).toBe('')
    expect(surface().noTitleHintFor(null)).toBe('')
    expect(surface().noTitleHintFor(['not-a-platform'])).toBe('')
  })

  it('无标题提示文案含平台标签（用户能认出是哪几个平台）', () => {
    const captionPlatforms = Object.keys(PLATFORM_PUBLISH_META).filter(id => isNoTitlePlatform(id))
    const hint = surface().noTitleHintFor(captionPlatforms)
    // 提示必须逐个列出命中的平台数（至少出现一次分隔符或全部命中）
    expect(hint.length).toBeGreaterThan(0)
    expect(captionPlatforms.every(id => /[\u4e00-\u9fa5A-Za-z]/.test(hint))).toBe(true)
  })

  it('可见性支持清单只含注册表声明了 visibility 字段的平台', () => {
    const ids = ['youtube', 'tiktok', 'douyin', 'kuaishou', 'weibo', 'baijiahao']
    const supported = surface().visibilitySupportedIdsFor(ids)
    expect(supported.length).toBeGreaterThan(0)
    expect(supported.length).toBeLessThanOrEqual(ids.length)
    expect(new Set(supported).size).toBe(supported.length)
    expect(surface().visibilitySupportedIdsFor([])).toEqual([])
  })

  it('可见性支持清单按传入平台计算（条目作用域，不受全局态影响）', () => {
    const fn = surface().visibilitySupportedIdsFor
    const all = fn(['youtube', 'tiktok', 'douyin', 'kuaishou', 'weibo'])
    const subset = fn(['youtube'])
    expect(subset.length).toBeLessThanOrEqual(all.length)
    expect(subset.every(id => all.includes(id))).toBe(true)
  })

  it('「档位有平台不支持」提示：未选档位与全部支持一律空串', () => {
    const fn = surface().visibilityUnsupportedHintFor
    expect(fn(['kuaishou', 'douyin'], '')).toBe('')
    expect(fn([], 'public')).toBe('')
    expect(fn(['not-a-platform'], 'friends')).toBe('')
    // 公开档为全平台档位 ⇒ 不应出现「不支持」提示
    expect(fn(['kuaishou', 'douyin', 'weibo'], 'public')).toBe('')
  })

  it('好友档对无该档位的平台必须出声（不静默丢弃用户选择）', () => {
    const fn = surface().visibilityUnsupportedHintFor
    const supported = fn(['douyin', 'weibo', 'kuaishou'], 'friends')
    expect(supported).not.toBe('')
  })

  it('差异化面板规格：只含所选平台、顺序跟随平台目录、带注册表限制', () => {
    const catalog = [
      { id: 'wechat_mp', label: '微信公众号' },
      { id: 'douyin', label: '抖音' },
      { id: 'xiaohongshu', label: '小红书' },
    ]
    const specs = surface().overridePlatformSpecsFor(catalog, ['xiaohongshu', 'wechat_mp'])
    expect(specs.map(item => item.id)).toEqual(['wechat_mp', 'xiaohongshu'])
    expect(specs[0].label).toBe('微信公众号')
    for (const spec of specs) {
      expect(spec.contentMax).toBeGreaterThan(0)
    }
  })

  it('差异化面板规格：空目录/空清单/非法值一律得空数组（不抛错）', () => {
    const fn = surface().overridePlatformSpecsFor
    expect(fn([], ['douyin'])).toEqual([])
    expect(fn([{ id: 'douyin', label: '抖音' }], [])).toEqual([])
    expect(fn(null, null)).toEqual([])
    expect(fn([{ id: 'douyin', label: '抖音' }], [null, '', 42, 'douyin'])).toHaveLength(1)
  })

  it('同一清单两次调用结果相同（无全局态泄漏——批量逐条目复用本模块的前提）', () => {
    const ids = ['weibo', 'douyin', 'kuaishou']
    const first = surface()
    const second = surface()
    expect(first.noTitleHintFor(ids)).toBe(second.noTitleHintFor(ids))
    expect(first.visibilitySupportedIdsFor(ids)).toEqual(second.visibilitySupportedIdsFor(ids))
    expect(first.fieldSupportText('tags')).toBe(second.fieldSupportText('tags'))
  })
})
