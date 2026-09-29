import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * href / window.open 协议校验接线锁（PRD-HREF-SCHEME-GUARD-2026-09-29）
 *
 * 为什么是结构锁而不是单点断言：
 * 这个缺陷的形态是"每个新页面各抄一次裸 :href"，逐组件写用例只能覆盖今天已知的六个点，
 * 第七个点（下一个会话新加的）不会有任何东西变红。所以判据必须扫全仓 `.vue`。
 *
 * 三条反失明措施（本仓踩过的坑，见 AGENTS.md「定位宿主声明文件禁止数 .. 层级」）：
 *   ① 扫描域为空即红（不允许"没找到文件"退化成通过）；
 *   ② 命中数有规模下界（解析退化成空集合时锁不会静默放行）；
 *   ③ 例外清单只能缩小，新增例外必须带理由。
 *
 * 判据必须覆盖所有绑定语法形态：`:href="…"` / `:href='…'` / `v-bind:href="…"` / `v-bind:href='…'`。
 * 只匹配双引号形态会让下一个页面用单引号写一次就绕过整把锁（首轮自查发现并已收紧）。
 */

const SRC_ROOT = path.resolve(__dirname)
const DESKTOP_ROOT = path.resolve(__dirname, '..')

function walkVue (dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkVue(full, out)
    else if (entry.name.endsWith('.vue')) out.push(full)
  }
  return out
}

const VUE_FILES = walkVue(SRC_ROOT)

/** 四种绑定形态一网打尽；捕获组 1=双引号表达式，2=单引号表达式 */
const HREF_RE = /(?::|v-bind:)href="([^"]*)"|(?::|v-bind:)href='([^']*)'/g
const OPEN_RE = /window\.open\(\s*([^,)]+)/g

function scan (re, pick) {
  const hits = []
  for (const file of VUE_FILES) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(re)) {
      hits.push({
        rel: path.relative(DESKTOP_ROOT, file).replace(/\\/g, '/'),
        expr: (pick(m) || '').trim(),
      })
    }
  }
  return hits
}

const HREF_HITS = scan(HREF_RE, m => m[1] ?? m[2])
const OPEN_HITS = scan(OPEN_RE, m => m[1])

/** 例外：绑定表达式不经 safeHttpUrl 的站点。新增即红，只能带理由进入且只能缩小 */
const HREF_EXCEPTIONS = []

/**
 * `window.open(...)` 站点登记：这些调用不在渲染层成链，而是被主进程
 * `window.js` 的 `setWindowOpenHandler → openExternalUrl → isAllowedExternalUrl`
 * 拦住（该判据比 safeHttpUrl **更严**：`new URL()` 解析 + 协议白名单 + 拒绝 userinfo）。
 * 登记而非放行判据，是为了让"新增一个 window.open 点"必须被看见。
 */
const OPEN_SITES_GUARDED_IN_MAIN = [
  'src/views/Accounts.vue', // openPlatform() 打开运营中心配置的 dashboard URL，由主进程层更严判据兜
]

