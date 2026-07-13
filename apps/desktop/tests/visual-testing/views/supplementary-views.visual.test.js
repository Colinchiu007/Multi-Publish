/**
 * 补充视觉测试 — 覆盖遗漏的视图、弹窗、对话框
 * 运行: node tests/visual-testing/views/supplementary-views.visual.test.js
 * 
 * 覆盖范围:
 * - 11 个遗漏路由视图 (first-run, dashboard, calendar, cloud-publish, viral-analysis, 
 *   create/result, create/pipeline, create/history, intelligence, keywords)
 * - 6 个弹窗/对话框 (upgrade-modal, model-provider dialogs, monitor-dialog, 
 *   command-palette, collection-confirm, publish-upgrade)
 * - 侧边栏、导航高亮、响应式布局等全局状态
 */

const { VisualTestRunner } = require('../test-runner');

const supplementaryViewTests = [
  // ==================== 遗漏路由视图 (11个) ====================
  { name: 'first-run', route: '/first-run', waitMs: 1500, checks: [
    { name: '欢迎页面', prompt: '是否显示首次运行欢迎/引导页面？' },
    { name: '开始按钮', prompt: '是否存在开始/下一步按钮？' },
    { name: '步骤指示', prompt: '是否显示步骤进度指示器？' }
  ]},
  { name: 'dashboard', route: '/dashboard', waitMs: 1500, checks: [
    { name: '数据卡片', prompt: '是否显示数据统计卡片（发布数/阅读量/互动等）？' },
    { name: '图表区域', prompt: '是否显示趋势图表或可视化数据？' },
    { name: '试用横幅', prompt: '是否存在试用提示横幅或升级按钮？' }
  ]},
  { name: 'calendar', route: '/calendar', waitMs: 1500, checks: [
    { name: '日历网格', prompt: '是否显示月度日历网格？' },
    { name: '月份切换', prompt: '是否存在月份前/后切换按钮？' },
    { name: '今天按钮', prompt: '是否存在「今天」快速跳转按钮？' },
    { name: '日期选择', prompt: '点击某天是否显示该天的发布事件？' }
  ]},
  { name: 'cloud-publish', route: '/cloud-publish', waitMs: 1500, checks: [
    { name: '云端发布表单', prompt: '是否显示云端发布相关表单或任务列表？' },
    { name: '平台选择', prompt: '是否存在目标平台选择区域？' }
  ]},
  { name: 'viral-analysis', route: '/viral-analysis', waitMs: 1500, checks: [
    { name: '爆文分析', prompt: '是否显示爆文分析页面？' },
    { name: '数据展示', prompt: '是否存在爆文数据或分析结果展示？' }
  ]},
  { name: 'create-view-default', route: '/create', waitMs: 1500, checks: [
    { name: '视图切换', prompt: '是否存在「管线创作」「快速渲染」「历史记录」Tab 切换？' },
    { name: '管线卡片', prompt: '是否显示管线模板卡片列表？' }
  ]},
  { name: 'create-result', route: '/create/result', waitMs: 1500, checks: [
    { name: '结果页面', prompt: '是否显示创作结果页面？' },
    { name: '预览区域', prompt: '是否存在内容预览区域？' },
    { name: '操作按钮', prompt: '是否存在发布/编辑/返回等操作按钮？' }
  ]},
  { name: 'create-pipeline', route: '/create/pipeline', waitMs: 1500, checks: [
    { name: '流水线视图', prompt: '是否显示创作流水线视图？' },
    { name: '步骤进度', prompt: '是否存在步骤进度指示？' }
  ]},
  { name: 'create-history', route: '/create/history', waitMs: 1500, checks: [
    { name: '历史列表', prompt: '是否显示创作历史记录列表？' },
    { name: '记录详情', prompt: '每条记录是否显示时间/标题/状态？' }
  ]},
  { name: 'intelligence-main', route: '/intelligence', waitMs: 1500, checks: [
    { name: '搜索入口', prompt: '是否存在搜索输入框？' },
    { name: '搜索按钮', prompt: '是否存在搜索按钮？' },
    { name: '来源筛选', prompt: '是否显示数据来源筛选（如知乎/头条/微博等）？' }
  ]},
  { name: 'keyword-monitor', route: '/keywords', waitMs: 1500, checks: [
    { name: '监控面板', prompt: '是否显示关键词监控面板？' },
    { name: '关键词输入', prompt: '是否存在关键词输入或添加区域？' }
  ]},

  // ==================== 弹窗/对话框 (6个) ====================
  { name: 'upgrade-modal', route: '/', waitMs: 1000, checks: [
    { name: '升级按钮', prompt: '顶部导航是否存在「升级 Pro」按钮？点击后是否弹出升级弹窗？' }
  ]},
  { name: 'model-provider-add-dialog', route: '/model-providers', waitMs: 1000, checks: [
    { name: '添加按钮', prompt: '是否显示「添加服务商」按钮？' },
    { name: '弹窗交互', prompt: '点击添加按钮后是否弹出「添加服务商」对话框？对话框是否包含分类选择网格？' }
  ]},
  { name: 'model-provider-edit-dialog', route: '/model-providers', waitMs: 1000, checks: [
    { name: '编辑按钮', prompt: '服务商卡片上是否存在编辑按钮？' },
    { name: '编辑弹窗', prompt: '点击编辑后是否弹出编辑服务商对话框？' }
  ]},
  { name: 'model-provider-delete-dialog', route: '/model-providers', waitMs: 1000, checks: [
    { name: '删除按钮', prompt: '服务商卡片上是否存在删除按钮？' },
    { name: '确认弹窗', prompt: '点击删除后是否弹出确认删除对话框？' }
  ]},
  { name: 'monitor-settings-dialog', route: '/monitor', waitMs: 1500, checks: [
    { name: '监控面板', prompt: '监控页面是否正常加载？' },
    { name: '设置入口', prompt: '是否存在设置/配置入口按钮？' }
  ]},
  { name: 'collection-confirm-dialog', route: '/collection', waitMs: 1500, checks: [
    { name: '收藏列表', prompt: '收藏页面是否正常加载？' },
    { name: '删除入口', prompt: '是否存在删除收藏的入口（删除按钮或右键菜单）？' }
  ]},

  // ==================== 全局 UI 状态 (3个) ====================
  { name: 'sidebar-platform-list', route: '/', waitMs: 1000, checks: [
    { name: '侧边栏', prompt: '左侧是否显示平台账号侧边栏？' },
    { name: '平台图标', prompt: '每个平台是否有对应图标？' },
    { name: '搜索框', prompt: '侧边栏是否存在搜索框？' },
    { name: '状态指示', prompt: '每个平台项是否显示在线/离线状态点？' }
  ]},
  { name: 'nav-active-state', route: '/accounts', waitMs: 800, checks: [
    { name: '导航高亮', prompt: '当前路由对应的导航项是否高亮？' },
    { name: '侧边栏联动', prompt: '导航到账号管理后，侧边栏是否正常显示？' }
  ]},
  { name: 'app-header-status', route: '/', waitMs: 800, checks: [
    { name: '品牌标识', prompt: '顶部导航左侧是否有品牌 Logo/名称？' },
    { name: '运行状态', prompt: '右上角是否显示服务运行状态指示器？' },
    { name: '升级按钮', prompt: '非 Pro 用户是否显示升级按钮？' }
  ]},
];

