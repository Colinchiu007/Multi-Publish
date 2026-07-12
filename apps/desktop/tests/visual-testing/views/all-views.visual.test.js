/**
 * 45个核心视图的视觉测试
 * 运行: node tests/visual-testing/views/all-views.visual.test.js
 */

const { VisualTestRunner } = require('../test-runner');

/**
 * 视图测试配置
 * 每个视图: { name, route, waitFor, checks: [{name, prompt, validator}] }
 */
const viewTests = [
  // ==================== 首页相关 (5个) ====================
  { name: 'home-default', route: '/', waitFor: '[data-testid=home-content]', checks: [
    { name: 'Logo', prompt: '是否存在Logo或品牌标识？' },
    { name: '主导航', prompt: '是否存在主导航菜单？' },
    { name: '内容区域', prompt: '是否存在主要内容展示区域？' }
  ]},
  { name: 'home-empty-state', route: '/', waitFor: '.empty-state', checks: [
    { name: '空状态提示', prompt: '是否显示空状态提示文案？' },
    { name: '引导按钮', prompt: '是否存在添加/创建引导按钮？' }
  ]},
  { name: 'home-with-articles', route: '/', waitFor: '[data-testid=article-card]', checks: [
    { name: '文章卡片', prompt: '是否显示文章卡片列表？' },
    { name: '缩略图', prompt: '文章卡片是否有缩略图？' },
    { name: '标题', prompt: '文章是否有标题显示？' }
  ]},
  { name: 'home-loading', route: '/', checks: [
    { name: '加载状态', prompt: '是否存在loading骨架屏或加载动画？' }
  ]},
  { name: 'home-error', route: '/', waitMs: 500, checks: [
    { name: '错误提示', prompt: '是否存在错误提示信息？' }
  ]},

  // ==================== 账号管理 (5个) ====================
  { name: 'accounts-list', route: '/accounts', waitFor: '[data-testid=account-list]', checks: [
    { name: '账号列表', prompt: '是否显示账号列表？' },
    { name: '添加按钮', prompt: '是否存在添加账号按钮？' },
    { name: '筛选器', prompt: '是否存在平台筛选器？' }
  ]},
  { name: 'accounts-add', route: '/accounts/add', waitFor: '[data-testid=add-account-form]', checks: [
    { name: '表单', prompt: '是否存在添加账号表单？' },
    { name: '平台选择', prompt: '是否存在平台选择器？' },
    { name: '提交按钮', prompt: '是否存在提交/保存按钮？' }
  ]},
  { name: 'accounts-edit', route: '/accounts/edit/1', waitFor: '[data-testid=edit-account-form]', checks: [
    { name: '编辑表单', prompt: '是否存在编辑账号表单？' },
    { name: '删除按钮', prompt: '是否存在删除按钮？' }
  ]},
  { name: 'accounts-bind-weibo', route: '/accounts/bind/weibo', waitFor: '[data-testid=qr-login]', checks: [
    { name: '二维码', prompt: '是否显示微博登录二维码？' },
    { name: '倒计时', prompt: '是否显示刷新倒计时？' }
  ]},
  { name: 'accounts-bind-douyin', route: '/accounts/bind/douyin', waitFor: '[data-testid=qr-login]', checks: [
    { name: '二维码', prompt: '是否显示抖音登录二维码？' }
  ]},

  // ==================== 发布管理 (5个) ====================
  { name: 'publish-form', route: '/publish', waitFor: '[data-testid=publish-form]', checks: [
    { name: '标题输入', prompt: '是否存在标题输入框？' },
    { name: '内容编辑', prompt: '是否存在富文本编辑器？' },
    { name: '平台选择', prompt: '是否存在平台多选器？' },
    { name: '发布按钮', prompt: '是否存在发布按钮？' }
  ]},
  { name: 'publish-scheduled', route: '/publish', waitFor: '[data-testid=schedule-picker]', checks: [
    { name: '定时选项', prompt: '是否存在定时发布选项？' },
    { name: '日期选择', prompt: '是否存在日期时间选择器？' }
  ]},
  { name: 'publish-preview', route: '/publish', waitMs: 500, checks: [
    { name: '预览按钮', prompt: '是否存在预览按钮？' }
  ]},
  { name: 'publish-draft', route: '/publish?mode=draft', waitFor: '[data-testid=draft-list]', checks: [
    { name: '草稿列表', prompt: '是否显示草稿列表？' },
    { name: '草稿数量', prompt: '是否显示草稿数量？' }
  ]},
  { name: 'publish-history', route: '/publish/history', waitFor: '[data-testid=history-list]', checks: [
    { name: '发布记录', prompt: '是否显示发布历史记录？' },
    { name: '状态标签', prompt: '是否显示各平台发布状态？' }
  ]},

  // ==================== 批量操作 (4个) ====================
  { name: 'batch-list', route: '/batch', waitFor: '[data-testid=batch-list]', checks: [
    { name: '批量列表', prompt: '是否显示批量任务列表？' },
    { name: '全选', prompt: '是否存在全选checkbox？' },
    { name: '批量操作', prompt: '是否存在批量操作按钮？' }
  ]},
  { name: 'batch-edit', route: '/batch/edit/1', waitFor: '[data-testid=batch-edit-form]', checks: [
    { name: '多选编辑', prompt: '是否支持多平台编辑？' },
    { name: '平台差异', prompt: '是否显示平台差异提示？' }
  ]},
  { name: 'batch-schedule', route: '/batch/schedule', waitFor: '[data-testid=schedule-grid]', checks: [
    { name: '排期日历', prompt: '是否显示排期日历？' },
    { name: '时间轴', prompt: '是否显示时间轴视图？' }
  ]},
  { name: 'batch-copy', route: '/batch/copy', waitFor: '[data-testid=copy-source]', checks: [
    { name: '复制来源', prompt: '是否显示复制来源选择？' },
    { name: '目标选择', prompt: '是否显示目标账号选择？' }
  ]},

  // ==================== 创作中心 (4个) ====================
  { name: 'create-editor', route: '/create', waitFor: '[data-testid=rich-editor]', checks: [
    { name: '富编辑器', prompt: '是否存在富文本编辑器？' },
    { name: '工具栏', prompt: '是否存在格式工具栏？' },
    { name: '媒体上传', prompt: '是否存在图片/视频上传按钮？' }
  ]},
  { name: 'create-template', route: '/create/template', waitFor: '[data-testid=template-list]', checks: [
    { name: '模板列表', prompt: '是否显示模板列表？' },
    { name: '模板分类', prompt: '是否存在模板分类筛选？' }
  ]},
  { name: 'create-media-library', route: '/create/media', waitFor: '[data-testid=media-grid]', checks: [
    { name: '媒体库', prompt: '是否显示媒体文件网格？' },
    { name: '上传区', prompt: '是否存在拖拽上传区域？' }
  ]},
  { name: 'create-ai-assist', route: '/create/ai', waitFor: '[data-testid=ai-panel]', checks: [
    { name: 'AI面板', prompt: '是否存在AI辅助面板？' },
    { name: '生成按钮', prompt: '是否存在AI生成按钮？' }
  ]},

  // ==================== 监控面板 (4个) ====================
  { name: 'monitor-dashboard', route: '/monitor', waitFor: '[data-testid=monitor-grid]', checks: [
    { name: '多屏视图', prompt: '是否显示多屏WebView布局？' },
    { name: '屏幕切换', prompt: '是否存在屏幕切换控件？' },
    { name: '状态栏', prompt: '是否显示各屏幕状态？' }
  ]},
  { name: 'monitor-2screen', route: '/monitor?layout=2', waitFor: '[data-testid=split-2]', checks: [
    { name: '双屏布局', prompt: '是否显示2分屏布局？' }
  ]},
  { name: 'monitor-3screen', route: '/monitor?layout=3', waitFor: '[data-testid=split-3]', checks: [
    { name: '三分屏布局', prompt: '是否显示3分屏布局？' }
  ]},
  { name: 'monitor-fullscreen', route: '/monitor?fullscreen=1', waitFor: '[data-testid=fullscreen]', checks: [
    { name: '全屏模式', prompt: '是否进入全屏模式？' }
  ]},

  // ==================== 数据统计 (4个) ====================
  { name: 'analytics-overview', route: '/analytics', waitFor: '[data-testid=stat-cards]', checks: [
    { name: '统计卡片', prompt: '是否显示数据统计卡片？' },
    { name: '图表', prompt: '是否显示趋势图表？' }
  ]},
  { name: 'analytics-platform', route: '/analytics/platform', waitFor: '[data-testid=platform-chart]', checks: [
    { name: '平台对比', prompt: '是否显示各平台数据对比？' }
  ]},
  { name: 'analytics-article', route: '/analytics/article', waitFor: '[data-testid=article-table]', checks: [
    { name: '文章列表', prompt: '是否显示文章数据表格？' },
    { name: '排序', prompt: '是否存在排序功能？' }
  ]},
  { name: 'analytics-export', route: '/analytics/export', waitFor: '[data-testid=export-form]', checks: [
    { name: '导出选项', prompt: '是否存在导出格式选择？' },
    { name: '日期范围', prompt: '是否存在日期范围选择？' }
  ]},

  // ==================== 设置页面 (4个) ====================
  { name: 'settings-general', route: '/settings', waitFor: '[data-testid=settings-form]', checks: [
    { name: '设置项', prompt: '是否显示通用设置项？' },
    { name: '保存按钮', prompt: '是否存在保存按钮？' }
  ]},
  { name: 'settings-notification', route: '/settings/notification', waitFor: '[data-testid=notification-settings]', checks: [
    { name: '通知开关', prompt: '是否显示通知开关？' }
  ]},
  { name: 'settings-shortcuts', route: '/settings/shortcuts', waitFor: '[data-testid=shortcut-list]', checks: [
    { name: '快捷键列表', prompt: '是否显示快捷键配置列表？' }
  ]},
  { name: 'settings-about', route: '/settings/about', waitFor: '[data-testid=about-info]', checks: [
    { name: '版本信息', prompt: '是否显示版本号？' },
    { name: '更新检查', prompt: '是否存在检查更新按钮？' }
  ]},

  // ==================== 登录页面 (3个) ====================
  { name: 'login-default', route: '/login', waitFor: '[data-testid=login-form]', checks: [
    { name: '登录表单', prompt: '是否存在登录表单？' },
    { name: '第三方登录', prompt: '是否存在第三方登录选项？' }
  ]},
  { name: 'login-qr', route: '/login?method=qr', waitFor: '[data-testid=qr-code]', checks: [
    { name: '二维码', prompt: '是否显示扫码登录二维码？' }
  ]},
  { name: 'login-error', route: '/login', waitMs: 1000, checks: [
    { name: '错误提示', prompt: '是否存在错误提示？' }
  ]},

  // ==================== 智能助手 (3个) ====================
  { name: 'intelligence-keywords', route: '/intelligence/keywords', waitFor: '[data-testid=keyword-cloud]', checks: [
    { name: '关键词云', prompt: '是否显示关键词云？' },
    { name: '趋势图', prompt: '是否显示热度趋势图？' }
  ]},
  { name: 'intelligence-trends', route: '/intelligence/trends', waitFor: '[data-testid=trend-list]', checks: [
    { name: '热点列表', prompt: '是否显示热点话题列表？' }
  ]},
  { name: 'intelligence-recommend', route: '/intelligence/recommend', waitFor: '[data-testid=content-recommend]', checks: [
    { name: '推荐内容', prompt: '是否显示内容推荐？' }
  ]},

  // ==================== 评论管理 (2个) ====================
  { name: 'comments-list', route: '/comments', waitFor: '[data-testid=comment-list]', checks: [
    { name: '评论列表', prompt: '是否显示评论列表？' },
    { name: '回复按钮', prompt: '是否存在回复按钮？' }
  ]},
  { name: 'comments-reply', route: '/comments/reply/1', waitFor: '[data-testid=reply-form]', checks: [
    { name: '回复表单', prompt: '是否存在回复表单？' }
  ]},

  // ==================== 收藏管理 (2个) ====================
  { name: 'collection-list', route: '/collection', waitFor: '[data-testid=collection-grid]', checks: [
    { name: '收藏网格', prompt: '是否显示收藏内容网格？' },
    { name: '分类标签', prompt: '是否存在分类标签？' }
  ]},
  { name: 'collection-detail', route: '/collection/1', waitFor: '[data-testid=collection-detail]', checks: [
    { name: '详情视图', prompt: '是否显示收藏详情？' }
  ]},
];

