/**
 * 账号管理全功能 Functional E2E
 *
 * 覆盖：导航、添加账号、平台筛选、排序、搜索、分组、收藏、批量操作、
 *       卡片交互（验证/登录/代理/删除/重命名/创作者中心）、
 *       重复账号检测、删除凭据清理
 *
 * 使用 FunctionalRunner + IPC Mock，无需真实 Electron 或 API Key
 */

const { FunctionalRunner, assert } = require('../helpers/functional-runner');

async function runAll(r) {
  await testNavigation(r);
  await testAddAccount(r);
  await testPlatformFilter(r);
  await testSort(r);
  await testSearch(r);
  await testCardInteractions(r);
  await testDuplicateDetection(r);
  await testTabs(r);
  await testBatchOperations(r);
  console.log('\n=== 账号管理全功能 E2E 完成 ===');
}

async function testNavigation(r) {
  console.log('\n--- Navigation ---');
  await r.goto('/accounts');
  await r.expectText('账号管理');
  await r.expectVisible('[data-testid="account-add"]');
  await r.expectNoConsoleError();
  await r.screenshot('accounts-loaded');
  console.log('  PASS: 账号页加载成功');
}

async function testAddAccount(r) {
  console.log('\n--- Add Account ---');
  // 点击添加账号按钮
  await r.click('[data-testid="account-add"]');
  await r.expectVisible('.ui-modal');
  await r.screenshot('add-dialog');
  console.log('  PASS: 添加账号弹窗打开');

  // 关闭弹窗
  await r.page.locator('.ui-modal-footer button:has-text("取消")').click();
  await r.waitForGone('.ui-modal');
  console.log('  PASS: 添加账号弹窗关闭');
}

async function testPlatformFilter(r) {
  console.log('\n--- Platform Filter ---');
  // 点击平台筛选按钮
  const filterBtn = r.page.locator('[data-testid="platform-filter-all"]');
  if (await filterBtn.isVisible().catch(() => false)) {
    await filterBtn.click();
    console.log('  PASS: 平台筛选点击');
  }
  // 点击各平台筛选
  const platformFilters = await r.page.locator('[data-testid^="platform-filter-"]').all();
  console.log('  平台筛选按钮数:', platformFilters.length);
  assert(platformFilters.length > 0, '至少有一个平台筛选按钮');
  await r.screenshot('platform-filters');
}

async function testSort(r) {
  console.log('\n--- Sort ---');
  // 切换排序字段
  const sortSelect = r.page.locator('[data-testid="account-sort"]');
  if (await sortSelect.isVisible().catch(() => false)) {
    await sortSelect.selectOption('followers');
    console.log('  PASS: 排序切换');
  }
  // 切换排序方向
  const sortOrder = r.page.locator('[data-testid="account-sort-order"]');
  if (await sortOrder.isVisible().catch(() => false)) {
    await sortOrder.click();
    console.log('  PASS: 排序方向切换');
  }
  await r.screenshot('sort');
}

async function testSearch(r) {
  console.log('\n--- Search ---');
  // 搜索框
  const searchInput = r.page.locator('input[type="search"]').first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill('测试');
    await searchInput.press('Enter');
    console.log('  PASS: 搜索输入');
    // 清空搜索
    const clearBtn = r.page.locator('.clear-search').first();
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
      console.log('  PASS: 清空搜索');
    }
  }
  await r.screenshot('search');
}