async function runSupplementaryTests() {
  console.log('🔍 开始补充视觉测试（遗漏视图 + 弹窗 + 全局状态）...\n');
  
  const runner = new VisualTestRunner({
    url: process.env.TEST_URL || 'http://localhost:5173',
    headless: process.env.HEADLESS !== 'false'
  });
  
  await runner.launch();
  
  let passed = 0;
  let failed = 0;
  let total = 0;
  
  for (const test of supplementaryViewTests) {
    total++;
    console.log(`📸 [${total}/${supplementaryViewTests.length}] ${test.name}`);
    try {
      // 对弹窗类测试，先尝试触发弹窗
      if (test.name === 'upgrade-modal') {
        try { await runner.page.click('text=升级 Pro', { timeout: 2000 }); } catch (_) {}
        await runner.page.waitForTimeout(1000);
      }
      if (test.name === 'model-provider-add-dialog') {
        try { await runner.page.click('text=添加服务商', { timeout: 2000 }); } catch (_) {}
        await runner.page.waitForTimeout(1000);
      }
      if (test.name === 'monitor-settings-dialog') {
        try { await runner.page.click('[data-testid=fullscreen-btn], button:has-text("全屏")', { timeout: 2000 }); } catch (_) {}
        await runner.page.waitForTimeout(800);
      }
      
      await runner.aiVisionTest(test.name, test.route, test.checks, {
        waitFor: test.waitFor,
        waitMs: test.waitMs
      });
      passed++;
      console.log(`   ✅ 截图完成，${test.checks.length} 项检查`);
    } catch (err) {
      failed++;
      runner.results.push({ test: test.name, status: 'ERROR', error: err.message });
      console.log(`   ❌ ${err.message}`);
    }
  }
  
  await runner.close();
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  补充测试结果: ${passed}/${total} 通过, ${failed} 失败`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

// 单独运行
async function runSingle(name) {
  const test = supplementaryViewTests.find(v => v.name === name);
  if (!test) {
    console.log(`❌ 未找到: ${name}`);
    console.log('可用:', supplementaryViewTests.map(v => v.name).join(', '));
    return;
  }
  
  const runner = new VisualTestRunner();
  await runner.launch();
  
  if (test.name === 'upgrade-modal') {
    try { await runner.page.click('text=升级 Pro', { timeout: 2000 }); } catch (_) {}
    await runner.page.waitForTimeout(1000);
  }
  if (test.name === 'model-provider-add-dialog') {
    try { await runner.page.click('text=添加服务商', { timeout: 2000 }); } catch (_) {}
    await runner.page.waitForTimeout(1000);
  }
  
  await runner.aiVisionTest(test.name, test.route, test.checks, {
    waitFor: test.waitFor,
    waitMs: test.waitMs
  });
  await runner.close();
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--single' && args[1]) {
    runSingle(args[1]);
  } else if (args[0] === '--list') {
    console.log('可用的补充视图测试:');
    supplementaryViewTests.forEach(v => console.log(`  - ${v.name}`));
  } else {
    runSupplementaryTests();
  }
}

module.exports = { supplementaryViewTests, runSupplementaryTests };