async function runAllViewTests() {
  console.log('🚀 开始45个核心视图视觉测试...\n');
  
  const runner = new VisualTestRunner({
    url: process.env.TEST_URL || 'http://localhost:5173',
    headless: process.env.HEADLESS !== 'false'
  });
  
  await runner.launch();
  
  for (const test of viewTests) {
    console.log(`📸 测试: ${test.name}`);
    try {
      await runner.aiVisionTest(test.name, test.route, test.checks, {
        waitFor: test.waitFor,
        waitMs: test.waitMs
      });
    } catch (err) {
      runner.results.push({ test: test.name, status: 'ERROR', error: err.message });
    }
  }
  
  await runner.close();
  
  // 输出失败项
  const failed = runner.results.filter(r => r.status === 'FAILED');
  if (failed.length > 0) {
    console.log('\n❌ 失败测试:');
    failed.forEach(f => console.log(`   - ${f.test}`));
  }
}

// 单独测试某个视图
async function runSingleView(viewName) {
  const test = viewTests.find(v => v.name === viewName);
  if (!test) {
    console.log(`❌ 未找到视图: ${viewName}`);
    console.log('可用视图:', viewTests.map(v => v.name).join(', '));
    return;
  }
  
  const runner = new VisualTestRunner();
  await runner.launch();
  
  await runner.aiVisionTest(test.name, test.route, test.checks, {
    waitFor: test.waitFor,
    waitMs: test.waitMs
  });
  
  await runner.close();
}

// CLI 入口（仅当直接调用此文件时执行，被 require() 时不触发副作用）
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--single' && args[1]) {
    runSingleView(args[1]);
  } else if (args[0] === '--list') {
    console.log('可用的视图测试:');
    viewTests.forEach(v => console.log(`  - ${v.name}`));
  } else {
    runAllViewTests();
  }
}

module.exports = { viewTests, runAllViewTests, runSingleView };
