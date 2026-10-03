// QM-4 取证脚本：真实渲染 Tab 化 TagSuggester 并截图（拦截 IPC 返回模拟分组数据）。
// 用法：node tests/visual-testing/scripts/capture-tag-tabs-proof.js
// 产出：tests/visual-testing/reports/tag-tabs-proof.png（+ 截图前后的 DOM 断言输出）
const { chromium } = require('playwright')

const BASE = process.env.TEST_URL || 'http://127.0.0.1:5174'
const OUT = 'tests/visual-testing/reports/tag-tabs-proof.png'

const MOCK = {
  keywords: ['新能源汽车', '锂电池原理', '充电策略', '续航焦虑', '电池衰减'],
  relatedTerms: ['电动车避坑', '充电技巧分享'],
  byPlatform: {
    zhihu: ['新能源汽车', '锂电池原理', '充电策略', '续航焦虑', '电池衰减', '知乎热榜', 'A股'],
    weibo: ['#新能源车主日常', '#充电焦虑', '#电动车使用技巧', '#高速充电', '#社会热点', '#科技前沿', '热门汽车'],
    xiaohongshu: ['#电动车避坑', '#充电技巧分享', '#续航焦虑解决', '#电车生活', '#AI工具推荐', '#旅行攻略', '出行'],
    bilibili: ['新能源', '电池技术', '充电桩', '续航测试', '汽车科技', '硬核科普'],
    toutiao: ['新能源汽车', '电池衰减', '充电攻略', '车主日常'],
  },
  byPlatformDetail: {
    zhihu: { content: ['新能源汽车', '锂电池原理', '充电策略', '续航焦虑', '电池衰减'], traffic: ['知乎热榜', 'A股'] },
    weibo: { content: ['#新能源车主日常', '#充电焦虑', '#电动车使用技巧', '#高速充电'], traffic: ['#社会热点', '#科技前沿', '热门汽车'] },
    xiaohongshu: { content: ['#电动车避坑', '#充电技巧分享', '#续航焦虑解决', '#电车生活'], traffic: ['#AI工具推荐', '#旅行攻略', '出行'] },
    bilibili: { content: ['新能源', '电池技术', '充电桩', '续航测试'], traffic: ['汽车科技', '硬核科普'] },
    toutiao: { content: ['新能源汽车', '电池衰减'], traffic: ['充电攻略', '车主日常'] },
  },
  matchedTopics: {
    zhihu: [{ tag: '知乎热榜', heat: 112 }, { tag: 'A股', heat: 108 }],
    weibo: [{ tag: '#社会热点', heat: 108 }, { tag: '#科技前沿', heat: 102 }],
    xiaohongshu: [{ tag: '#AI工具推荐', heat: 108 }, { tag: '#旅行攻略', heat: 91 }],
  },
  source: 'llm',
  calibrated: true,
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

  // 拦截 IPC：init script 内嵌模拟数据（每次导航都重放，不依赖后置 evaluate 的时序）。
  await page.addInitScript((mock) => {
    window.electronAPI = {
      ...(window.electronAPI || {}),
      intelligenceSuggestTags: () => Promise.resolve({ code: 0, data: mock }),
      platformGetAll: () => Promise.resolve({ code: 0, data: [] }),
      storeGetSetting: () => Promise.resolve(null),
      storeSetSetting: () => Promise.resolve({ code: 0 }),
      accountLoad: () => Promise.resolve({ code: 0, data: null }),
    }
  }, MOCK)
  await page.goto(BASE + '/#/publish', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  // 批量模式复选框默认未勾选即单篇；若被记忆勾选则切回
  const batchBox = page.locator('[data-testid="publish-batch-mode"]')
  if (await batchBox.count() && await batchBox.isChecked().catch(() => false)) {
    await batchBox.uncheck()
    await page.waitForTimeout(500)
  }

  // 填入标题与正文触发面板（>3 字符）；UiInput 是包裹 div，取内部 input
  const title = page.locator('[data-testid="publish-title"] input').first()
  await title.fill('新能源汽车续航实测与充电策略全解析')
  const editor = page.locator('.article-editor [contenteditable], [data-testid="publish-editor"] [contenteditable], .ProseMirror').first()
  if (await editor.count()) {
    await editor.click()
    await editor.type('新能源汽车的锂电池原理与充电策略深度解析，讨论续航焦虑与电池衰减问题，分享高速充电体验与电动车使用技巧。'.repeat(3))
  } else {
    console.log('WARN: editor not found, title-only may not trigger panel (combinedContent>3 required)')
  }
  await page.waitForTimeout(1500)

  // 以 Tab 行的祖先卡片定位面板（外层表单卡也是 .cohere-card，hasText 会误匹配）
  const panel = page.locator('[data-testid="tag-tab-all"]').locator('xpath=ancestor::div[contains(@class,"cohere-card")][1]')
  const panelCount = await panel.count()
  console.log('tag panel found:', panelCount)

  if (panelCount) {
    const box = await panel.boundingBox()
    console.log('tag panel height (px):', box ? Math.round(box.height) : 'n/a')
    console.log('tab-all text:', await page.locator('[data-testid="tag-tab-all"]').textContent().catch(() => 'MISSING'))
    console.log('summary rows:', await page.locator('[data-testid="tag-summary-row"]').count())
    console.log('more badges:', await page.locator('[data-testid="tag-more-badge"]').count())
    await panel.screenshot({ path: OUT })
    console.log('saved:', OUT)
  } else {
    await page.screenshot({ path: OUT, fullPage: false })
    console.log('panel missing, full page saved instead:', OUT)
  }
  await browser.close()
})().catch((e) => { console.error('CAPTURE FAILED:', e.message); process.exit(1) })