describe('渲染层 href 协议校验接线锁', () => {
  it('扫描域非空（目录解析失败不得退化成"全部通过"）', () => {
    expect(VUE_FILES.length).toBeGreaterThan(20)
  })

  it('必须扫到 :href 绑定点本身（命中集为空即证明判据失明，不接受空通过）', () => {
    expect(HREF_HITS.length).toBeGreaterThanOrEqual(6)
  })

  it('每一处 :href 绑定都必须经 safeHttpUrl 收口', () => {
    const offenders = HREF_HITS
      .filter(h => !h.expr.includes('safeHttpUrl'))
      .filter(h => !HREF_EXCEPTIONS.includes(h.rel))
    expect(offenders.map(o => `${o.rel} → href=${o.expr}`)).toEqual([])
  })

  it('六个已知站点逐个在位（防止"整块删除用例"式绕过上一条）', () => {
    const known = [
      'src/views/Intelligence.vue',
      'src/views/Publish.vue',
      'src/views/PublishHistory.vue',
      'src/views/FilmEngineeringView.vue',
      'src/components/TrendingPanel.vue',
      'src/components/ReferenceFinder.vue',
    ]
    const covered = new Set(HREF_HITS.filter(h => h.expr.includes('safeHttpUrl')).map(h => h.rel))
    expect(known.filter(k => !covered.has(k))).toEqual([])
  })

  it('单引号与 v-bind: 形态必须真的被扫到（判据不得只在双引号上生效）', () => {
    // 用一段构造文本直接验判据本身，避免"当前仓库恰好没人这么写"造成锁永久不覆盖该形态
    const probe = `<a :href='item.url'>x</a>\n<a v-bind:href="row.url">y</a>\n<a :href='q'>z</a>`
    const found = [...probe.matchAll(HREF_RE)].map(m => (m[1] ?? m[2]).trim())
    expect(found).toEqual(['item.url', 'row.url', 'q'])
  })
})

describe('渲染层 window.open 站点登记锁', () => {
  it('每一个 window.open 调用点都必须已在册（新增点必须显式登记它靠谁守）', () => {
    const unregistered = OPEN_HITS
      .filter(h => !h.expr.includes('safeHttpUrl'))
      .map(h => h.rel)
      .filter(rel => !OPEN_SITES_GUARDED_IN_MAIN.includes(rel))
    expect([...new Set(unregistered)]).toEqual([])
  })

  it('登记表里的站点必须真的还存在（防"文件删了登记还留着"的陈旧白名单）', () => {
    const present = new Set(OPEN_HITS.map(h => h.rel))
    expect(OPEN_SITES_GUARDED_IN_MAIN.filter(r => !present.has(r))).toEqual([])
  })
})

describe('单一口径接线锁（禁止第二份协议判定）', () => {
  const twin = path.resolve(DESKTOP_ROOT, '..', '..', 'packages/shared-utils/src/safe-http-url.js')
  const esm = path.resolve(DESKTOP_ROOT, '..', '..', 'packages/shared-utils/src/safe-http-url.browser.js')

  it('共享实现的 CJS 与 ESM 孪生两个文件都必须存在', () => {
    expect(fs.existsSync(twin)).toBe(true)
    expect(fs.existsSync(esm)).toBe(true)
  })

  it('vite 必须把渲染端的导入别名指向 ESM 孪生（否则浏览器里执行 module.exports）', () => {
    const cfg = fs.readFileSync(path.resolve(DESKTOP_ROOT, 'vite.config.js'), 'utf8')
    expect(cfg).toContain("'@multi-publish/shared-utils/src/safe-http-url'")
    expect(cfg).toContain('safe-http-url.browser.js')
  })

  it('主进程采集侧必须 import 共享实现，且不得自带第二份 http/https 正则', () => {
    const sources = [
      ['electron/services/content-intelligence-sources.js', 'safe-http-url'],
      ['electron/services/hot-topics/channels.js', 'safe-http-url'],
    ]
    for (const [rel, marker] of sources) {
      const text = fs.readFileSync(path.resolve(DESKTOP_ROOT, rel), 'utf8')
      expect(text, `${rel} 必须引用共享实现 ${marker}`).toContain(marker)
      expect(text, `${rel} 不得保留自己的协议正则`).not.toMatch(/\/\^https\?:\\\/\\\//)
    }
  })

  it('主进程 OS 打开面必须保留自己的更严判据（合并进来就是把安全面放松）', () => {
    const text = fs.readFileSync(path.resolve(DESKTOP_ROOT, 'electron/window.js'), 'utf8')
    expect(text).toMatch(/function isAllowedExternalUrl/)
    expect(text).toMatch(/url\.username/)   // 拒绝 userinfo 这条不能丢
    // 二者关系必须在源码里被写明，否则下一个读者会"顺手收敛"成一份
    expect(text).toContain('safe-http-url')
  })
})
