import { beforeEach, describe, expect, it } from 'vitest'

const { CompositionManager } = require('../services/composition-manager')

describe('CompositionManager', () => {
  let manager

  beforeEach(() => {
    manager = new CompositionManager()
  })

  it('导出 CompositionManager 类', () => {
    expect(CompositionManager).toBeTypeOf('function')
  })

  it('列出全部 7 个 composition 且包含摘要字段', () => {
    const list = manager.listCompositions()

    expect(list).toHaveLength(7)
    expect(list).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'Explainer', mode: 'text', sceneCount: expect.any(Number) }),
    ]))
  })

  it('Explainer composition 包含渲染所需字段', () => {
    expect(manager.getComposition('Explainer')).toEqual(expect.objectContaining({
      id: 'Explainer',
      defaultProps: expect.any(Object),
      scenes: expect.any(Array),
    }))
  })

  it('未知 composition 返回 null', () => {
    expect(manager.getComposition('NonExistent')).toBeNull()
  })

  it('为 Explainer 文本模式生成连续 cut', () => {
    const props = manager.buildRenderProps('Explainer', {
      text: 'Hello\nSecond scene',
      theme: 'clean-professional',
    })

    expect(props.cuts).toHaveLength(2)
    expect(props.cuts[0]).toEqual(expect.objectContaining({
      id: 'cut-1',
      text: 'Hello',
      type: 'hero_title',
    }))
    expect(props.durationInFrames).toBeGreaterThan(0)
  })

  it('为 Explainer 图片模式生成 gallery cut', () => {
    const props = manager.buildRenderProps('Explainer', {
      images: ['img1.jpg', 'img2.jpg'],
      theme: 'flat-motion-graphics',
    })

    expect(props.cuts).toHaveLength(2)
    expect(props.cuts[0]).toEqual(expect.objectContaining({
      id: 'img-1',
      source: 'img1.jpg',
      type: 'screenshot_scene',
    }))
  })

  it('为未知 composition 构建 props 时返回 null', () => {
    expect(manager.buildRenderProps('Bad', {})).toBeNull()
  })
})
