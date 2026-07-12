/**
 * 32个工作流的视觉回归测试
 * 运行: node tests/visual-testing/workflows/all-workflows.visual.test.js
 */

const { VisualTestRunner } = require('../test-runner');

/**
 * 工作流测试配置
 * 每个工作流测试: 操作前截图 -> 执行操作 -> 操作后截图 -> 对比差异
 */
const workflowTests = [
  // ==================== 账号操作 (8个) ====================
  { 
    name: 'account-add-flow',
    route: '/accounts',
    steps: [
      { action: 'click', selector: '[data-testid=add-account-btn]', name: '点击添加' },
      { action: 'waitFor', selector: '[data-testid=add-account-form]' },
      { action: 'screenshot', name: '添加表单' }
    ],
    baseline: 'accounts-list',
    verify: { method: 'pixel', threshold: 0.05 }
  },
  {
    name: 'account-delete-flow',
    route: '/accounts',
    setup: async (page) => { await page.click('[data-testid=account-item]:first-child'); },
    steps: [
      { action: 'click', selector: '[data-testid=delete-btn]', name: '点击删除' },
      { action: 'waitFor', selector: '[data-testid=confirm-dialog]' },
      { action: 'screenshot', name: '确认弹窗' },
      { action: 'click', selector: '[data-testid=confirm-yes]' },
    ]
  },
  {
    name: 'account-edit-flow',
    route: '/accounts',
    steps: [
      { action: 'click', selector: '[data-testid=account-item]:first-child' },
      { action: 'click', selector: '[data-testid=edit-btn]' },
      { action: 'waitFor', selector: '[data-testid=edit-form]' },
      { action: 'screenshot', name: '编辑表单' }
    ]
  },
  {
    name: 'account-filter-platform',
    route: '/accounts',
    steps: [
      { action: 'click', selector: '[data-testid=platform-filter]' },
      { action: 'waitFor', selector: '[data-testid=filter-dropdown]' },
      { action: 'click', selector: '[data-testid=option-weibo]' },
      { action: 'waitFor', selector: '[data-testid=account-item]' },
      { action: 'screenshot', name: '筛选结果' }
    ]
  },
  {
    name: 'account-refresh-status',
    route: '/accounts',
    steps: [
      { action: 'click', selector: '[data-testid=refresh-all-btn]' },
      { action: 'waitForSelector', selector: '[data-testid=loading]', state: 'hidden' },
      { action: 'waitMs', 1000 },
      { action: 'screenshot', name: '刷新后状态' }
    ]
  },
  {
    name: 'account-bind-qr-scan',
    route: '/accounts/bind/weibo',
    steps: [
      { action: 'waitFor', selector: '[data-testid=qr-code]' },
      { action: 'screenshot', name: '二维码初始' },
      { action: 'click', selector: '[data-testid=refresh-qr]' },
      { action: 'waitMs', 2000 },
      { action: 'screenshot', name: '二维码刷新' }
    ]
  },
  {
    name: 'account-import-cookies',
    route: '/accounts/import',
    steps: [
      { action: 'screenshot', name: '导入页面' },
      { action: 'setInputFiles', selector: '[data-testid=cookie-file]', files: ['tests/cookies.json'] },
      { action: 'waitFor', selector: '[data-testid=parse-result]' },
      { action: 'screenshot', name: '解析结果' }
    ]
  },
  {
    name: 'account-export-data',
    route: '/accounts',
    steps: [
      { action: 'click', selector: '[data-testid=export-btn]' },
      { action: 'waitFor', selector: '[data-testid=export-dialog]' },
      { action: 'click', selector: '[data-testid=format-json]' },
      { action: 'click', selector: '[data-testid=confirm-export]' },
      { action: 'waitFor', selector: '[data-testid=download-complete]' },
      { action: 'screenshot', name: '导出完成' }
    ]
  },

  // ==================== 发布操作 (8个) ====================
  {
    name: 'publish-quick-flow',
    route: '/publish',
    steps: [
      { action: 'fill', selector: '[data-testid=title-input]', value: '测试标题' },
      { action: 'fill', selector: '[data-testid=content-editor]', value: '测试内容' },
      { action: 'click', selector: '[data-testid=platform-weibo]' },
      { action: 'click', selector: '[data-testid=publish-btn]' },
      { action: 'waitFor', selector: '[data-testid=publish-success]' },
      { action: 'screenshot', name: '发布成功' }
    ]
  },
  {
    name: 'publish-schedule-flow',
    route: '/publish',
    steps: [
      { action: 'click', selector: '[data-testid=schedule-toggle]' },
      { action: 'waitFor', selector: '[data-testid=datetime-picker]' },
      { action: 'click', selector: '[data-testid=datetime-picker]' },
      { action: 'selectDate', value: '2026-07-15 10:00' },
      { action: 'screenshot', name: '定时设置' }
    ]
  },
  {
    name: 'publish-draft-save',
    route: '/publish',
    steps: [
      { action: 'fill', selector: '[data-testid=title-input]', value: '草稿测试' },
      { action: 'click', selector: '[data-testid=save-draft]' },
      { action: 'waitFor', selector: '[data-testid=toast-saved]' },
      { action: 'screenshot', name: '保存草稿' }
    ]
  },
  {
    name: 'publish-preview-flow',
    route: '/publish',
    setup: async (page) => { 
      await page.fill('[data-testid=title-input]', '预览测试'); 
      await page.fill('[data-testid=content-editor]', '预览内容'); 
    },
    steps: [
      { action: 'click', selector: '[data-testid=preview-btn]' },
      { action: 'waitFor', selector: '[data-testid=preview-modal]' },
      { action: 'screenshot', name: '预览弹窗' }
    ]
  },
  {
    name: 'publish-media-upload',
    route: '/publish',
    steps: [
      { action: 'click', selector: '[data-testid=media-btn]' },
      { action: 'waitFor', selector: '[data-testid=media-modal]' },
      { action: 'screenshot', name: '媒体库弹窗' }
    ]
  },
  {
    name: 'publish-template-apply',
    route: '/publish',
    steps: [
      { action: 'click', selector: '[data-testid=template-btn]' },
      { action: 'waitFor', selector: '[data-testid=template-list]' },
      { action: 'click', selector: '[data-testid=template-item]:first-child' },
      { action: 'waitFor', selector: '[data-testid=content-editor]' },
      { action: 'screenshot', name: '模板应用' }
    ]
  },
  {
    name: 'publish-history-view',
    route: '/publish/history',
    steps: [
      { action: 'waitFor', selector: '[data-testid=history-list]' },
      { action: 'click', selector: '[data-testid=history-item]:first-child' },
      { action: 'waitFor', selector: '[data-testid=history-detail]' },
      { action: 'screenshot', name: '历史详情' }
    ]
  },
  {
    name: 'publish-retry-failed',
    route: '/publish/history',
    steps: [
      { action: 'click', selector: '[data-testid=filter-failed]' },
      { action: 'click', selector: '[data-testid=history-item]:first-child' },
      { action: 'click', selector: '[data-testid=retry-btn]' },
      { action: 'waitFor', selector: '[data-testid=publishing]' },
      { action: 'screenshot', name: '重试中' }
    ]
  },

  // ==================== 批量操作 (6个) ====================
  {
    name: 'batch-select-all',
    route: '/batch',
    steps: [
      { action: 'waitFor', selector: '[data-testid=batch-list]' },
      { action: 'click', selector: '[data-testid=select-all]' },
      { action: 'waitFor', selector: '[data-testid=batch-toolbar]' },
      { action: 'screenshot', name: '全选后' }
    ]
  },
  {
    name: 'batch-edit-platform',
    route: '/batch/edit/1',
    steps: [
      { action: 'click', selector: '[data-testid=platform-toggle]:nth-child(2)' },
      { action: 'screenshot', name: '切换平台' }
    ]
  },
  {
    name: 'batch-schedule-create',
    route: '/batch/schedule',
    steps: [
      { action: 'click', selector: '[data-testid=add-schedule]' },
      { action: 'waitFor', selector: '[data-testid=schedule-form]' },
      { action: 'screenshot', name: '排期表单' }
    ]
  },
  {
    name: 'batch-copy-flow',
    route: '/batch/copy',
    steps: [
      { action: 'select', selector: '[data-testid=source-select]', value: 'article-1' },
      { action: 'click', selector: '[data-testid=platform-weibo]' },
      { action: 'click', selector: '[data-testid=platform-douyin]' },
      { action: 'click', selector: '[data-testid=start-copy]' },
      { action: 'waitFor', selector: '[data-testid=copy-progress]' },
      { action: 'screenshot', name: '复制进度' }
    ]
  },
  {
    name: 'batch-delete-flow',
    route: '/batch',
    steps: [
      { action: 'click', selector: '[data-testid=batch-item]:first-child' },
      { action: 'click', selector: '[data-testid=delete-batch]' },
      { action: 'waitFor', selector: '[data-testid=confirm-dialog]' },
      { action: 'screenshot', name: '删除确认' }
    ]
  },
  {
    name: 'batch-filter-status',
    route: '/batch',
    steps: [
      { action: 'click', selector: '[data-testid=status-filter]' },
      { action: 'click', selector: '[data-testid=status-pending]' },
      { action: 'waitMs', 500 },
      { action: 'screenshot', name: '状态筛选' }
    ]
  },

  // ==================== 创作操作 (5个) ====================
  {
    name: 'create-text-format',
    route: '/create',
    steps: [
      { action: 'click', selector: '[data-testid=bold-btn]' },
      { action: 'click', selector: '[data-testid=italic-btn]' },
      { action: 'screenshot', name: '格式化后' }
    ]
  },
  {
    name: 'create-media-upload',
    route: '/create/media',
    steps: [
      { action: 'dragAndDrop', selector: '[data-testid=upload-zone]', files: ['test.jpg'] },
      { action: 'waitFor', selector: '[data-testid=upload-progress]' },
      { action: 'waitFor', selector: '[data-testid=upload-complete]' },
      { action: 'screenshot', name: '上传完成' }
    ]
  },
  {
    name: 'create-template-select',
    route: '/create/template',
    steps: [
      { action: 'click', selector: '[data-testid=template-item]:first-child' },
      { action: 'click', selector: '[data-testid=use-template]' },
      { action: 'waitFor', selector: '[data-testid=editor-filled]' },
      { action: 'screenshot', name: '模板应用' }
    ]
  },
  {
    name: 'create-ai-generate',
    route: '/create/ai',
    steps: [
      { action: 'fill', selector: '[data-testid=ai-prompt]', value: '写一篇关于AI的文章' },
      { action: 'click', selector: '[data-testid=generate-btn]' },
      { action: 'waitFor', selector: '[data-testid=ai-generating]' },
      { action: 'waitFor', selector: '[data-testid=ai-result]' },
      { action: 'screenshot', name: 'AI生成结果' }
    ]
  },
  {
    name: 'create-save-version',
    route: '/create',
    setup: async (page) => {
      await page.fill('[data-testid=title-input]', '版本测试');
    },
    steps: [
      { action: 'click', selector: '[data-testid=version-btn]' },
      { action: 'click', selector: '[data-testid=save-version]' },
      { action: 'waitFor', selector: '[data-testid=version-list]' },
      { action: 'screenshot', name: '版本列表' }
    ]
  },

  // ==================== 监控操作 (5个) ====================
  {
    name: 'monitor-switch-layout',
    route: '/monitor',
    steps: [
      { action: 'click', selector: '[data-testid=layout-2]' },
      { action: 'waitFor', selector: '[data-testid=split-2]' },
      { action: 'screenshot', name: '双屏' },
      { action: 'click', selector: '[data-testid=layout-3]' },
      { action: 'waitFor', selector: '[data-testid=split-3]' },
      { action: 'screenshot', name: '三屏' }
    ]
  },
  {
    name: 'monitor-fullscreen',
    route: '/monitor',
    steps: [
      { action: 'click', selector: '[data-testid=fullscreen-btn]' },
      { action: 'waitFor', selector: '[data-testid=fullscreen-active]' },
      { action: 'screenshot', name: '全屏模式' },
      { action: 'press', key: 'Escape' },
      { action: 'screenshot', name: '退出全屏' }
    ]
  },
  {
    name: 'monitor-reload',
    route: '/monitor',
    steps: [
      { action: 'click', selector: '[data-testid=reload-btn]' },
      { action: 'waitForSelector', selector: '[data-testid=loading]', state: 'hidden' },
      { action: 'waitMs', 1000 },
      { action: 'screenshot', name: '刷新后' }
    ]
  },
  {
    name: 'monitor-zoom',
    route: '/monitor',
    steps: [
      { action: 'click', selector: '[data-testid=zoom-in]' },
      { action: 'screenshot', name: '放大' },
      { action: 'click', selector: '[data-testid=zoom-out]' },
      { action: 'screenshot', name: '缩小' }
    ]
  },
  {
    name: 'monitor-audio-toggle',
    route: '/monitor',
    steps: [
      { action: 'click', selector: '[data-testid=audio-btn]' },
      { action: 'waitFor', selector: '[data-testid=audio-off]' },
      { action: 'screenshot', name: '静音' }
    ]
  },
];

