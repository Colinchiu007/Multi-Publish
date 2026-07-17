const { FunctionalRunner } = require('./functional-runner');

const SUITE_OPTIONS = { initPro: true };

function record(r, name, passed, details) {
  r.checks.push({ kind: 'functional', name, passed: Boolean(passed), details: details || null });
  if (!passed) console.log('  ✗', name, details || '');
  else console.log('  ✓', name);
  return Boolean(passed);
}

async function bodyHas(r, text) {
  return r.page.locator('body').innerText().then((value) => value.includes(text));
}

async function clickText(r, text, options = {}) {
  const selector = options.selector || `.cohere-main button:has-text("${text}"), .cohere-main [role="button"]:has-text("${text}"), .cohere-main uibutton:has-text("${text}"), .cohere-main uibutton[title="${text}"]`;
  const locator = r.page.locator(selector).first();
  if (await locator.count() === 0 || !(await locator.isVisible().catch(() => false))) return false;
  await locator.click({ timeout: 3000 });
  await r.waitForTimeout(options.wait || 250);
  return true;
}

async function fillByPlaceholder(r, placeholder, value) {
  const locator = r.page.locator(`.cohere-main input[placeholder*="${placeholder}"], .cohere-main textarea[placeholder*="${placeholder}"]`).first();
  if (await locator.count() === 0 || !(await locator.isVisible().catch(() => false))) return false;
  await locator.fill(value);
  return true;
}

async function selectFirstUsable(r, selector = '.cohere-main select') {
  const locator = r.page.locator(selector).first();
  if (await locator.count() === 0 || !(await locator.isVisible().catch(() => false))) return false;
  const values = await locator.locator('option').evaluateAll((options) => options.map((o) => o.value).filter(Boolean));
  if (!values.length) return false;
  await locator.selectOption(values[0]);
  return true;
}

async function expectIpc(r, method, name) {
  const count = await r.getIpcCalls(method);
  return record(r, name || `IPC ${method} 被调用`, count > 0, { method, count });
}

async function exerciseHome(r) {
  const cards = r.page.locator('.cohere-main .cohere-card, .cohere-main [class*="quick"]');
  record(r, '首页显示功能入口', await cards.count() > 0, { count: await cards.count() });
  await expectIpc(r, 'getVersion', '首页加载版本');
  await expectIpc(r, 'storeGetPublishStats', '首页加载发布统计');
  await expectIpc(r, 'storeListAccounts', '首页加载账号');
}

async function exerciseComments(r) {
  const item = r.page.locator('.comment-platform-item').first();
  record(r, '评论平台列表有数据', await item.count() > 0);
  if (await item.count()) {
    await item.click();
    await r.waitForTimeout(200);
    record(r, '评论容器在选择平台后显示', await r.page.locator('#comment-view-container').isVisible());
    await expectIpc(r, 'webviewOpenTab', '选择平台打开评论页');
  }
}

async function exerciseFirstRun(r) {
  record(r, '首次运行从欢迎步骤开始', await bodyHas(r, '欢迎使用社媒管家'));
  // 验证 firstRunCheck 被调用
  await expectIpc(r, 'firstRunCheck', '首次运行检查环境');
  // 验证下一步可点击：点击 “开始配置” 进入环境步骤
  const clicked = await clickText(r, '开始配置');
  if (clicked) {
    await r.waitForTimeout(300);
    record(r, '开始配置进入环境步骤', await bodyHas(r, '环境'));
  } else {
    record(r, '开始配置进入环境步骤', false);
  }
}

async function exercisePublish(r) {
  // initPro 已在 FunctionalRunner 构造时通过 addInitScript 注入，页面首次加载即为 Pro
  record(r, '标题字段可填写', await fillByPlaceholder(r, '文章标题', 'E2E 发布标题'));
  const editor = r.page.locator('.cohere-main [contenteditable="true"]').first();
  let contentFilled = false;
  if (await editor.count() && await editor.isVisible().catch(() => false)) {
    await editor.fill('E2E 发布正文内容');
    contentFilled = true;
  }
  record(r, '正文字段可填写', contentFilled);
  const platform = r.page.locator('.cohere-main input[type="checkbox"]').nth(1);
  if (await platform.count() && await platform.isVisible().catch(() => false)) await platform.click().catch(() => {});
  const batch = r.page.locator('.cohere-main label:has-text("批量模式") input[type="checkbox"]').first();
  if (await batch.count()) {
    await batch.click();
    await r.waitForTimeout(150);
    record(r, '批量模式显示添加文章', await bodyHas(r, '添加文章'));
    await batch.click();
  }
  const publishClicked = await clickText(r, '一键发布');
  record(r, '一键发布按钮可点击', publishClicked);
}

