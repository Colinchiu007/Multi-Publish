import { describe, it, expect } from 'vitest'
import { buildScenePlan } from '../scene-builder'

// scene-builder 单元测试
// 覆盖 text / gallery 两种模式下的 cuts 生成、
// 默认值、自定义参数、边界条件、durationInFrames 计算

const FPS = 30
const DEFAULT_SPS = 8
const DEFAULT_DPI = 5
const DEFAULT_OVERLAP = 0.5

describe('buildScenePlan - text 模式基础', () => {
  it('单行文本生成单个 cut，type 为 text_card', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'Hello world' })
    expect(plan.cuts).toHaveLength(1)
    expect(plan.cuts[0]).toMatchObject({
      id: 'scene-0',
      type: 'text_card',
      text: 'Hello world',
      in_seconds: 0,
      out_seconds: DEFAULT_SPS,
    })
  })

  it('多行文本生成多个 cut，每行一个场景', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'Line 1\nLine 2\nLine 3' })
    expect(plan.cuts).toHaveLength(3)
    expect(plan.cuts.map((c) => c.id)).toEqual(['scene-0', 'scene-1', 'scene-2'])
    expect(plan.cuts.map((c) => c.text)).toEqual(['Line 1', 'Line 2', 'Line 3'])
  })

  it('文本中的空行被过滤掉', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'A\n\nB\n   \nC' })
    expect(plan.cuts).toHaveLength(3)
    expect(plan.cuts.map((c) => c.text)).toEqual(['A', 'B', 'C'])
  })

  it('文本行被 trim 处理', () => {
    const plan = buildScenePlan({ mode: 'text', text: '  spaced  ' })
    expect(plan.cuts[0].text).toBe('spaced')
  })

  it('空字符串文本生成 0 个 cut，durationInFrames 为 30', () => {
    const plan = buildScenePlan({ mode: 'text', text: '' })
    expect(plan.cuts).toHaveLength(0)
    // cuts.length === 0 → Math.ceil(1 * FPS) = 30
    expect(plan.durationInFrames).toBe(30)
  })

  it('仅包含空白字符的文本生成 0 个 cut', () => {
    const plan = buildScenePlan({ mode: 'text', text: '   \n   \n   ' })
    expect(plan.cuts).toHaveLength(0)
    expect(plan.durationInFrames).toBe(30)
  })
})

describe('buildScenePlan - text 模式时间轴计算', () => {
  it('默认参数下多 cut 的时间轴按 overlap 计算', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'A\nB\nC' })
    // sps=8, overlap=0.5
    // cut[0]: in=0, out=8
    // cut[1]: in=7.5, out=15.5
    // cut[2]: in=15, out=23
    expect(plan.cuts[0].in_seconds).toBe(0)
    expect(plan.cuts[0].out_seconds).toBe(8)
    expect(plan.cuts[1].in_seconds).toBe(7.5)
    expect(plan.cuts[1].out_seconds).toBe(15.5)
    expect(plan.cuts[2].in_seconds).toBe(15)
    expect(plan.cuts[2].out_seconds).toBe(23)
  })

  it('durationInFrames = ceil((最后 cut.out_seconds + 1) * 30)', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'A\nB\nC' })
    // 最后 out=23 → ceil((23+1) * 30) = 720
    expect(plan.durationInFrames).toBe(Math.ceil((23 + 1) * FPS))
    expect(plan.durationInFrames).toBe(720)
  })

  it('单行文本 durationInFrames = ceil((8+1) * 30) = 270', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'Only one' })
    expect(plan.durationInFrames).toBe(270)
  })

  it('自定义 secondsPerScene 影响时间轴', () => {
    const plan = buildScenePlan({
      mode: 'text',
      text: 'A\nB',
      secondsPerScene: 10,
    })
    // sps=10, overlap=0.5
    // cut[0]: in=0, out=10
    // cut[1]: in=9.5, out=19.5
    expect(plan.cuts[0].out_seconds).toBe(10)
    expect(plan.cuts[1].in_seconds).toBe(9.5)
    expect(plan.cuts[1].out_seconds).toBe(19.5)
  })

  it('自定义 transitionOverlap 影响时间轴', () => {
    const plan = buildScenePlan({
      mode: 'text',
      text: 'A\nB',
      transitionOverlap: 2,
    })
    // sps=8, overlap=2
    // cut[0]: in=0, out=8
    // cut[1]: in=6, out=14
    expect(plan.cuts[1].in_seconds).toBe(6)
    expect(plan.cuts[1].out_seconds).toBe(14)
  })

  it('transitionOverlap = 0 时无重叠', () => {
    const plan = buildScenePlan({
      mode: 'text',
      text: 'A\nB\nC',
      transitionOverlap: 0,
    })
    // cut[0]: in=0, out=8
    // cut[1]: in=8, out=16
    // cut[2]: in=16, out=24
    expect(plan.cuts[0].out_seconds).toBe(8)
    expect(plan.cuts[1].in_seconds).toBe(8)
    expect(plan.cuts[1].out_seconds).toBe(16)
    expect(plan.cuts[2].in_seconds).toBe(16)
  })

  it('transitionOverlap 为 null 时使用默认值 0.5（?? 语义）', () => {
    const plan = buildScenePlan({
      mode: 'text',
      text: 'A\nB',
      // @ts-expect-error 测试 null 行为
      transitionOverlap: null,
    })
    expect(plan.cuts[1].in_seconds).toBe(7.5)
  })

  it('secondsPerScene = 0 时被保留（?? 不替换 0）', () => {
    const plan = buildScenePlan({
      mode: 'text',
      text: 'A',
      secondsPerScene: 0,
    })
    // sps=0, overlap=0.5
    // cut[0]: in=0, out=(0+1)*0 - 0*0.5 = 0
    expect(plan.cuts[0].out_seconds).toBe(0)
    // durationInFrames = ceil((0+1) * 30) = 30
    expect(plan.durationInFrames).toBe(30)
  })
})

