import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ArrowLeftIcon from './ArrowLeftIcon.vue'
import ArrowRightIcon from './ArrowRightIcon.vue'
import ReloadIcon from './ReloadIcon.vue'
import SpinnerIcon from './SpinnerIcon.vue'

const srcDir = dirname(fileURLToPath(import.meta.url))

const ICONS = [
  { name: 'ArrowLeftIcon', component: ArrowLeftIcon, file: 'ArrowLeftIcon.vue' },
  { name: 'ArrowRightIcon', component: ArrowRightIcon, file: 'ArrowRightIcon.vue' },
  { name: 'ReloadIcon', component: ReloadIcon, file: 'ReloadIcon.vue' },
  { name: 'SpinnerIcon', component: SpinnerIcon, file: 'SpinnerIcon.vue' },
]

describe('导航图标组件合同（同一套 24 网格线性图标）', () => {
  it.each(ICONS)('$name 使用统一的描边参数与 24×24 网格', ({ component }) => {
    const svg = mount(component).get('svg')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
    expect(svg.attributes('fill')).toBe('none')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.attributes('stroke-width')).toBe('2')
    expect(svg.attributes('stroke-linecap')).toBe('round')
    expect(svg.attributes('stroke-linejoin')).toBe('round')
  })

  it.each(ICONS)('$name 默认对辅助技术隐藏（装饰性图标）', ({ component }) => {
    expect(mount(component).get('svg').attributes('aria-hidden')).toBe('true')
  })

  it('size prop 同时驱动宽高', () => {
    const svg = mount(ArrowLeftIcon, { props: { size: 18 } }).get('svg')
    expect(svg.attributes('width')).toBe('18')
    expect(svg.attributes('height')).toBe('18')
  })

  it('四个图标的 path 互不相同（不得复制粘贴同一个形状）', () => {
    const paths = ICONS.map(({ component }) =>
      mount(component)
        .findAll('path')
        .map((p) => p.attributes('d'))
        .join('|')
    )
    expect(new Set(paths).size).toBe(ICONS.length)
    paths.forEach((p) => expect(p.length).toBeGreaterThan(0))
  })

  it('结构锁：图标目录必须声明第三方来源与许可证', () => {
    const sources = ICONS.map(({ file }) => readFileSync(join(srcDir, file), 'utf8')).join('\n')
    expect(sources).toMatch(/Lucide/)
    expect(sources).toMatch(/ISC/i)
  })
})

describe('SpinnerIcon 语义合同', () => {
  it('自身只负责形状，旋转由消费方 CSS 决定（源码不含 animation）', () => {
    const src = readFileSync(join(srcDir, 'SpinnerIcon.vue'), 'utf8')
    expect(src).not.toMatch(/animation:/)
    // 开口圆环：单条 path，视觉上区别于闭合圆
    const paths = mount(SpinnerIcon).findAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0].attributes('d')).toMatch(/a9 9 0 1 1/)
  })
})
