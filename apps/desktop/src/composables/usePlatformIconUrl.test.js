/**
 * 平台品牌图标资产合同
 *
 * 三把锁，各自对应一种会静默发生的回归：
 *  1. 覆盖 —— 真源新增平台但没配图标，卡片会退化成 emoji 或首字。
 *  2. 形态 —— 图标是真实品牌矢量，不是手绘几何拼块（polygon/rect/circle 是旧资产的指纹，
 *     也正是「同一排卡片风格不统一」的根因）。
 *  3. URL 判定 —— Vite base 为 './' 时产物是相对 URL；判定函数不认它，页面会把
 *     "./assets/x.svg" 当成文字直接渲染出来（因为组件用 v-else 回退到 <span>{{ icon }}</span>）。
 */
import { describe, it, expect } from 'vitest'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'

// vitest 的 CSS 管道会让 ?raw（无论静态 import 还是 glob）恒返回空串，实测见
// GLOB_RAW len=0；这里按 runner 工作目录直读文件。读不到会直接抛 ENOENT 让本文件
// 收集失败，而不是静默拿到空串把下面那条锁变成假绿。
const designSystemCss = fs.readFileSync(
  path.resolve(process.cwd(), 'src/styles/cohere-design-system.css'), 'utf8',
)
import platformDisplayDefinitions from '@multi-publish/shared-utils/src/platform-display-definitions.json'
import { isPlatformIconUrl } from './usePlatformIconUrl'

const { PLATFORM_NAMES } = platformDisplayDefinitions
const PLATFORM_IDS = Object.keys(PLATFORM_NAMES)

// 与 Vite 默认 assetsInlineLimit 同值；超过即不内联为 data URI，而产出相对 URL。
const INLINE_BUDGET_BYTES = 4096

// ?raw 枚举：既拿到源码文本，也顺带锁住「构建系统能解析到这些资产」这一层。
const rawModules = import.meta.glob('../assets/platforms/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
})

// 同一批资产经 Vite 默认管道解析后的真实 URL（当前实测为 data URI 内联产物）。
const urlModules = import.meta.glob('../assets/platforms/*.svg', { eager: true })

function assetNameOf (importPath) {
  return importPath.split('/').pop()
}

// 锁的本意是「图形里不得混入 emoji/汉字」，来源注释里的中文不算违规，先剥离再判。
function svgOnly (src) {
  return String(src).replace(/<!--[\s\S]*?-->/g, '')
}

const iconSource = Object.fromEntries(
  Object.entries(rawModules).map(([p, src]) => [assetNameOf(p), src]),
)

const iconUrlByName = Object.fromEntries(
  Object.entries(urlModules).map(([p, mod]) => [assetNameOf(p), mod.default]),
)

describe('平台图标覆盖合同', () => {
  it('平台清单非空，且测试确实读到了资产（防 glob 静默返回空集合而假绿）', () => {
    expect(PLATFORM_IDS.length).toBeGreaterThan(10)
    expect(Object.keys(iconSource).length).toBe(PLATFORM_IDS.length)
  })

  it.each(PLATFORM_IDS)('%s 有对应 svg 资产且内容非空', (id) => {
    expect(iconSource[`${id}.svg`]?.trim()).toBeTruthy()
  })

  it('资产目录不得残留真源之外的孤儿图标', () => {
    const orphans = Object.keys(iconSource)
      .map((f) => f.replace(/\.svg$/, ''))
      .filter((id) => !Object.prototype.hasOwnProperty.call(PLATFORM_NAMES, id))
    expect(orphans).toEqual([])
  })
})

describe('图标形态合同：真实品牌矢量，非手绘几何占位', () => {
  it.each(PLATFORM_IDS)('%s 的 viewBox 归一为 24×24', (id) => {
    expect(iconSource[`${id}.svg`]).toMatch(/<svg\b[^>]*\bviewBox="0 0 24 24"/)
  })

  // 品牌色必须落在 <svg> 根上：图标经 <img src="data:..."> 渲染，无法用 currentColor 继承，
  // 只有根级 fill 能让整枚图标统一着色。
  it.each(PLATFORM_IDS)('%s 在根元素内嵌十六进制品牌色', (id) => {
    expect(iconSource[`${id}.svg`]).toMatch(/<svg\b[^>]*\bfill="#[0-9A-Fa-f]{6}"/)
  })

  it.each(PLATFORM_IDS)('%s 不得由手绘几何图元拼成（旧资产的指纹）', (id) => {
    const offending = ['polygon', 'rect', 'circle', 'ellipse', 'line']
      .filter((tag) => new RegExp(`<${tag}\\b`).test(iconSource[`${id}.svg`]))
    expect(offending).toEqual([])
  })

  it.each(PLATFORM_IDS)('%s 全部图形均为 path', (id) => {
    expect(iconSource[`${id}.svg`]).toContain('<path')
  })

  it.each(PLATFORM_IDS)('%s 不含 emoji 或中文字符（emoji 是风格污染源）', (id) => {
    expect(svgOnly(iconSource[`${id}.svg`])).not.toMatch(/[\u4e00-\u9fff\u{1F000}-\u{1FAFF}]/u)
  })

  it.each(PLATFORM_IDS)('%s 体积必须留在内联预算内，否则生产退化为相对 URL', (id) => {
    const size = Buffer.byteLength(iconSource[`${id}.svg`], 'utf8')
    expect(size, `${id}.svg = ${size}B`).toBeLessThan(INLINE_BUDGET_BYTES)
  })
})