describe('buildScenePlan - gallery 模式基础', () => {
  it('单张图片生成单个 cut，type 为 anime_scene', () => {
    const plan = buildScenePlan({ mode: 'gallery', images: ['img1.png'] })
    expect(plan.cuts).toHaveLength(1)
    expect(plan.cuts[0]).toMatchObject({
      id: 'scene-0',
      type: 'anime_scene',
      images: ['img1.png'],
      animation: 'ken-burns',
      in_seconds: 0,
      out_seconds: DEFAULT_DPI,
    })
  })

  it('多张图片生成多个 cut，每张一个场景', () => {
    const plan = buildScenePlan({
      mode: 'gallery',
      images: ['a.png', 'b.png', 'c.png'],
    })
    expect(plan.cuts).toHaveLength(3)
    expect(plan.cuts.map((c) => c.images)).toEqual([['a.png'], ['b.png'], ['c.png']])
    expect(plan.cuts.map((c) => c.id)).toEqual(['scene-0', 'scene-1', 'scene-2'])
  })

  it('空 images 数组生成 0 个 cut', () => {
    const plan = buildScenePlan({ mode: 'gallery', images: [] })
    expect(plan.cuts).toHaveLength(0)
    expect(plan.durationInFrames).toBe(30)
  })

  it('默认 animation 为 ken-burns', () => {
    const plan = buildScenePlan({ mode: 'gallery', images: ['x.png'] })
    expect(plan.cuts[0].animation).toBe('ken-burns')
  })

  it('自定义 animation 被透传到每个 cut', () => {
    const plan = buildScenePlan({
      mode: 'gallery',
      images: ['a.png', 'b.png'],
      animation: 'slide-in',
    })
    expect(plan.cuts[0].animation).toBe('slide-in')
    expect(plan.cuts[1].animation).toBe('slide-in')
  })
})

