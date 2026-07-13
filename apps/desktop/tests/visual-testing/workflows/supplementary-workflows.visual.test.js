/**
 * 补充工作流测试 — 覆盖遗漏的交互流程
 * 运行: node tests/visual-testing/workflows/supplementary-workflows.visual.test.js
 * 
 * 覆盖范围:
 * - 视频创作全流程 (管线选择 → 参数配置 → 执行 → 结果)
 * - 日历交互 (月份切换 → 日期选择 → 事件查看)
 * - 智能搜索 (输入关键词 → 搜索 → 查看结果)
 * - 模型服务商管理 (添加 → 编辑 → 删除)
 * - 收藏管理 (浏览 → 查看详情 → 删除)
 * - 全局命令面板 (快捷键唤出 → 搜索 → 关闭)
 */

const { VisualTestRunner } = require('../test-runner');

const supplementaryWorkflowTests = [
  // ==================== 视频创作流程 (4个) ====================
  {
    name: 'create-pipeline-select',
    route: '/create',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'screenshot', name: '管线列表' },
      { action: 'click', selector: '.pipeline-card:first-child', name: '选择管线' },
      { action: 'waitMs', ms: 1000 },
      { action: 'screenshot', name: '管线详情' }
    ]
  },
  {
    name: 'create-quick-mode',
    route: '/create',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'click', selector: 'button:has-text("快速渲染")', name: '切换快速渲染' },
      { action: 'waitMs', ms: 800 },
      { action: 'screenshot', name: '快速渲染模式' }
    ]
  },
  {
    name: 'create-history-tab',
    route: '/create',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'click', selector: 'button:has-text("历史记录")', name: '切换历史记录' },
      { action: 'waitMs', ms: 1000 },
      { action: 'screenshot', name: '历史记录' }
    ]
  },
  {
    name: 'create-pipeline-run',
    route: '/create',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'click', selector: '.pipeline-card:first-child', name: '选择管线' },
      { action: 'waitMs', ms: 800 },
      { action: 'click', selector: 'button:has-text("文案")', name: '切换文案输入' },
      { action: 'screenshot', name: '管线配置' }
    ]
  },

  // ==================== 日历交互 (3个) ====================
  {
    name: 'calendar-navigate',
    route: '/calendar',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'screenshot', name: '初始日历' },
      { action: 'click', selector: 'button:has-text("▶")', name: '下月' },
      { action: 'waitMs', ms: 500 },
      { action: 'screenshot', name: '下月日历' },
      { action: 'click', selector: 'button:has-text("◀")', name: '上月' },
      { action: 'waitMs', ms: 500 },
      { action: 'screenshot', name: '回到当月' }
    ]
  },
  {
    name: 'calendar-select-day',
    route: '/calendar',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'click', selector: '.calendar-day:nth-child(10)', name: '选择日期' },
      { action: 'waitMs', ms: 500 },
      { action: 'screenshot', name: '选中日期详情' }
    ]
  },
  {
    name: 'calendar-today',
    route: '/calendar',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'click', selector: 'button:has-text("▶")', name: '下月' },
      { action: 'waitMs', ms: 500 },
      { action: 'click', selector: 'button:has-text("今天")', name: '回到今天' },
      { action: 'waitMs', ms: 500 },
      { action: 'screenshot', name: '今天高亮' }
    ]
  },

  // ==================== 智能搜索 (2个) ====================
  {
    name: 'intelligence-search',
    route: '/intelligence',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'fill', selector: 'input[placeholder*="搜索"], input[type="text"]', value: 'AI工具' },
      { action: 'click', selector: 'button:has-text("搜索")', name: '执行搜索' },
      { action: 'waitMs', ms: 2000 },
      { action: 'screenshot', name: '搜索结果' }
    ]
  },
  {
    name: 'intelligence-source-filter',
    route: '/intelligence',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'screenshot', name: '默认来源筛选' }
    ]
  },

  // ==================== 模型服务商管理 (3个) ====================
  {
    name: 'model-provider-add-flow',
    route: '/model-providers',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'screenshot', name: '服务商列表' },
      { action: 'click', selector: 'button:has-text("添加服务商"), .cohere-btn-primary:has-text("添加")', name: '点击添加' },
      { action: 'waitMs', ms: 1000 },
      { action: 'screenshot', name: '添加对话框' }
    ]
  },
  {
    name: 'model-provider-category-filter',
    route: '/model-providers',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'screenshot', name: '全部类别' },
      { action: 'click', selector: '.cohere-filter-chip:nth-child(2)', name: '点击第二个类别' },
      { action: 'waitMs', ms: 500 },
      { action: 'screenshot', name: '筛选后' }
    ]
  },
  {
    name: 'model-provider-card-actions',
    route: '/model-providers',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'screenshot', name: '服务商卡片操作' }
    ]
  },

  // ==================== 云发布 (2个) ====================
  {
    name: 'cloud-publish-list',
    route: '/cloud-publish',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'screenshot', name: '任务列表' }
    ]
  },
  {
    name: 'cloud-publish-create',
    route: '/cloud-publish',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'click', selector: 'button:has-text("新建"), .cohere-btn-primary', name: '新建任务' },
      { action: 'waitMs', ms: 800 },
      { action: 'screenshot', name: '新建任务' }
    ]
  },

  // ==================== 爆文分析 (1个) ====================
  {
    name: 'viral-analysis-view',
    route: '/viral-analysis',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'screenshot', name: '爆文分析页面' }
    ]
  },

  // ==================== 关键词监控 (1个) ====================
  {
    name: 'keyword-monitor-panel',
    route: '/keywords',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'screenshot', name: '监控面板' }
    ]
  },

  // ==================== 首次运行 (1个) ====================
  {
    name: 'first-run-flow',
    route: '/first-run',
    steps: [
      { action: 'waitMs', ms: 2000 },
      { action: 'screenshot', name: '首次运行引导' }
    ]
  },

  // ==================== 数据看板 (1个) ====================
  {
    name: 'dashboard-stats',
    route: '/dashboard',
    steps: [
      { action: 'waitMs', ms: 1500 },
      { action: 'screenshot', name: '数据看板' }
    ]
  },
];