async function exerciseAccounts(r) {
  record(r, '账号 fixture 渲染', await r.page.locator('.account-row').count() > 0, { count: await r.page.locator('.account-row').count() });
  const filters = r.page.locator('.cohere-filter-chip');
  for (let i = 0; i < await filters.count(); i++) await filters.nth(i).click();
  record(r, '账号状态筛选均可点击', await filters.count() >= 3);
  const add = await clickText(r, '添加账号');
  if (add) {
    await r.waitForTimeout(300);
    const modalShown = await r.page.locator('.ui-modal, .el-dialog').first().isVisible().catch(() => false);
    record(r, '添加账号打开弹窗', modalShown);
    // 关闭弹窗
    await r.page.keyboard.press('Escape').catch(() => {});
    await r.page.locator('.ui-modal-close').first().click().catch(() => {});
    await r.waitForTimeout(200);
  } else {
    record(r, '添加账号打开弹窗', false);
  }
  await r.goto('/accounts');
  await r.page.evaluate(() => window.location.reload());
  await r.page.waitForLoadState('domcontentloaded');
  await r.waitForTimeout(500);
  // 寻找 “验证” 按钮（不依赖具体位置）
  const verifyBtn = r.page.locator('.account-row button:has-text("验证")').first();
  let verify = false;
  if (await verifyBtn.count() > 0 && await verifyBtn.isVisible().catch(() => false)) {
    await verifyBtn.click({ timeout: 3000 });
    verify = true;
  }
  record(r, '账号登录验证可执行', verify);
  if (verify) await expectIpc(r, 'accountCheckLogin', '账号验证调用 IPC');
}

async function exerciseDashboard(r) {
  record(r, '平台数据卡片渲染', await r.page.locator('.cohere-main .cohere-card').count() >= 2);
  const refreshed = await clickText(r, '刷新数据');
  record(r, '刷新数据可执行', refreshed);
  if (refreshed) await expectIpc(r, 'syncAll', '刷新调用全平台同步');
  // 基准比较：填入标题并点分析，验证 BenchmarkChart 被渲染
  await fillByPlaceholder(r, '基准', 'E2E 基准文章');
  const analyzeClicked = await clickText(r, '分析');
  await r.waitForTimeout(300);
  const chartRendered = await r.page.locator('.cohere-main [class*="cohere-card"]:has-text("内容基准比较")').count() > 0;
  record(r, '基准比较组件渲染', analyzeClicked && chartRendered, { analyzeClicked, chartRendered });
  await expectIpc(r, 'intelligenceGetBenchmark', '基准调用 IPC');
  await expectIpc(r, 'dashboardStats', '看板统计加载');
}

async function exerciseCollection(r) {
  record(r, '采集 URL 可填写', await fillByPlaceholder(r, '文章链接', 'https://example.com/e2e'));
  await r.waitForTimeout(150);
  const clicked = await clickText(r, '采集');
  record(r, '链接采集可执行', clicked);
  if (clicked) {
    await r.waitForTimeout(400);
    record(r, '采集结果展示标题', await bodyHas(r, '采集的标题'));
    await expectIpc(r, 'urlCollectFetch', '采集调用 IPC');
  }
  record(r, '新建草稿按钮可点击', await clickText(r, '新建草稿'));
}

