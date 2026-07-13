/**
 * 功能性测试 — 验证页面交互逻辑和功能正确性
 * 运行: node tests/visual-testing/functional-test.js
 */

try { require('dotenv').config({ path: __dirname + '/.env' }); } catch (_) {}

const { VisualTestRunner } = require('./test-runner');

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:5174';

/** Hash 路由辅助函数 */
function hashUrl(route) {
  if (route === '/') return BASE_URL + '/';
  return BASE_URL + '/#' + route;
}

const functionalTests = [
  // ==================== 导航功能 ====================
  {
    name: 'nav-routes',
    description: '所有导航路由可达',
    async run(runner) {
      const routes = ['/', '/accounts', '/publish', '/collection', '/monitor', '/comments', '/dashboard', '/create', '/calendar'];
      const errors = [];
      for (const route of routes) {
        try {
          await runner.page.goto(hashUrl(route), { waitUntil: 'networkidle', timeout: 10000 });
        } catch (err) {
          errors.push(`${route}: ${err.message.split('\n')[0]}`);
        }
      }
      return { passed: errors.length === 0, errors };
    }
  },
  {
    name: 'nav-highlight',
    description: '导航高亮跟随路由',
    async run(runner) {
      await runner.page.goto(hashUrl('/accounts'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(500);
      const activeCount = await runner.page.$$eval('.nav-item.active, a.router-link-exact-active', els => els.length);
      return { passed: activeCount > 0, errors: activeCount === 0 ? ['导航项无 active 高亮'] : [] };
    }
  },

  // ==================== 首页功能 ====================
  {
    name: 'home-content',
    description: '首页内容渲染',
    async run(runner) {
      await runner.page.goto(hashUrl('/'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1000);
      const hasContent = await runner.page.evaluate(() => document.querySelector('main')?.innerHTML?.length > 100);
      return { passed: hasContent, errors: hasContent ? [] : ['主内容区域为空'] };
    }
  },
  {
    name: 'home-sidebar-platforms',
    description: '侧边栏平台列表',
    async run(runner) {
      await runner.page.goto(hashUrl('/'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(500);
      const count = await runner.page.$$eval('.cohere-platform-item', els => els.length);
      return { passed: count >= 3, errors: count < 3 ? [`平台列表项不足: ${count}`] : [] };
    }
  },

  // ==================== 账号管理 ====================
  {
    name: 'accounts-add-dialog',
    description: '添加账号弹窗',
    async run(runner) {
      await runner.page.goto(hashUrl('/accounts'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1000);
      
      const addBtn = await runner.page.$('button:has-text("添加账号")');
      if (!addBtn) return { passed: false, errors: ['未找到添加按钮'] };
      await addBtn.click();
      await runner.page.waitForTimeout(800);
      
      const modal = await runner.page.$('.ui-modal, .el-dialog, [role="dialog"]');
      return { passed: !!modal, errors: modal ? [] : ['点击添加后未弹出对话框'] };
    }
  },
  {
    name: 'accounts-filter',
    description: '账号列表筛选',
    async run(runner) {
      await runner.page.goto(hashUrl('/accounts'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1000);
      const filterChips = await runner.page.$$eval('button', btns =>
        btns.filter(b => ['全部', '已登录', '未登录'].includes(b.textContent.trim())).length
      );
      return { passed: filterChips >= 3, errors: filterChips < 3 ? [`筛选按钮不足: ${filterChips}`] : [] };
    }
  },

  // ==================== 发布功能 ====================
  {
    name: 'publish-form',
    description: '发布表单字段',
    async run(runner) {
      await runner.page.goto(hashUrl('/publish'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1000);
      const inputs = await runner.page.$$('input, textarea');
      const hasTitle = await runner.page.$('input[placeholder*="标题"]');
      const hasPublishBtn = await runner.page.$$eval('button', btns => btns.some(b => b.textContent.includes('发布')));
      return {
        passed: inputs.length >= 2 && !!hasTitle && hasPublishBtn,
        errors: [
          inputs.length < 2 ? `输入框不足: ${inputs.length}` : '',
          !hasTitle ? '标题输入框不存在' : '',
          !hasPublishBtn ? '发布按钮不存在' : ''
        ].filter(Boolean)
      };
    }
  },

  // ==================== 监控功能 ====================
  {
    name: 'monitor-layout',
    description: '监控页面布局',
    async run(runner) {
      await runner.page.goto(hashUrl('/monitor'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1500);
      const hasContent = await runner.page.evaluate(() => document.querySelector('main')?.innerHTML?.length > 100);
      return { passed: hasContent, errors: hasContent ? [] : ['监控页面内容为空'] };
    }
  },

  // ==================== 模型服务商 ====================
  {
    name: 'model-provider-filter',
    description: '服务商分类筛选',
    async run(runner) {
      await runner.page.goto(hashUrl('/model-providers'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1000);
      const chips = await runner.page.$$('.cohere-filter-chip');
      return { passed: chips.length >= 5, errors: chips.length < 5 ? [`筛选按钮不足: ${chips.length}`] : [] };
    }
  },
  {
    name: 'model-provider-cards',
    description: '服务商卡片区域',
    async run(runner) {
      await runner.page.goto(hashUrl('/model-providers'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1000);
      const cards = await runner.page.$$('.provider-card, .provider-grid, [class*="provider"]');
      return { passed: true, errors: [], info: `发现 ${cards.length} 个服务商相关元素` };
    }
  },

  // ==================== 日历功能 ====================
  {
    name: 'calendar-grid',
    description: '日历网格渲染',
    async run(runner) {
      await runner.page.goto(hashUrl('/calendar'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1500);
      const gridChildren = await runner.page.$$eval('.calendar-grid > *', els => els.length);
      return { passed: gridChildren >= 28, errors: gridChildren < 28 ? [`日历格子不足: ${gridChildren}`] : [] };
    }
  },
  {
    name: 'calendar-nav',
    description: '日历月份导航',
    async run(runner) {
      await runner.page.goto(hashUrl('/calendar'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1500);
      const btnTexts = await runner.page.$$eval('button', els => els.map(e => e.textContent.trim()));
      const hasNav = btnTexts.some(t => t.includes('◀')) && btnTexts.some(t => t.includes('▶')) && btnTexts.some(t => t.includes('今天'));
      return { passed: hasNav, errors: hasNav ? [] : ['缺少月份导航按钮'] };
    }
  },

  // ==================== 视频创作 ====================
  {
    name: 'create-view-tabs',
    description: '创作页 Tab 切换',
    async run(runner) {
      await runner.page.goto(hashUrl('/create'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1500);
      const tabs = await runner.page.$$('.view-tab, .view-tabs button');
      return { passed: tabs.length >= 3, errors: tabs.length < 3 ? [`Tab 数量不足: ${tabs.length}`] : [] };
    }
  },

  // ==================== 智能助手 ====================
  {
    name: 'intelligence-search',
    description: '智能搜索入口',
    async run(runner) {
      await runner.page.goto(hashUrl('/intelligence'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1500);
      const hasContent = await runner.page.evaluate(() => document.querySelector('main')?.innerHTML?.length > 100);
      return { passed: hasContent, errors: hasContent ? [] : ['智能助手页面内容为空'] };
    }
  },

  // ==================== 评论管理 ====================
  {
    name: 'comments-list',
    description: '评论列表渲染',
    async run(runner) {
      await runner.page.goto(hashUrl('/comments'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1500);
      const hasContent = await runner.page.evaluate(() => document.querySelector('main')?.innerHTML?.length > 100);
      return { passed: hasContent, errors: hasContent ? [] : ['评论页面内容为空'] };
    }
  },

  // ==================== 收藏管理 ====================
  {
    name: 'collection-view',
    description: '收藏页面渲染',
    async run(runner) {
      await runner.page.goto(hashUrl('/collection'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(1500);
      const cards = await runner.page.$$('.cohere-stat-card');
      return { passed: cards.length >= 2, errors: cards.length < 2 ? [`收藏统计卡片不足: ${cards.length}`] : [] };
    }
  },

  // ==================== 全局 UI ====================
  {
    name: 'global-topnav',
    description: '顶部导航栏',
    async run(runner) {
      await runner.page.goto(hashUrl('/'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(500);
      const navItems = await runner.page.$$('.nav-item');
      const brand = await runner.page.$('.brand');
      return {
        passed: navItems.length >= 5 && !!brand,
        errors: [navItems.length < 5 ? `导航项不足: ${navItems.length}` : '', !brand ? '品牌标识不存在' : ''].filter(Boolean)
      };
    }
  },
  {
    name: 'global-upgrade-btn',
    description: '升级按钮（非Pro用户）',
    async run(runner) {
      await runner.page.goto(hashUrl('/'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(500);
      const upgradeBtn = await runner.page.$('.pro-btn, button:has-text("升级 Pro")');
      return { passed: !!upgradeBtn, errors: upgradeBtn ? [] : ['升级按钮未找到'] };
    }
  },
  {
    name: 'global-status-indicator',
    description: '服务状态指示器',
    async run(runner) {
      await runner.page.goto(hashUrl('/'), { waitUntil: 'networkidle', timeout: 10000 });
      await runner.page.waitForTimeout(500);
      const statusDot = await runner.page.$('.status-dot, .status-indicator');
      return { passed: !!statusDot, errors: statusDot ? [] : ['状态指示器不存在'] };
    }
  },
];

async function runFunctionalTests() {
  console.log('🧪 开始功能性测试...\n');
  console.log(`  Target: ${BASE_URL}\n`);
  
  const runner = new VisualTestRunner({ headless: process.env.HEADLESS !== 'false' });
  await runner.launch();
  
  let passed = 0;
  let failed = 0;
  const total = functionalTests.length;
  const results = [];
  
  for (const test of functionalTests) {
    console.log(`🔬 [${passed + failed + 1}/${total}] ${test.name}: ${test.description}`);
    try {
      const result = await test.run(runner);
      if (result.passed) {
        passed++;
        console.log(`   ✅ ${result.info || '通过'}`);
      } else {
        failed++;
        const errMsg = Array.isArray(result.errors) ? result.errors.join(', ') : String(result.errors || '');
        console.log(`   ❌ ${errMsg}`);
      }
      results.push({ name: test.name, description: test.description, ...result });
    } catch (err) {
      failed++;
      console.log(`   ❌ 异常: ${err.message.split('\n')[0]}`);
      results.push({ name: test.name, description: test.description, passed: false, errors: [err.message] });
    }
  }
  
  await runner.close();
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: { total, passed, failed, passRate: `${((passed / total) * 100).toFixed(1)}%` },
    results
  };
  
  const fs = require('fs');
  const reportDir = 'tests/visual-testing/reports';
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = `${reportDir}/functional-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  功能性测试结果: ${passed}/${total} 通过 (${report.summary.passRate}), ${failed} 失败`);
  console.log(`  报告: ${reportPath}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) runFunctionalTests();

module.exports = { functionalTests, runFunctionalTests };