describe('isPlatformIconUrl 判定合同', () => {
  it('认 Vite base:"./" 产出的相对资源 URL（不认即把路径当文字渲染）', () => {
    expect(isPlatformIconUrl('./assets/douyin-Bx8kQ2.svg')).toBe(true)
    expect(isPlatformIconUrl('./platforms/xiaohongshu.svg')).toBe(true)
  })

  it('认绝对路径、data URI 与 http(s)', () => {
    expect(isPlatformIconUrl('/assets/zhihu.svg')).toBe(true)
    expect(isPlatformIconUrl('data:image/svg+xml,%3Csvg%3E%3C/svg%3E')).toBe(true)
    expect(isPlatformIconUrl('https://cdn.example.com/a.svg')).toBe(true)
    expect(isPlatformIconUrl('http://127.0.0.1:5174/a.svg')).toBe(true)
  })

  it('拒绝 emoji、首字回退与空值（这些必须走 <span> 文本分支）', () => {
    for (const value of ['🎵', '📰', '微', '?', '', '   ', null, undefined, 0, {}, []]) {
      expect(isPlatformIconUrl(value), JSON.stringify(value)).toBe(false)
    }
  })

  // 接线锁：判定函数必须认 Vite 对这批资产的实际产出形态。
  // 上面的相对路径用例守的是函数本身，这一条守的是「资产与函数没有各自漂移」——
  // 某个 svg 长大到超出内联预算时，产出会从 data URI 变成 './assets/x.svg'，此条即刻红。
  it.each(PLATFORM_IDS)('%s 经 Vite 解析出的 URL 能通过判定', (id) => {
    const url = iconUrlByName[`${id}.svg`]
    expect(url, 'Vite 未产出该资产 URL').toBeTruthy()
    expect(isPlatformIconUrl(url)).toBe(true)
  })

  // 真源 PLATFORM_ICONS 的历史值是 "platforms/douyin.svg" 这类裸相对名，
  // 它不是可解析 URL；若被误判为 URL 会渲染成破图，比回退到文字更糟。
  it('拒绝无 ./ 前缀的裸相对路径（真源历史值，会渲染成破图）', () => {
    expect(isPlatformIconUrl('platforms/douyin.svg')).toBe(false)
  })
})

describe('isIconUrl 单一来源结构锁', () => {
  // 按形态扫描而非逐个点名文件：新增第 N 处抄写同样会被抓住。
  const sources = import.meta.glob('../**/*.{vue,js}', {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  it('全渲染端只允许 usePlatformIconUrl 一处实现图标 URL 判定', () => {
    const offenders = Object.entries(sources)
      .filter(([p]) => !p.includes('usePlatformIconUrl'))
      .filter(([, src]) => /\bfunction\s+isIconUrl\s*\(/.test(String(src)))
      .map(([p]) => p)
    expect(offenders).toEqual([])
  })

  it('扫描器确实看见了组件源码（防 glob 空集合让上一条假绿）', () => {
    const vueCount = Object.keys(sources).filter((p) => p.endsWith('.vue')).length
    expect(vueCount).toBeGreaterThan(20)
  })
})

describe('图标底衬接线合同', () => {
  // 暗色主题会把 --canvas 改深，而 X / TikTok 的官方色就是纯黑，没有底衬就直接隐身。
  // 判据按形态取而非点名文件：凡以 isPlatformIconUrl 守卫渲染的 <img> 都必须带公共底衬类，
  // 新增第 N 个图标渲染点漏加即红。
  const vueSources = import.meta.glob('../**/*.vue', {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  it('每个平台图标 <img> 都带 .mp-platform-icon 底衬', () => {
    const offenders = []
    for (const [p, src] of Object.entries(vueSources)) {
      for (const line of String(src).split(/\r?\n/)) {
        if (line.includes('<img') && line.includes('isPlatformIconUrl(') && !line.includes('mp-platform-icon')) {
          offenders.push(p + ': ' + line.trim().slice(0, 90))
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('扫描器确实覆盖了图标渲染点（防 glob 空集合让上一条假绿）', () => {
    const withIconGuard = Object.entries(vueSources)
      .filter(([, src]) => String(src).includes('isPlatformIconUrl('))
    expect(withIconGuard.length).toBeGreaterThanOrEqual(6)
  })

  it('底衬定义在全局样式里，不是各组件各抄一份', () => {
    expect(designSystemCss).toMatch(/\.mp-platform-icon\s*\{[^}]*background:/)
  })
})