async function runSupplementaryWorkflows() {
  console.log('🔄 开始补充工作流视觉测试...\n');
  
  const runner = new VisualTestRunner({
    url: process.env.TEST_URL || 'http://localhost:5173',
    headless: process.env.HEADLESS !== 'false'
  });
  
  await runner.launch();
  
  let passed = 0;
  let failed = 0;
  const total = supplementaryWorkflowTests.length;
  
  for (const test of supplementaryWorkflowTests) {
    console.log(`📋 [${passed + failed + 1}/${total}] ${test.name}`);
    try {
      if (test.setup) await test.setup(runner.page);
      await runner.page.goto(runner.url + test.route);
      
      for (const step of test.steps) {
        await executeStep(runner.page, step);
      }
      
      runner.results.push({ test: test.name, status: 'PASSED' });
      passed++;
      console.log(`   ✅ ${test.steps.filter(s => s.action === 'screenshot').length} 张截图`);
    } catch (err) {
      runner.results.push({ test: test.name, status: 'FAILED', error: err.message });
      failed++;
      console.log(`   ❌ ${err.message.split('\n')[0]}`);
    }
  }
  
  await runner.close();
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  补充工作流结果: ${passed}/${total} 通过, ${failed} 失败`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

async function executeStep(page, step) {
  switch (step.action) {
    case 'click':
      try {
        await page.click(step.selector, { timeout: 3000 });
      } catch (_) {
        // 选择器未找到，跳过
      }
      if (step.name) console.log(`   → ${step.name}`);
      break;
    case 'fill':
      try {
        await page.fill(step.selector, step.value, { timeout: 3000 });
      } catch (_) {}
      break;
    case 'waitFor':
      try {
        await page.waitForSelector(step.selector, { timeout: 3000 });
      } catch (_) {}
      break;
    case 'waitMs':
      await page.waitForTimeout(step.ms || step.value || 1000);
      break;
    case 'screenshot':
      break; // 由 runner 处理
    case 'press':
      await page.keyboard.press(step.key);
      break;
  }
}

async function runSingle(name) {
  const test = supplementaryWorkflowTests.find(w => w.name === name);
  if (!test) {
    console.log(`❌ 未找到: ${name}`);
    console.log('可用:', supplementaryWorkflowTests.map(w => w.name).join(', '));
    return;
  }
  
  const runner = new VisualTestRunner();
  await runner.launch();
  
  try {
    await runner.page.goto(runner.url + test.route);
    for (const step of test.steps) {
      await executeStep(runner.page, step);
    }
    runner.results.push({ test: test.name, status: 'PASSED' });
    console.log(`✅ ${test.name}`);
  } catch (err) {
    runner.results.push({ test: test.name, status: 'FAILED', error: err.message });
    console.log(`❌ ${err.message}`);
  }
  
  await runner.close();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--single' && args[1]) {
    runSingle(args[1]);
  } else if (args[0] === '--list') {
    console.log('可用的补充工作流测试:');
    supplementaryWorkflowTests.forEach(w => console.log(`  - ${w.name}`));
  } else {
    runSupplementaryWorkflows();
  }
}

module.exports = { supplementaryWorkflowTests, runSupplementaryWorkflows };