describe('buildScenePlan - gallery 模式时间轴计算', () => {
  it('默认参数下多 cut 时间轴按 overlap 计算', () => {
    const plan = buildScenePlan({
      mode: 'gallery',
      images: ['a.png', 'b.png', 'c.png'],
    })
    // dpi=5, overlap=0.5
    // cut[0]: in=0, out=5
    // cut[1]: in=4.5, out=9.5
    // cut[2]: in=9, out=14
    expect(plan.cuts[0].in_seconds).toBe(0)
    expect(plan.cuts[0].out_seconds).toBe(5)
    expect(plan.cuts[1].in_seconds).toBe(4.5)
    expect(plan.cuts[1].out_seconds).toBe(9.5)
    expect(plan.cuts[2].in_seconds).toBe(9)
    expect(plan.cuts[2].out_seconds).toBe(14)
  })

  it('durationInFrames = ceil((最后 cut.out_seconds + 1) * 30)', () => {
    const plan = buildScenePlan({
      mode: 'gallery',
      images: ['a.png', 'b.png', 'c.png'],
    })
    // 最后 out=14 → ceil((14+1) * 30) = 450
    expect(plan.durationInFrames).toBe(Math.ceil((14 + 1) * FPS))
    expect(plan.durationInFrames).toBe(450)
  })

  it('自定义 durationPerImage 影响时间轴', () => {
    const plan = buildScenePlan({
      mode: 'gallery',
      images: ['a.png', 'b.png'],
      durationPerImage: 10,
    })
    // dpi=10, overlap=0.5
    // cut[0]: in=0, out=10
    // cut[1]: in=9.5, out=19.5
    expect(plan.cuts[0].out_seconds).toBe(10)
    expect(plan.cuts[1].in_seconds).toBe(9.5)
    expect(plan.cuts[1].out_seconds).toBe(19.5)
  })

  it('自定义 transitionOverlap 影响时间轴', () => {
    const plan = buildScenePlan({
      mode: 'gallery',
      images: ['a.png', 'b.png'],
      transitionOverlap: 1,
    })
    // dpi=5, overlap=1
    // cut[0]: in=0, out=5
    // cut[1]: in=4, out=9
    expect(plan.cuts[1].in_seconds).toBe(4)
    expect(plan.cuts[1].out_seconds).toBe(9)
  })
})

describe('buildScenePlan - theme 处理', () => {
  it('未指定 theme 时默认为 clean-professional', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'A' })
    expect(plan.theme).toBe('clean-professional')
  })

  it('指定 theme 时透传到 plan', () => {
    const plan = buildScenePlan({
      mode: 'text',
      text: 'A',
      theme: 'anime-ghibli',
    })
    expect(plan.theme).toBe('anime-ghibli')
  })

  it('gallery 模式同样支持自定义 theme', () => {
    const plan = buildScenePlan({
      mode: 'gallery',
      images: ['a.png'],
      theme: 'flat-motion-graphics',
    })
    expect(plan.theme).toBe('flat-motion-graphics')
  })

  it('theme 为空字符串时使用默认值（|| 语义）', () => {
    const plan = buildScenePlan({
      mode: 'text',
      text: 'A',
      theme: '',
    })
    expect(plan.theme).toBe('clean-professional')
  })
})

describe('buildScenePlan - 返回结构', () => {
  it('返回的 plan 包含 cuts / overlays / captions / audio / theme / durationInFrames', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'A' })
    expect(plan).toHaveProperty('cuts')
    expect(plan).toHaveProperty('overlays')
    expect(plan).toHaveProperty('captions')
    expect(plan).toHaveProperty('audio')
    expect(plan).toHaveProperty('theme')
    expect(plan).toHaveProperty('durationInFrames')
  })

  it('overlays 和 captions 默认为空数组', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'A' })
    expect(plan.overlays).toEqual([])
    expect(plan.captions).toEqual([])
  })

  it('audio 默认为空对象', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'A' })
    expect(plan.audio).toEqual({})
  })

  it('durationInFrames 始终为整数（Math.ceil 保证）', () => {
    // 使用会让 out_seconds 出现小数的参数
    const plan = buildScenePlan({
      mode: 'text',
      text: 'A\nB',
      secondsPerScene: 7,
      transitionOverlap: 0.3,
    })
    expect(Number.isInteger(plan.durationInFrames)).toBe(true)
  })
})

describe('buildScenePlan - 路由分发', () => {
  it('mode=text 走 text 分支（cuts 类型为 text_card）', () => {
    const plan = buildScenePlan({ mode: 'text', text: 'A' })
    expect(plan.cuts[0].type).toBe('text_card')
    expect(plan.cuts[0]).not.toHaveProperty('images')
    expect(plan.cuts[0]).not.toHaveProperty('animation')
  })

  it('mode=gallery 走 gallery 分支（cuts 类型为 anime_scene）', () => {
    const plan = buildScenePlan({ mode: 'gallery', images: ['a.png'] })
    expect(plan.cuts[0].type).toBe('anime_scene')
    expect(plan.cuts[0]).toHaveProperty('images')
    expect(plan.cuts[0]).toHaveProperty('animation')
    expect(plan.cuts[0]).not.toHaveProperty('text')
  })

  it('mode 非 text 时一律走 gallery 分支', () => {
    // 源码：if (input.mode === 'text') ... else return buildGalleryPlan(...)
    // 即除了 'text' 之外的所有 mode 都会走 gallery 分支
    const plan = buildScenePlan({
      mode: 'gallery' as const,
      images: ['x.png'],
    })
    expect(plan.cuts[0].type).toBe('anime_scene')
  })
})
