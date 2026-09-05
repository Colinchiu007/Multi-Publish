const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:11202')
  const pages = browser.contexts()[0].pages()
  const page = pages[0]
  const title = await page.title().catch(() => '(no title)')
  console.log('CONNECTED:', title)
  
  // 用 JS 注入直接从应用内部调用 container
  const result = await page.evaluate(async () => {
    try {
      // 通过 Vue 实例访问 container
      const app = document.querySelector('#app').__vue_app__
      if (!app) return { err: 'vue_app not found' }
      return { ok: true, appFound: true }
    } catch (e) {
      return { err: e.message }
    }
  })
  console.log('RESULT:', JSON.stringify(result))
}
main().catch(e => console.error('ERROR', e.message))
