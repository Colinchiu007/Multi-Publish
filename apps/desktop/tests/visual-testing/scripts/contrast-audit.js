// Wave 0.4 补充验证：未定义 CSS 变量在 dark 模式下的实际计算值
//
// 动机：dark-mode-audit.js 的启发式只统计「接近纯白(>=240)的背景像素」，
// 只能发现"深色模式出现大面积浅色块"。但 59 处未定义变量里含 --text-primary
// （文字色）—— 若未定义导致文字回退为深色，在深色背景上就是「深字压深底」，
// 该启发式检测不到（背景不是白的）。本脚本补这块盲区。
//
// 做法：真实渲染每个视图 → 强制 dark → 遍历可见元素取 computed color/
//       backgroundColor → 算 WCAG 对比度 → 报出低于阈值的组合。
const { chromium } = require('playwright-core')

const BASE = process.env.TEST_URL || 'http://127.0.0.1:5188'
const MIN_RATIO = Number(process.env.MIN_RATIO || 3) // 低于 3:1 视为可疑

const ROUTES = [
  ['home', '/'], ['accounts', '/accounts'], ['publish', '/publish'],
  ['publish-history', '/publish/history'], ['create', '/create'],
  ['model-providers', '/model-providers'], ['first-run', '/first-run'],
  ['dashboard', '/dashboard'], ['calendar', '/calendar'],
  ['cloud-publish', '/cloud-publish'], ['viral-analysis', '/viral-analysis'],
  ['intelligence', '/intelligence'], ['collection', '/collection'],
  ['hot-topics', '/hot-topics'], ['copy-library', '/copy-library'],
  ['keywords', '/keywords'], ['comments', '/comments'],
  ['member-center', '/member-center'],
]

function lum (r, g, b) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function ratio (c1, c2) {
  const l1 = lum(...c1); const l2 = lum(...c2)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

async function main () {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const report = []

  for (const [name, route] of ROUTES) {
    try {
      await page.goto(BASE + '/#' + route, { waitUntil: 'networkidle', timeout: 20000 })
      await page.waitForTimeout(900)
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
      await page.waitForTimeout(500)

      const bad = await page.evaluate(() => {
        const parse = s => {
          const m = (s || '').match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/)
          if (!m) return null
          return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] }
        }
        // 逐元素找「有可见文字、且前景/背景都可见」的组合
        const out = []
        const els = document.querySelectorAll('body *')
        let sampled = 0
        for (const el of els) {
          if (sampled > 4000) break
          // 只看直接含文本节点、且自身有可见背景的元素
          const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())
          if (!hasText) continue
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
          if (cs.webkitTextFillColor === 'transparent') continue
          const fg = parse(cs.color); if (!fg || fg.a < 0.5) continue
          let node = el
          let bg = null
          while (node && node !== document.documentElement) {
            const s = getComputedStyle(node)
            const b = parse(s.backgroundColor)
            if (b && b.a >= 0.5) { bg = b; break }
            node = node.parentElement
          }
          if (!bg) bg = { rgb: [255, 255, 255], a: 1 }
          sampled++
          out.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 60),
            text: (el.textContent || '').trim().slice(0, 30),
            fg: fg.rgb, bg: bg.rgb,
          })
        }
        return out
      })

      const fails = []
      for (const s of bad) {
        const r = ratio(s.fg, s.bg)
        if (r < MIN_RATIO) fails.push({ ...s, ratio: Number(r.toFixed(2)) })
      }
      // 同 ratio 只留一条，避免刷屏
      const seen = new Set()
      const uniq = fails.filter(f => {
        const k = `${f.ratio}|${f.cls}`
        if (seen.has(k)) return false
        seen.add(k); return true
      }).slice(0, 5)

      report.push({ view: name, route, sampled: bad.length, lowContrast: uniq })
      console.log(`${name}: 采样 ${bad.length} 个文本元素，低对比(<${MIN_RATIO}:1) ${fails.length} 个`)
      uniq.forEach(f => console.log(`    [${f.ratio}:1] <${f.tag} class="${f.cls}"> "${f.text}"`))
    } catch (e) {
      report.push({ view: name, route, error: e.message.split('\n')[0] })
      console.log(`${name}: ERROR ${e.message.split('\n')[0]}`)
    }
  }

  await browser.close()
  const total = report.reduce((a, r) => a + (r.lowContrast ? r.lowContrast.length : 0), 0)
  console.log(`\n[contrast-audit] 完成 ${report.length} 视图；低对比样本合计 ${total}（阈值 ${MIN_RATIO}:1）`)
  if (total) {
    console.log('受影响视图：')
    report.filter(r => r.lowContrast && r.lowContrast.length).forEach(r => console.log(`  ${r.view}: ${r.lowContrast.length}`))
  }
  require('fs').writeFileSync(
    require('path').join(__dirname, '../reports/dark-audit/contrast-audit-report.json'),
    JSON.stringify(report, null, 2)
  )
}
main().catch(e => { console.error(e); process.exit(1) })
