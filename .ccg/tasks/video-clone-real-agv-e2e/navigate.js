const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:11202')
  const pages = browser.contexts()[0].pages()
  const page = pages[0]
  console.log('CONNECTED, title:', await page.title())
  
  // 导航到视频克隆
  await page.evaluate(() => { window.location.hash = '#/video-clone' })
  await page.waitForTimeout(3000)
  console.log('NAVIGATED to video-clone')
  
  // 检查页面
  const hasCloneView = await page.locator('.video-clone-view').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
  console.log('VIDEO_CLONE_VIEW:', hasCloneView ? 'VISIBLE' : 'NOT_FOUND')
  
  if (!hasCloneView) {
    // 尝试从创作入口进入
    console.log('Trying #/create path...')
    await page.evaluate(() => { window.location.hash = '#/create' })
    await page.waitForTimeout(3000)
    const hasPipelineCard = await page.locator('[data-pipeline-id="video-clone"]').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
    console.log('PIPELINE_CARD:', hasPipelineCard ? 'VISIBLE' : 'NOT_FOUND')
    if (hasPipelineCard) {
      await page.locator('[data-pipeline-id="video-clone"]').first().click()
      await page.waitForTimeout(3000)
    }
  }
  
  const OUT_DIR = 'D:/Data/projects/Multi-Publish/.ccg/tasks/video-clone-real-agv-e2e'
  await page.screenshot({ path: path.join(OUT_DIR, 'video-clone-ui.png') })
  console.log('SCREENSHOT saved')
  console.log('DONE - 请查看应用界面手动操作，或告诉我在视频克隆页面看到了什么')
}

main().catch(e => console.error('ERROR', e.message))
