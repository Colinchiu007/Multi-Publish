import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readPanelVisibilityPrefs, writePanelVisibilityPrefs } from './usePanelVisibilityPrefs'

// 发布页智能面板显隐记忆契约（openspec/changes/optimize-publish-right-rail spec：
// 「面板显隐记忆」——展开/收起状态持久化到 localStorage，无记录用默认，异常降级不崩）。
// 默认值必须与既有行为一致：标签建议默认展开、标题助手默认收起。
const DEFAULTS = { tagSuggester: true, titleAssistant: false }

describe('usePanelVisibilityPrefs', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('无记录时返回默认显隐状态', () => {
    expect(readPanelVisibilityPrefs()).toEqual(DEFAULTS)
  })

  it('写入后读回保持用户选择', () => {
    writePanelVisibilityPrefs({ tagSuggester: false, titleAssistant: true })
    expect(readPanelVisibilityPrefs()).toEqual({ tagSuggester: false, titleAssistant: true })
  })

  it('localStorage 读抛异常时降级默认值', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(readPanelVisibilityPrefs()).toEqual(DEFAULTS)
    spy.mockRestore()
  })

  it('localStorage 写抛异常时不抛错', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => writePanelVisibilityPrefs({ tagSuggester: false })).not.toThrow()
    spy.mockRestore()
  })

  it('未知键与非法类型被忽略', () => {
    window.localStorage.setItem(
      'publish.panelVisibility.v1',
      JSON.stringify({ tagSuggester: false, evil: 'x', titleAssistant: 'yes' })
    )
    const prefs = readPanelVisibilityPrefs()
    expect(prefs).toEqual({ tagSuggester: false, titleAssistant: false })
    expect('evil' in prefs).toBe(false)
  })

  it('损坏 JSON 降级默认值', () => {
    window.localStorage.setItem('publish.panelVisibility.v1', '{broken')
    expect(readPanelVisibilityPrefs()).toEqual(DEFAULTS)
  })

  it('写入只落合法键，非法入参不污染存储', () => {
    writePanelVisibilityPrefs({ tagSuggester: false, evil: 'x' })
    const stored = JSON.parse(window.localStorage.getItem('publish.panelVisibility.v1'))
    expect(stored).toEqual({ tagSuggester: false, titleAssistant: false })
    expect('evil' in stored).toBe(false)
  })
})