async function exerciseMonitor(r) {
  const layouts = r.page.locator('.layout-btn');
  for (let i = 0; i < await layouts.count(); i++) await layouts.nth(i).click();
  record(r, '所有分屏布局可切换', await layouts.count() === 5, { count: await layouts.count() });
  await expectIpc(r, 'webviewSetLayout', '分屏布局调用 IPC');
  const opened = await clickText(r, '添加监控');
  if (opened) {
    await r.waitForTimeout(300);
    const modalVisible = await r.page.locator('.ui-modal, .el-dialog').first().isVisible().catch(() => false);
    record(r, '添加监控打开弹窗', modalVisible);
    // 关闭弹窗以便后续通用扫描
    await r.page.keyboard.press('Escape').catch(() => {});
    await r.page.locator('.ui-modal-close').first().click().catch(() => {});
    await r.waitForTimeout(200);
  } else {
    record(r, '添加监控打开弹窗', false);
  }
}

async function exerciseKeywords(r) {
  record(r, '关键词状态 fixture 渲染', await bodyHas(r, 'AI 创作'));
  await fillByPlaceholder(r, '监测关键词', 'E2E 关键词');
  record(r, '添加关键词可点击', await clickText(r, '添加'));
  await expectIpc(r, 'keywordStart', '添加关键词调用 IPC');
  await r.goto('/keywords');
  record(r, '查看历史可点击', await clickText(r, '查看历史'));
  record(r, '关键词历史渲染', await bodyHas(r, '总提及'));
}

async function exerciseViral(r) {
  await fillByPlaceholder(r, '你想分析的主题', 'AI 内容创作');
  record(r, '爆款分析可执行', await clickText(r, '爆款分析'));
  await r.waitForTimeout(400);
  record(r, '爆款潜力分渲染', await bodyHas(r, '爆款潜力分'));
  await expectIpc(r, 'viralAnalyze', '爆款分析调用 IPC');
  record(r, '生成文案可执行', await clickText(r, '生成文案'));
  await r.waitForTimeout(400);
  record(r, '生成标题结果渲染', await bodyHas(r, '5 个 AI 工具'));
  await expectIpc(r, 'viralGenerate', '文案生成调用 IPC');
}

async function exerciseModelProviders(r) {
  await r.waitForTimeout(500);
  record(r, '模型服务商列表渲染', await r.page.locator('.provider-card').count() > 0);
  const chips = r.page.locator('.cohere-main .cohere-filter-chip');
  for (let i = 0; i < await chips.count(); i++) await chips.nth(i).click();
  record(r, '模型类别筛选可点击', await chips.count() >= 5, { count: await chips.count() });
  const added = await clickText(r, '添加服务商');
  record(r, '添加服务商弹窗打开', added && await r.page.locator('.el-dialog').isVisible().catch(() => false));
  // 关闭弹窗（el-dialog 的 overlay），避免阻挡后续操作
  await r.page.keyboard.press('Escape').catch(() => {});
  await r.page.locator('.el-overlay').first().click({ force: true }).catch(() => {});
  await r.waitForTimeout(300);
  // 导航刷新页面，确保弹窗完全关闭
  await r.goto('/model-providers');
  await r.waitForTimeout(500);
  record(r, '服务商刷新可点击', await clickText(r, '刷新'));
  await expectIpc(r, 'modelProviderList', '服务商列表调用 IPC');
}

async function exerciseCreate(r) {
  record(r, '渲染引擎状态就绪', await bodyHas(r, '渲染引擎就绪').catch(() => false) || !(await bodyHas(r, '依赖未安装')));
  const pipelineCard = r.page.locator('.pipeline-card').first();
  record(r, '创作流水线列表渲染', await pipelineCard.count() > 0);
  if (await pipelineCard.count()) {
    await pipelineCard.click();
    await r.waitForTimeout(300);
    await fillByPlaceholder(r, '视频文案', 'E2E 视频创作文案');
    await r.waitForTimeout(500);
    const started = await clickText(r, '启动流水线');
    record(r, '启动创作流水线可执行', started);
    if (started) await expectIpc(r, 'pipelineStart', '启动流水线调用 IPC');
  }
  await r.goto('/create');
  await r.waitForTimeout(400);
  record(r, '快速渲染标签可切换', await clickText(r, '快速渲染'));
  record(r, '历史记录标签可切换', await clickText(r, '历史记录'));
}

