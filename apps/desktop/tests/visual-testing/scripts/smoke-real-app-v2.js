/**
 * 改进的真实应用视觉测试 - 等待 Vue 挂载
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🎯 真实应用视觉测试 v2\n');
  console.log('目标: http://127.0.0.1:5174 (现有 vite)\n');
  
  const TEST_URL = 'http://127.0.0.1:5174';
  const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    viewport: { width: 1440, height: 900 },
    // 禁用外部资源加速
    serviceWorkers: 'block'
  });
  // 拦截外部字体请求加速
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('fonts.googleapis.com') || url.includes('api.fontshare.com') || url.includes('fonts.gstatic.com')) {
      return route.abort();
    }
    route.continue();
  });
  
  const page = await context.newPage();
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0, 100)}`));
  page.on('pageerror', err => consoleLogs.push(`[error] ${err.message.slice(0, 100)}`));
  
  const results = [];
  const routes = [
    { name: '01-home', url: '/' },
    { name: '02-accounts', url: '/accounts' },
    { name: '03-publish', url: '/publish' },
  ];
  
  for (const route of routes) {
    consoleLogs.length = 0;
    console.log(`📸 ${route.name.padEnd(20)} → ${route.url}`);
    
    try {
      const start = Date.now();
      await page.goto(`${TEST_URL}${route.url}`, { 
        timeout: 30000, 
        waitUntil: 'domcontentloaded' 
      });
      
      // 等待 Vue app 挂载
      await page.waitForFunction(() => {
        const app = document.querySelector('#app');
        return app && app.children.length > 0;
      }, { timeout: 15000 }).catch(() => console.log('   ⏳ app 挂载超时'));
      
      // 额外等待渲染
      await page.waitForTimeout(1500);
      
      // 检查 DOM 内容
      const domInfo = await page.evaluate(() => {
        const app = document.querySelector('#app');
        return {
          hasApp: !!app,
          childCount: app?.children.length || 0,
          bodyText: document.body.innerText.slice(0, 100),
          title: document.title
        };
      });
      
      const screenshotPath = path.join(SCREENSHOT_DIR, `${route.name}-v2.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      
      const elapsed = Date.now() - start;
      const stat = fs.statSync(screenshotPath);
      
      console.log(`   ⏱️  ${elapsed}ms | ${(stat.size/1024).toFixed(1)}KB | DOM: ${domInfo.childCount} 子节点`);
      console.log(`   📝 "${domInfo.bodyText.replace(/\n/g, ' ').slice(0, 60)}..."`);
      
      if (consoleLogs.length > 0) {
        console.log(`   📋 Console:`);
        consoleLogs.slice(0, 3).forEach(l => console.log(`      ${l}`));
      }
      
      results.push({ 
        route: route.name, 
        status: domInfo.childCount > 0 ? 'RENDERED' : 'EMPTY', 
        duration: elapsed, 
        size: stat.size,
        bodyText: domInfo.bodyText
      });
    } catch (err) {
      console.log(`   ❌ ${err.message.split('\n')[0].slice(0, 60)}`);
      results.push({ route: route.name, status: 'FAIL', error: err.message });
    }
  }
  
  await browser.close();
  
  // OCR 验证
  console.log('\n🔍 OCR 文字提取...\n');
  const Tesseract = require('tesseract.js');
  for (const route of results.filter(r => r.status === 'RENDERED')) {
    try {
      const imgPath = path.join(SCREENSHOT_DIR, `${route.name}-v2.png`);
      const result = await Tesseract.recognize(imgPath, 'chi_sim+eng', { logger: () => {} });
      const text = result.data.text.trim().replace(/\s+/g, ' ');
      console.log(`   ${route.name}: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`);
    } catch (err) {
      console.log(`   ${route.name}: OCR失败`);
    }
  }
  
  // 报告
  const rendered = results.filter(r => r.status === 'RENDERED').length;
  const empty = results.filter(r => r.status === 'EMPTY').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 测试结果: ${rendered} 渲染 | ${empty} 空白 | ${failed} 失败`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // 保存报告
  const reportPath = path.join(__dirname, '..', 'reports', `real-app-v2-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ 
    timestamp: new Date().toISOString(),
    results,
    summary: { rendered, empty, failed }
  }, null, 2));
  console.log(`报告: ${reportPath}`);
})();
