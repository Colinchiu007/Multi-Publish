const { chromium } = require('playwright-core')
const BASE = process.env.TEST_URL || 'http://127.0.0.1:5201'
async function main () {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(900)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.waitForTimeout(500)
  const info = await page.evaluate(() => {
    const el = document.querySelector('.profile-license-badge')
    if (!el) return { found: false }
    const cs = getComputedStyle(el)
    // 收集所有匹配该元素且声明了 background/color 的规则
    const hits = []
    for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch (_) { continue }
      const walk = (list) => {
        for (const r of list) {
          if (r.cssRules) { walk(r.cssRules); continue }
          if (!r.selectorText || !r.style) continue
          const bg = r.style.backgroundColor || r.style.background
          const col = r.style.color
          if ((!bg && !col)) continue
          try {
            if (el.matches(r.selectorText)) {
              hits.push({
                sel: r.selectorText.slice(0, 90),
                bg: bg || '-', color: col || '-',
                href: (sheet.href || 'inline').split('/').pop().slice(0, 40),
              })
            }
          } catch (_) {}
        }
      }
      walk(rules)
    }
    return {
      found: true,
      text: el.textContent.trim().slice(0, 20),
      computedBg: cs.backgroundColor,
      computedColor: cs.color,
      htmlTheme: document.documentElement.getAttribute('data-theme'),
      hits,
    }
  })
  console.log(JSON.stringify(info, null, 2))
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