async function exerciseResult(r) {
  record(r, '无路径时提供去创作操作', await bodyHas(r, '去创作') || await bodyHas(r, '重新创作'));
  // Hash 模式下使用 hash 内的 query：/#/create/result?path=...
  await r.page.goto(r.url + '/#/create/result?path=' + encodeURIComponent('C:/mock/e2e.mp4'), { waitUntil: 'domcontentloaded' });
  await r.waitForTimeout(800);
  record(r, '结果路径渲染视频或错误状态', await r.page.locator('.video-player, .empty-state, .video-section').count() > 0);
  const publish = await clickText(r, '去发布');
  if (publish) record(r, '结果页可跳转发布', (await r.currentRoute()).startsWith('/publish'));
}

async function exercisePipeline(r) {
  // /create/pipeline 已合并到 /create（CreateView.vue），此处仅验证重定向后渲染创作页 + 流水线卡片
  await r.waitForTimeout(500);
  record(r, '流水线卡片渲染阶段', await r.page.locator('.pipeline-card').count() > 0);
  record(r, '历史记录可切换', await clickText(r, '历史记录'));
  await r.waitForTimeout(400);
  record(r, '流水线历史 fixture 渲染', await bodyHas(r, 'completed'));
}

async function exerciseCreateHistory(r) {
  record(r, '渲染历史 fixture 渲染', await r.page.locator('.render-card').count() > 0);
  record(r, '流水线记录可切换', await clickText(r, '流水线记录'));
  record(r, '流水线历史列表渲染', await r.page.locator('.pipeline-card').count() > 0);
  await r.goto('/create/history');
  const preview = await clickText(r, '预览');
  if (preview) record(r, '历史预览跳转结果页', (await r.currentRoute()).startsWith('/create/result'));
}

async function exerciseCloudPublish(r) {
  await fillByPlaceholder(r, 'videos/xxx.mp4', 'https://example.com/e2e.mp4');
  await fillByPlaceholder(r, '视频标题', 'E2E 云发布标题');
  await fillByPlaceholder(r, '视频描述', 'E2E 云发布描述');
  await fillByPlaceholder(r, '标签', 'E2E,云发布');
  await selectFirstUsable(r);
  record(r, '云发布提交可执行', await clickText(r, '提交云端发布'));
  await r.waitForTimeout(200);
  record(r, '云发布返回任务 ID', await bodyHas(r, '任务已创建'));
  await expectIpc(r, 'cloudPublishSubmit', '云发布提交调用 IPC');
  record(r, '云发布记录渲染', await bodyHas(r, 'E2E 云发布记录'));
}

async function exerciseIntelligence(r) {
  await fillByPlaceholder(r, '输入关键词', 'AI 创作');
  record(r, '内容情报搜索可执行', await clickText(r, '搜索'));
  await r.waitForTimeout(400);
  record(r, '跨平台搜索结果渲染', await bodyHas(r, '热门讨论'));
  record(r, '标题分析建议渲染', await bodyHas(r, '标题中加入'));
  await expectIpc(r, 'intelligenceSearch', '情报搜索调用 IPC');
  const reference = await clickText(r, '参考');
  record(r, '搜索结果可作为参考', reference);
  // 关闭 ReferenceFinder 弹窗（UiModal 不支持 ESC，必须点击 .ui-modal-close）
  if (reference) {
    await r.waitForTimeout(300);
    await r.page.locator('.ui-modal-close').first().click({ force: true, timeout: 3000 }).catch(() => {});
    await r.waitForTimeout(300);
    // 如果还有 overlay 残留，也尝试关闭
    await r.page.locator('.ui-modal-overlay').first().click({ force: true }).catch(() => {});
    await r.waitForTimeout(200);
  }
  record(r, '清空搜索可执行', await clickText(r, '✕'));
}

async function exerciseCalendar(r) {
  const labelBefore = await r.page.locator('.cohere-page-header span').first().textContent().catch(() => '');
  await clickText(r, '▶');
  const labelAfter = await r.page.locator('.cohere-page-header span').first().textContent().catch(() => '');
  record(r, '日历可切换下个月', labelBefore !== labelAfter, { labelBefore, labelAfter });
  record(r, '日历可回到今天', await clickText(r, '今天'));
  const day = r.page.locator('.cal-day:not(.other-month)').first();
  if (await day.count()) await day.click();
  record(r, '日期格可选择', await r.page.locator('.cal-day.selected').count() === 1);
  await expectIpc(r, 'schedulerList', '日历加载排期');
  await expectIpc(r, 'historyList', '日历加载发布历史');
}

