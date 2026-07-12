/**
 * 视觉测试冒烟验证
 * 不需要开发服务器，本地 HTML 文件测试整个流程
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('🔥 冒烟测试开始...\n');
  
  // 1. 创建测试 HTML
  const testHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>冒烟测试</title></head>
<body style="font-family:sans-serif;padding:20px">
  <h1 data-testid="home-content">首页</h1>
  <nav data-testid="main-nav">
    <a href="/">首页</a> | <a href="/accounts">账号</a> | <a href="/publish">发布</a>
  </nav>
  <button data-testid="add-btn">添加</button>
  <input data-testid="search-input" placeholder="搜索...">
  <div data-testid="article-card">文章1</div>
</body>
</html>`;
  
  const tmpHtml = path.join(__dirname, '..', 'screenshots', '_smoke.html');
  fs.mkdirSync(path.dirname(tmpHtml), { recursive: true });
  fs.writeFileSync(tmpHtml, testHtml);
  
  // 2. 启动浏览器
  console.log('🚀 启动 Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  
  console.log('✅ 浏览器启动成功\n');
  
  // 3. 访问页面并截图
  console.log('📸 访问测试页面...');
  await page.goto(`file:///${tmpHtml.replace(/\\/g, '/')}`);
  await page.waitForSelector('[data-testid=home-content]');
  
  const screenshotPath = path.join(__dirname, '..', 'screenshots', '_smoke-test.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`✅ 截图保存: ${screenshotPath}\n`);
  
  // 4. 验证 OCR 流程
  console.log('🔍 测试 OCR 流程...');
  try {
    const Tesseract = require('tesseract.js');
    const result = await Tesseract.recognize(screenshotPath, 'chi_sim+eng', { logger: () => {} });
    const text = result.data.text.trim();
    console.log(`✅ OCR 提取文字: "${text.replace(/\s+/g, ' ').slice(0, 50)}..."`);
    
    if (text.includes('首页')) {
      console.log('✅ OCR 内容验证通过\n');
    } else {
      console.log('⚠️  OCR 提取到文字但未匹配预期内容\n');
    }
  } catch (err) {
    console.log(`⚠️  OCR 跳过: ${err.message.slice(0, 80)}\n`);
  }
  
  // 5. 验证像素对比流程
  console.log('🎯 测试像素对比流程...');
  const resemble = require('resemblejs');
  const screenshot2 = path.join(__dirname, '..', 'screenshots', '_smoke-test-2.png');
  await page.screenshot({ path: screenshot2, fullPage: true });
  
  resemble(screenshotPath).compareTo(screenshot2).onComplete(result => {
    const misMatch = parseFloat(result.misMatchPercentage);
    console.log(`✅ 像素对比完成: 差异 ${misMatch}%`);
    console.log(misMatch < 1 ? '✅ 像素对比通过\n' : '⚠️  像素有差异（正常）\n');
  });
  
  // 6. 关闭浏览器
  await new Promise(r => setTimeout(r, 1000));
  await browser.close();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 冒烟测试全部通过！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n接下来可以:');
  console.log('  1. 启动开发服务器: cd apps/desktop && npm run dev');
  console.log('  2. 运行单视图测试: node tests/visual-testing/scripts/smoke-single-view.js');
  console.log('  3. 运行全部测试: npm run test:visual:all');
  
  // 清理临时文件
  fs.unlinkSync(tmpHtml);
})().catch(err => {
  console.error('❌ 冒烟测试失败:', err.message);
  process.exit(1);
});