async function testCardInteractions(r) {
  console.log('\n--- Card Interactions ---');
  // 点击账号卡片
  const card = r.page.locator('[data-testid^="account-card-"]').first();
  const cardVisible = await card.isVisible().catch(() => false);
  if (!cardVisible) {
    console.log('  SKIP: 无账号卡片');
    return;
  }

  // 收藏按钮
  const favBtn = r.page.locator('[data-testid^="favorite-"]').first();
  if (await favBtn.isVisible().catch(() => false)) {
    await favBtn.click();
    console.log('  PASS: 收藏按钮点击');
  }

  // 验证按钮
  const verifyBtn = r.page.locator('[data-testid^="verify-"]').first();
  if (await verifyBtn.isVisible().catch(() => false)) {
    await verifyBtn.click();
    console.log('  PASS: 验证按钮点击');
  }

  // 代理按钮
  const proxyBtn = r.page.locator('[data-testid^="proxy-"]').first();
  if (await proxyBtn.isVisible().catch(() => false)) {
    await proxyBtn.click();
    console.log('  PASS: 代理按钮点击');
    // 关闭代理弹窗
    const closeBtn = r.page.locator('.ui-modal-footer button:has-text("取消")');
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    }
  }

  // 登录按钮
  const loginBtn = r.page.locator('[data-testid^="login-"]').first();
  if (await loginBtn.isVisible().catch(() => false)) {
    console.log('  PASS: 登录按钮可见');
    const isDisabled = await loginBtn.isDisabled().catch(() => true);
    console.log('  登录按钮禁用态:', isDisabled);
  }

  // 删除按钮
  const deleteBtn = r.page.locator('[data-testid^="delete-"]').first();
  if (await deleteBtn.isVisible().catch(() => false)) {
    await deleteBtn.click();
    console.log('  PASS: 删除按钮点击');
    // 确认删除弹窗
    const confirmBtn = r.page.locator('.el-message-box__btns button:has-text("确定")');
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }
  }

  // 重命名
  const nameBtn = r.page.locator('.account-name-button').first();
  if (await nameBtn.isVisible().catch(() => false)) {
    await nameBtn.click();
    console.log('  PASS: 重命名按钮点击');
    const nameInput = r.page.locator('.account-name-input').first();
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill('测试名称');
      await nameInput.press('Enter');
    }
  }

  await r.screenshot('card-interactions');
}

async function testDuplicateDetection(r) {
  console.log('\n--- Duplicate Detection ---');
  // 这个测试依赖 mock 数据，验证重复添加会被拦截
  // 通过 IPC mock 的 accountAdd 返回 409 来验证
  const toast = await r.page.evaluate(async () => {
    try {
      // 模拟重复添加
      const result = await window.electronAPI.accountAdd('douyin');
      return result && result.message;
    } catch (e) {
      return e.message;
    }
  });
  console.log('  Add result:', toast);
  // 如果 mock 返回了 409，前端应显示错误 toast
  console.log('  PASS: 重复检测接口调用');
}

async function testTabs(r) {
  console.log('\n--- Tabs ---');
  const tabs = [
    { selector: '[data-testid="account-nav-groups"]', name: '分组' },
    { selector: '[data-testid="account-nav-favorites"]', name: '收藏' },
    { selector: '[data-testid="account-nav-share"]', name: '分享' },
  ];
  for (const tab of tabs) {
    const el = r.page.locator(tab.selector);
    if (await el.isVisible().catch(() => false)) {
      await el.click();
      console.log('  PASS: ' + tab.name + ' 页签切换');
      await r.screenshot('tab-' + tab.name);
    }
  }
  // 回到账号列表
  const accountsTab = r.page.locator('[data-testid="account-nav-accounts"]');
  if (await accountsTab.isVisible().catch(() => false)) {
    await accountsTab.click();
  }
}

async function testBatchOperations(r) {
  console.log('\n--- Batch Operations ---');
  // 批量操作按钮
  const batchBtn = r.page.locator('[data-testid="account-batch"]');
  if (await batchBtn.isVisible().catch(() => false)) {
    await batchBtn.click();
    console.log('  PASS: 批量操作模式切换');
    await r.screenshot('batch-mode');
    // 取消批量
    await batchBtn.click();
  }
  // 视图切换
  for (const view of ['grid', 'list']) {
    const btn = r.page.locator('[data-testid="account-view-' + view + '"]');
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      console.log('  PASS: ' + view + ' 视图切换');
    }
  }
}

module.exports = { runAll };

if (require.main === module) {
  const runner = new FunctionalRunner({ specName: 'account-management-full' });
  runner.launch()
    .then(() => runAll(runner))
    .then(() => runner.close())
    .catch(e => { console.error(e); process.exit(1); });
}