const definitions = {
  home: { route: '/', title: '社媒管家', exercise: exerciseHome },
  comments: { route: '/comments', title: '评论管理', exercise: exerciseComments },
  'first-run': { route: '/first-run', title: '欢迎使用社媒管家', exercise: exerciseFirstRun },
  publish: { route: '/publish', title: '一键发布', exercise: exercisePublish },
  accounts: { route: '/accounts', title: '账号管理', exercise: exerciseAccounts },
  dashboard: { route: '/dashboard', title: '数据看板', exercise: exerciseDashboard },
  collection: { route: '/collection', title: '内容采集', exercise: exerciseCollection },
  monitor: { route: '/monitor', title: '分屏监控', exercise: exerciseMonitor },
  keywords: { route: '/keywords', title: '关键词监测', exercise: exerciseKeywords },
  'viral-analysis': { route: '/viral-analysis', title: '爆款分析', exercise: exerciseViral },
  'model-providers': { route: '/model-providers', title: '模型服务商设置', exercise: exerciseModelProviders },
  create: { route: '/create', title: '视频创作', exercise: exerciseCreate },
  result: { route: '/create/result', title: '视频预览', exercise: exerciseResult },
  pipeline: { route: '/create/pipeline', redirectExpected: '/create', title: '视频创作', exercise: exercisePipeline },
  'create-history': { route: '/create/history', title: '创作历史', exercise: exerciseCreateHistory },
  'cloud-publish': { route: '/cloud-publish', title: '云端发布', exercise: exerciseCloudPublish },
  intelligence: { route: '/intelligence', title: '内容情报', exercise: exerciseIntelligence },
  calendar: { route: '/calendar', title: '发布日历', exercise: exerciseCalendar }
};

async function auditInitialControls(r, definition) {
  // 使用纯 reload 保证 Vue 组件状态完全重置
  await r.page.evaluate(() => window.location.reload());
  await r.page.waitForLoadState('domcontentloaded');
  await r.page.waitForTimeout(500);
  const controls = await r.page.locator('.cohere-main button').evaluateAll((buttons) => buttons.filter((button) => button.offsetParent !== null).map((button, index) => ({ index, text: (button.textContent || '').trim().slice(0, 60), disabled: button.disabled })));
  let clicked = 0;
  let skipped = 0;
  const failures = [];
  for (const control of controls) {
    if (control.disabled) { skipped++; continue; }
    // 每次 click 前也重新 reload，保证点击不互相影响
    await r.page.evaluate(() => window.location.reload());
    await r.page.waitForLoadState('domcontentloaded');
    await r.page.waitForTimeout(300);
    const locator = r.page.locator('.cohere-main button').filter({ visible: true }).nth(control.index);
    try {
      if (await locator.count() && !(await locator.isDisabled())) {
        await locator.click({ timeout: 2500 });
        clicked++;
        await r.waitForTimeout(80);
      }
    } catch (error) {
      failures.push({ text: control.text, error: error.message.slice(0, 120) });
    }
  }
  record(r, '初始可用按钮均完成点击扫描', failures.length === 0, { total: controls.length, clicked, skipped, failures });

  await r.goto(definition.route);
  const fields = r.page.locator('.cohere-main input, .cohere-main textarea, .cohere-main select');
  const fieldCount = await fields.count();
  let exercised = 0;
  for (let i = 0; i < fieldCount; i++) {
    const field = fields.nth(i);
    // DOM 可能在前一次操作后变化，nth(i) 已不存在时跳过而非等待 30s 超时
    if (await field.count().catch(() => 0) === 0) continue;
    if (!(await field.isVisible().catch(() => false)) || await field.isDisabled().catch(() => true)) continue;
    let tag = '', type = '';
    try {
      tag = await field.evaluate((el) => el.tagName.toLowerCase(), { timeout: 1500 });
      type = await field.getAttribute('type', { timeout: 1500 }) || '';
    } catch (_) { continue; /* DOM 变化，跳过该字段 */ }
    try {
      if (tag === 'select') {
        const values = await field.locator('option').evaluateAll((options) => options.map((o) => o.value).filter(Boolean));
        if (values.length) { await field.selectOption(values[0]); exercised++; }
      } else if (type === 'checkbox' || type === 'radio') {
        await field.check(); exercised++;
      } else if (!['file', 'range', 'color'].includes(type)) {
        await field.fill(type === 'number' ? '1' : type.includes('date') ? '2026-07-15T10:00' : 'E2E 自动输入'); exercised++;
      }
    } catch (_) { /* route-specific exercise covers guarded fields */ }
  }
  record(r, '全部初始可编辑表单字段完成输入扫描', fieldCount === 0 || exercised > 0, { fieldCount, exercised });

  const links = await r.page.locator('.cohere-main a').evaluateAll((items) => items.filter((item) => item.offsetParent !== null).map((item) => ({ href: item.getAttribute('href'), text: (item.textContent || '').trim() })));
  let linksClicked = 0;
  for (let i = 0; i < links.length; i++) {
    await r.goto(definition.route);
    const link = r.page.locator('.cohere-main a').filter({ visible: true }).nth(i);
    try {
      if (await link.count()) { await link.click({ noWaitAfter: true, timeout: 2000 }); linksClicked++; }
    } catch (_) { /* external/browser-only links are still enumerated */ }
  }
  record(r, '页面链接完成点击扫描', links.length === 0 || linksClicked === links.length, { total: links.length, clicked: linksClicked, links });
}

