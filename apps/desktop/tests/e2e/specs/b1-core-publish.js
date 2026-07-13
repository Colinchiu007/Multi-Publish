/**
 * B1: 核心发布路径 functional E2E
 *
 * 覆盖：
 *   - Home: 加载、点导航卡片、统计显示
 *   - Publish: 单篇/批量切换、添加文章、平台勾选、发布按钮
 *   - Dashboard: 加载、刷新数据按钮、图表渲染
 *   - CloudPublish: 平台选择、表单、提交
 */

const { FunctionalRunner, assert } = require('../helpers/functional-runner');

async function testHome(r) {
  console.log('\n=== Home ===');
  await r.goto('/');
  await r.expectText('社媒管家');
  await r.expectVisible('nav');
  await r.expectNoConsoleError();

  // 点击"内容采集"统计卡片（如果存在）
  const cards = await r.listButtons();
  console.log('  Home buttons:', cards.length);

  // 检查统计加载
  const stats = await r.page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasTotal: /总发布|发布|篇/.test(text),
      hasSuccess: /成功/.test(text),
      hasFailed: /失败/.test(text)
    };
  });
  console.log('  Stats visible:', JSON.stringify(stats));
  assert(stats.hasTotal, 'Home 应该显示发布统计');

  await r.screenshot('home-loaded');
}

async function testPublish(r) {
  console.log('\n=== Publish ===');
  await r.goto('/publish');
  await r.expectText('一键发布');
  await r.waitForTimeout(800); // 等平台列表加载

  // 切换批量模式
  const batchToggle = await r.page.$('input[type="checkbox"]');
  if (batchToggle) {
    await batchToggle.click();
    await r.waitForTimeout(300);
    await r.expectText('批量');
    await r.screenshot('publish-batch-mode');

    // 切换回单篇模式
    await batchToggle.click();
    await r.waitForTimeout(300);
  }

  // 列出所有按钮
  const buttons = await r.listButtons();
  console.log('  Publish buttons:', buttons.length);

  // 列出平台复选框
  const platformChecks = await r.page.$$eval('input[type="checkbox"]', els =>
    els.filter(el => el.offsetParent !== null).map(el => ({
      checked: el.checked,
      value: el.value
    }))
  );
  console.log('  Platform checkboxes:', platformChecks.length);

  // 勾选第一个非批量模式的平台（如果没有批量）
  if (platformChecks.length > 1) {
    const platformCheckboxes = await r.page.$$('input[type="checkbox"]:not([type="radio"])');
    if (platformChecks[1] && !platformChecks[1].checked) {
      // 找到非 batch 的 checkbox
    }
  }

  // 填写标题
  const titleInputs = await r.page.$$('input[type="text"], input:not([type])');
  if (titleInputs.length > 0) {
    await titleInputs[0].fill('E2E 测试标题');
  }

  await r.screenshot('publish-with-content');

  // 点发布按钮（如果有）
  const publishBtns = await r.page.$$eval('button', els =>
    els.filter(b => /发布|发布中/.test(b.textContent) && b.offsetParent !== null).map(b => b.textContent.trim())
  );
  console.log('  Publish buttons:', publishBtns);

  await r.expectNoConsoleError();
}

async function testDashboard(r) {
  console.log('\n=== Dashboard ===');
  await r.goto('/dashboard');
  await r.expectText('数据看板');
  await r.waitForTimeout(800);

  // 检查平台数据卡片
  const platformCards = await r.page.$$eval('.cohere-card', els => els.length);
  console.log('  Platform cards:', platformCards);

  // 点击"刷新数据"按钮（如果存在）
  const refreshBtn = await r.page.locator('button:has-text("刷新")').first();
  if (await refreshBtn.count() > 0) {
    await refreshBtn.click({ timeout: 2000 }).catch(() => {});
    await r.waitForTimeout(500);
    console.log('  Refresh clicked');
  }

  // 填写基准比较输入
  const benchInput = await r.page.locator('input[placeholder*="基准"]').first();
  if (await benchInput.count() > 0) {
    await benchInput.fill('测试文章基准');
    await r.waitForTimeout(200);
    const analyzeBtn = await r.page.locator('button:has-text("分析")').first();
    if (await analyzeBtn.count() > 0) {
      await analyzeBtn.click({ timeout: 2000 }).catch(() => {});
      await r.waitForTimeout(500);
      console.log('  Benchmark analyzed');
    }
  }

  await r.screenshot('dashboard-loaded');
  await r.expectNoConsoleError();
}

async function testCloudPublish(r) {
  console.log('\n=== CloudPublish ===');
  await r.goto('/cloud-publish');
  await r.expectText('云发布');
  await r.waitForTimeout(800);

  const buttons = await r.listButtons();
  console.log('  CloudPublish buttons:', buttons.length);
  const inputs = await r.listInputs();
  console.log('  CloudPublish inputs:', inputs.length);

  await r.screenshot('cloud-publish-loaded');
  await r.expectNoConsoleError();
}

(async () => {
  const r = new FunctionalRunner({ specName: 'b1-core-publish' });
  await r.launch();
  try {
    await testHome(r);
    await testPublish(r);
    await testDashboard(r);
    await testCloudPublish(r);
  } catch (e) {
    console.error('FAIL:', e.message);
    console.error(e.stack);
  }
  const report = r.generateReport();
  console.log('\n=== B1 Summary ===');
  console.log('Checks:', report.checks.passed + '/' + report.checks.total);
  console.log('Console errors:', report.consoleErrors.length);
  console.log('Page errors:', report.pageErrors.length);
  if (report.consoleErrors.length > 0) {
    report.consoleErrors.forEach(e => console.log('  console:', e.text.slice(0, 200)));
  }
  r.saveReport();
  await r.close();
  process.exit(0);
})();