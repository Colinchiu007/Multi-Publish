/**
 * 真实应用视觉测试 - 验证 vite dev server 下的多视图
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🎯 真实应用视觉测试\n');
  console.log('目标: http://127.0.0.1:5174\n');
  
  const TEST_URL = 'http://127.0.0.1:5174';
  const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  
  const results = [];
  
  // 测试路由（基于 src/views/ 目录发现）
  const routes = [
    { name: '01-home', url: '/' },
    { name: '02-accounts', url: '/accounts' },
    { name: '03-publish', url: '/publish' },
    { name: '04-create', url: '/create' },
    { name: '05-monitor', url: '/monitor' },
  ];
  
  for (const route of routes) {
    try {
      console.log(`📸 ${route.name.padEnd(20)} → ${route.url}`);
      const start = Date.now();
      
      await page.goto(`${TEST_URL}${route.url}`, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800); // 等待Vue渲染
      
      const screenshotPath = path.join(SCREENSHOT_DIR, `${route.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      
      const elapsed = Date.now() - start;
      const stat = fs.statSync(screenshotPath);
      
      console.log(`   ✅ ${elapsed}ms | ${(stat.size/1024).toFixed(1)}KB | ${screenshotPath.split('\\').pop()}`);
      results.push({ route: route.name, status: 'PASS', duration: elapsed, size: stat.size });
    } catch (err) {
      console.log(`   ❌ ${err.message.split('\n')[0].slice(0, 60)}`);
      results.push({ route: route.name, status: 'FAIL', error: err.message });
    }
  }
  
  // 收集页面文本（OCR）
  console.log('\n🔍 OCR 验证页面内容...\n');
  const Tesseract = require('tesseract.js');
  for (const route of routes.filter(r => r.status === 'PASS')) {
    try {
      const imgPath = path.join(SCREENSHOT_DIR, `${route.name}.png`);
      const result = await Tesseract.recognize(imgPath, 'chi_sim+eng', { logger: () => {} });
      const text = result.data.text.trim().replace(/\s+/g, ' ');
      const preview = text.slice(0, 80);
      console.log(`   ${route.name}: "${preview}${text.length > 80 ? '...' : ''}"`);
    } catch (err) {
      console.log(`   ${route.name}: OCR失败 - ${err.message.slice(0, 40)}`);
    }
  }
  
  await browser.close();
  
  // 输出报告
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 测试结果: ${passed} 通过 | ${failed} 失败`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (failed > 0) {
    console.log('失败路由:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.route}: ${r.error.slice(0, 80)}`);
    });
  }
  
  // 保存JSON报告
  const reportPath = path.join(__dirname, '..', 'reports', `real-app-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
  console.log(`\n报告: ${reportPath}`);
})();
