const { chromium } = require('playwright-core')
const BASE = process.env.TEST_URL || 'http://127.0.0.1:5201'
async function main () {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForTimeout(900)
  const snap = async (label) => {
    const d = await page.evaluate(() => {
      const el = document.querySelector('.profile-license-badge')
      if (!el) return { found: false }
      const cs = getComputedStyle(el)
      // 复现 contrast-audit 的祖先链逻辑
      const parse = s => { const m = (s||'').match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/); return m ? { rgb: [+m[1],+m[2],+m[3]], a: m[4]===undefined?1:+m[4] } : null }
      let node = el; let bg = null
      while (node && node !== document.documentElement) {
        const b = parse(getComputedStyle(node).backgroundColor)
        if (b && b.a >= 0.5) { bg = b; break }
        node = node.parentElement
      }
      if (!bg) bg = { rgb: [255,255,255], a: 1 }
      const fg = parse(cs.color)
      return { theme: document.documentElement.getAttribute('data-theme'), fg: fg.rgb, bg: bg.rgb, color: cs.color }
    })
    console.log(label, JSON.stringify(d))
    // WCAG
    const lum = c => { const f = v => { v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4) }; return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]) }
    const r = (()=>{ const [a,b]=[lum(d.fg),lum(d.bg)].sort((x,y)=>y-x); return ((a+0.05)/(b+0.05)).toFixed(2) })()
    console.log(label, 'ratio=', r)
  }
  await snap('LIGHT:')
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.waitForTimeout(500)
  await snap('DARK :')
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