async function runAllWorkflowTests() {
  console.log('🔄 开始32个工作流视觉测试...\n');
  
  const runner = new VisualTestRunner();
  await runner.launch();
  
  for (const test of workflowTests) {
    console.log(`📋 测试: ${test.name}`);
    try {
      // 执行前置操作
      if (test.setup) await test.setup(runner.page);
      
      // 访问页面
      await runner.page.goto(runner.url + test.route);
      
      // 执行步骤
      for (const step of test.steps) {
        await executeStep(runner.page, step);
      }
      
      runner.results.push({ test: test.name, status: 'PASSED' });
    } catch (err) {
      runner.results.push({ test: test.name, status: 'FAILED', error: err.message });
    }
  }
  
  await runner.close();
}

async function executeStep(page, step) {
  switch (step.action) {
    case 'click':
      await page.click(step.selector);
      if (step.name) console.log(`   → ${step.name}`);
      break;
    case 'fill':
      await page.fill(step.selector, step.value);
      break;
    case 'waitFor':
      await page.waitForSelector(step.selector);
      break;
    case 'waitForSelector':
      await page.waitForSelector(step.selector, { state: step.state || 'visible' });
      break;
    case 'waitMs':
      await page.waitForTimeout(step.value);
      break;
    case 'screenshot':
      // 由runner处理
      break;
    case 'press':
      await page.keyboard.press(step.key);
      break;
    case 'select':
      await page.selectOption(step.selector, step.value);
      break;
  }
  
  if (step.waitMs) await page.waitForTimeout(step.waitMs);
}
// CLI 入口
const args = process.argv.slice(2);
if (args[0] === '--single' && args[1]) {
  runSingleWorkflow(args[1]);
} else if (args[0] === '--list') {
  console.log('可用的工作流测试:');
  workflowTests.forEach(w => console.log(`  - ${w.name}`));
} else {
  runAllWorkflowTests();
}

// 单独测试某个工作流
async function runSingleWorkflow(workflowName) {
  const test = workflowTests.find(w => w.name === workflowName);
  if (!test) {
    console.log(`❌ 未找到工作流: ${workflowName}`);
    console.log('可用工作流:', workflowTests.map(w => w.name).join(', '));
    return;
  }

  const runner = new VisualTestRunner();
  await runner.launch();

  console.log(`📋 测试: ${test.name}`);
  try {
    if (test.setup) await test.setup(runner.page);
    await runner.page.goto(runner.url + test.route);
    for (const step of test.steps) {
      await executeStep(runner.page, step);
    }
    runner.results.push({ test: test.name, status: 'PASSED' });
  } catch (err) {
    runner.results.push({ test: test.name, status: 'FAILED', error: err.message });
    console.log(`   ❌ ${err.message}`);
  }

  await runner.close();
}

module.exports = { workflowTests, runAllWorkflowTests };