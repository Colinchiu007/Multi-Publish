/**
 * 路由扫描测试 — 快速验证所有 18 个路由
 *
 * 每个路由检查：
 *   1. 可达性（无崩溃）
 *   2. 无 console error
 *   3. 无 pageerror
 *   4. 有主要标题/内容渲染
 *   5. 按钮/链接数量统计
 *   6. IPC 调用次数
 *
 * 输出：
 *   - 控制台汇总表
 *   - reports/routes-scan.json
 *   - reports/screenshots/routes-scan/<route>.png
 */

const { FunctionalRunner } = require('./helpers/functional-runner');
const fs = require('fs');
const path = require('path');

// 18 个路由（与 router/index.js 保持一致）
const ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/comments', name: 'Comments' },
  { path: '/first-run', name: 'FirstRun' },
  { path: '/publish', name: 'Publish' },
  { path: '/accounts', name: 'Accounts' },
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/collection', name: 'Collection' },
  { path: '/monitor', name: 'Monitor' },
  { path: '/keywords', name: 'Keywords' },
  { path: '/viral-analysis', name: 'ViralAnalysis' },
  { path: '/model-providers', name: 'ModelProviders' },
  { path: '/create', name: 'Create' },
  { path: '/create/result', name: 'CreateResult' },
  { path: '/create/pipeline', name: 'Pipeline' },
  { path: '/create/history', name: 'CreateHistory' },
  { path: '/cloud-publish', name: 'CloudPublish' },
  { path: '/intelligence', name: 'Intelligence' },
  { path: '/calendar', name: 'Calendar' }
];

async function scanRoute(r, route) {
  const errors = { console: [], page: [] };
  try {
    // 重置 mock 状态
    await r.page.evaluate(() => window.__resetMock());
    await r.goto(route.path);
    await r.waitForTimeout(800); // 给 Vue 异步渲染时间

    const stats = await r.page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
      const links = Array.from(document.querySelectorAll('a'));
      return {
        title: document.title,
        bodyLen: (document.body.innerText || '').length,
        buttons: buttons.filter(b => b.offsetParent !== null).length,
        inputs: inputs.filter(i => i.offsetParent !== null).length,
        links: links.filter(l => l.offsetParent !== null).length,
        h1Count: document.querySelectorAll('h1, h2, .cohere-section-title').length,
        ipcCalls: window.__ipcCalls.length
      };
    });

    // 截图
    const shot = path.join(r.screenshotDir, 'routes-scan', route.name + '.png');
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    await r.page.screenshot({ path: shot, fullPage: true });

    return {
      route: route.path,
      name: route.name,
      status: 'OK',
      ...stats,
      screenshot: shot,
      consoleErrors: [...r.consoleErrors],
      pageErrors: [...r.pageErrors]
    };
  } catch (e) {
    return {
      route: route.path,
      name: route.name,
      status: 'FAIL',
      error: e.message,
      consoleErrors: [...r.consoleErrors],
      pageErrors: [...r.pageErrors]
    };
  } finally {
    r.consoleErrors = [];
    r.pageErrors = [];
  }
}

(async () => {
  const r = new FunctionalRunner({ specName: 'routes-scan' });
  await r.launch();

  const results = [];
  const t0 = Date.now();
  for (const route of ROUTES) {
    process.stdout.write('Scanning ' + route.name + ' (' + route.path + ')... ');
    const result = await scanRoute(r, route);
    results.push(result);
    const ok = result.status === 'OK' && result.consoleErrors.length === 0 && result.pageErrors.length === 0;
    console.log(ok ? 'OK' : ('ISSUES (console=' + result.consoleErrors.length + ' page=' + result.pageErrors.length + ')'));
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  await r.close();

  // 汇总
  const okCount = results.filter(function (x) { return x.status === 'OK' && x.consoleErrors.length === 0 && x.pageErrors.length === 0; }).length;
  const failCount = results.length - okCount;

  console.log('\n========================================');
  console.log('Routes Scan Summary');
  console.log('========================================');
  console.log('Total: ' + results.length);
  console.log('OK: ' + okCount);
  console.log('Issues: ' + failCount);
  console.log('Elapsed: ' + elapsed + 's');
  console.log('========================================');

  console.log('\nDetails:');
  for (const x of results) {
    const issues = x.consoleErrors.length + x.pageErrors.length;
    const marker = issues === 0 ? '✓' : '✗';
    console.log('  ' + marker + ' ' + x.name.padEnd(15) + ' btns=' + (x.buttons || 0) + ' inputs=' + (x.inputs || 0) + ' links=' + (x.links || 0) + ' ipc=' + (x.ipcCalls || 0) + (x.status !== 'OK' ? ' STATUS=' + x.status : ''));
    if (x.consoleErrors.length > 0) {
      x.consoleErrors.slice(0, 2).forEach(function (e) { console.log('      console: ' + e.text.slice(0, 120)); });
    }
    if (x.pageErrors.length > 0) {
      x.pageErrors.slice(0, 2).forEach(function (e) { console.log('      pageerror: ' + e.message.slice(0, 120)); });
    }
    if (x.status !== 'OK') {
      console.log('      error: ' + x.error);
    }
  }

  // 保存 JSON 报告
  const reportsDir = path.join(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, 'routes-scan.json');
  fs.writeFileSync(reportPath, JSON.stringify({ summary: { total: results.length, ok: okCount, fail: failCount, elapsed }, results }, null, 2));
  console.log('\nReport saved: ' + reportPath);
  process.exit(0);
})().catch(function (e) {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});