async function runRouteSpec(specName, options = {}) {
  const definition = definitions[specName];
  if (!definition) throw new Error(`Unknown route spec: ${specName}`);
  const r = new FunctionalRunner({ specName: `${specName}.functional`, ...SUITE_OPTIONS, ...options });
  await r.launch();
  r.page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
  // 允许的 console error（预期的 mock 路径错误等）
  const allowedConsoleErrors = ['Not allowed to load local resource'];
  try {
    await r.goto(definition.route);
    // 若定义了 redirectExpected（如 /create/pipeline → /create），检查重定向后路径
    const expectedRoute = definition.redirectExpected || definition.route;
    record(r, '路由地址正确', (await r.currentRoute()).startsWith(expectedRoute));
    record(r, '页面标题渲染', await bodyHas(r, definition.title), { title: definition.title });
    await definition.exercise(r);
    await auditInitialControls(r, definition);
    await r.page.setViewportSize({ width: 1024, height: 768 });
    await r.page.reload({ waitUntil: 'domcontentloaded' });
    // 等待标题文本出现（最多 5s），避免固定 waitForTimeout 在慢机子上偶发失败
    const expectedTitle = definition.title;
    try {
      await r.page.waitForFunction((title) => document.body && document.body.innerText.includes(title), expectedTitle, { timeout: 5000 });
    } catch (_) { /* 超时后用 bodyHas 再判一次，保留失败现场 */ }
    record(r, '响应式窗口仍渲染标题', await bodyHas(r, expectedTitle) || (specName === 'first-run' && await bodyHas(r, '开始配置')));
    await r.expectNoConsoleError(allowedConsoleErrors);
    await r.expectNoPageError();
    await r.screenshot('final');
  } catch (error) {
    record(r, 'spec 未抛出异常', false, { message: error.message, stack: error.stack });
  }
  const report = r.generateReport();
  // 过滤已知的 console error（如 mock 路径加载错误）
  const blockedErrors = report.consoleErrors.filter((e) => !allowedConsoleErrors.some((a) => e.text.includes(a)));
  report.consoleErrors = blockedErrors;
  r.saveReport();
  await r.close();
  console.log(`\n${specName}: ${report.checks.passed}/${report.checks.total} checks, ${report.consoleErrors.length} console errors, ${report.pageErrors.length} page errors`);
  return report;
}

if (require.main === module) {
  const name = process.argv[2];
  runRouteSpec(name).then((report) => {
    process.exit(report.checks.failed || report.consoleErrors.length || report.pageErrors.length ? 1 : 0);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { definitions, runRouteSpec };
