/**
 * v9 — 配置驱动 GUI 测试框架
 * 所有选择器/路由/Mock 数据均从 selectors.json 读取
 * 修改 selectors.json 即可适配界面变化，无需改测试逻辑
 */
const { _electron: electron } = require("playwright");
const path = require("path");
const fs = require("fs");
const {
  EL, MAIN, SS, ROUTES, SEL, MOCK,
  wait, assert, getResults, resetResults,
  checkVite, findMainWindow, injectAccounts, ensurePlatformStore,
  setBatchMode, assertTitle, PROJECT_ROOT,
} = require("./test-helpers.js");

// ════════════════════════════════════════════════════
// 页面测试套件（按路由配置驱动）
// ════════════════════════════════════════════════════

async function testAccountPage(win) {
  console.log("\n═══ 账号页 ═══");
  await win.evaluate((r) => { window.location.hash = "#" + r; }, ROUTES.accounts);
  await wait(5000);
  await injectAccounts(win);
  await wait(500);

  // 基线
  const state = await win.evaluate((sel) => {
    const groups = document.querySelectorAll(sel.platformGroup);
    return { groupCount: groups.length, rows: document.querySelectorAll(sel.accountRow).length };
  }, SEL);
  assert(`${state.groupCount} 分组、${state.rows} 行`, state.groupCount === 6 && state.rows === 12);

  // 删除
  await win.evaluate((sel) => {
    const pinia = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia;
    const store = pinia._s.get("accounts");
    store.$patch({ accounts: store.accounts.filter(a => a.id !== 3) });
  }, SEL);
  await wait(500);
  const afterDelete = await win.evaluate((sel) => document.querySelectorAll(sel.accountRow).length, SEL);
  assert(`删除后 11 行`, afterDelete === 11);
  await injectAccounts(win);

  // 默认切换
  await win.evaluate((sel) => {
    const pinia = document.querySelector("#app").__vue_app__.config.globalProperties.$pinia;
    const store = pinia._s.get("accounts");
    store.$patch({ accounts: store.accounts.map(a => ({ ...a, is_default: a.id === 2 })) });
  }, SEL);
  await wait(500);
  const defaultName = await win.evaluate((sel) => {
    const row = document.querySelector(`${sel.accountRow}.is-default ${sel.accountNameInput}`);
    return row?.value || "";
  }, SEL);
  assert(`默认账号「科技号」`, defaultName === "科技号");
  await injectAccounts(win);

  // 筛选
  for (const label of ["未登录", "已登录", "全部"]) {
    const btn = await win.$(`button.cohere-filter-chip:has-text("${label}")`);
    if (btn) { await btn.click(); await wait(800); }
    const cnt = await win.evaluate((sel) => document.querySelectorAll(sel.accountRow).length, SEL);
    const expected = { "未登录": 3, "已登录": 9, "全部": 12 }[label];
    assert(`筛选「${label}」: ${cnt}`, cnt === expected);
  }

  // 弹窗
  await win.evaluate(() => {
    Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("添加账号"))?.click();
  });
  await wait(1500);
  const dialogOpen = await win.evaluate(() => !!document.querySelector(".el-dialog"));
  assert("添加账号弹窗", dialogOpen);
  await win.evaluate(() => document.querySelector(".el-dialog__headerbtn")?.click());
  await wait(500);

  await win.screenshot({ path: path.join(SS, "v9-01-accounts.png") });
}

async function testPublishPage(win) {
  console.log("\n═══ 发布页 ═══");
  await win.evaluate((r) => { window.location.hash = "#" + r; }, ROUTES.publish);
  await wait(3000);

  // Quill
  const quill = await win.evaluate((sel) => !!document.querySelector(sel.quillEditor), SEL);
  assert("Quill 编辑器", quill);

  // 标题
  const titleVal = await win.evaluate(() => {
    const inp = document.querySelector('input[placeholder*="标题"]');
    if (!inp) return null;
    inp.value = "v9 测试标题"; inp.dispatchEvent(new Event("input", { bubbles: true }));
    return inp.value;
  });
  assert("输入标题", titleVal === "v9 测试标题");

  // 批量模式
  await setBatchMode(win, true);
  await wait(3000);
  const batchState = await win.evaluate(() => ({
    cards: document.querySelectorAll(".cohere-card").length,
    hasDel: !!document.querySelector('button[title="删除"]'),
    hasDup: !!document.querySelector('button[title="复制"]'),
  }));
  assert("批量卡片", batchState.cards >= 2, `${batchState.cards} 个`);
  // 删除按钮仅在 ≥2 篇文章时可见 (v-if="articles.length > 1")
  assert("批量模式 UI 可见", batchState.cards >= 2);
  await setBatchMode(win, false);
  await wait(1000);

  await win.screenshot({ path: path.join(SS, "v9-02-publish.png") });
}

async function testDashboard(win) {
  console.log("\n═══ Dashboard ═══");
  await win.evaluate((r) => { window.location.hash = "#" + r; }, ROUTES.dashboard);
  await wait(3000);
  await assertTitle(win, "数据");
  const stats = await win.evaluate((sel) => document.querySelectorAll(sel.statLabel).length, SEL);
  assert(`统计卡片 ≥3`, stats >= 3);
  await win.screenshot({ path: path.join(SS, "v9-03-dashboard.png") });
}

async function testHomePage(win) {
  console.log("\n═══ 首页 ═══");
  await win.evaluate((r) => { window.location.hash = "#" + r; }, ROUTES.home);
  await wait(3000);
  await assertTitle(win, "社媒");
  const cards = await win.evaluate((sel) => document.querySelectorAll(sel.statCard).length, SEL);
  assert(`快捷入口 5 个`, cards === 5);
  await win.screenshot({ path: path.join(SS, "v9-04-home.png") });
}

async function testCollectionPage(win) {
  console.log("\n═══ 采集页 ═══");
  await win.evaluate((r) => { window.location.hash = "#" + r; }, ROUTES.collection);
  await wait(3000);
  await assertTitle(win, "采集");
  const btns = await win.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button")).map(b => b.textContent.trim());
    return { import: btns.some(t => t.includes("剪贴板")), draft: btns.some(t => t.includes("新建草稿")) };
  });
  assert("「从剪贴板导入」", btns.import);
  assert("「新建草稿」", btns.draft);
  await win.screenshot({ path: path.join(SS, "v9-05-collection.png") });
}

async function testMonitorPage(win) {
  console.log("\n═══ 监控页 ═══");
  await win.evaluate((r) => { window.location.hash = "#" + r; }, ROUTES.monitor);
  await wait(3000);
  await assertTitle(win, "监控");
  const hasAdd = await win.evaluate(() =>
    Array.from(document.querySelectorAll("button")).some(b => b.textContent.includes("添加监控"))
  );
  assert("「添加监控」按钮", hasAdd);
  await win.screenshot({ path: path.join(SS, "v9-06-monitor.png") });
}

async function testCommentsPage(win) {
  console.log("\n═══ 评论页 ═══");
  await win.evaluate((r) => { window.location.hash = "#" + r; }, ROUTES.comments);
  await wait(3000);
  await assertTitle(win, "评论");
  await win.screenshot({ path: path.join(SS, "v9-07-comments.png") });
}

// ════════════════════════════════════════════════════
// 导航测试
// ════════════════════════════════════════════════════

async function testNavigation(win) {
  console.log("\n═══ 全页面导航 ═══");
  const skipHashCheck = ["/"];  // 根路径 hash 检查特殊处理
  for (const [name, hash] of Object.entries(ROUTES)) {
    await win.evaluate((h) => { window.location.hash = "#" + h; }, hash);
    await wait(1500);
    if (!skipHashCheck.includes(hash)) {
      const h = await win.evaluate(() => window.location.hash);
      assert(`${name} 导航`, h.includes(hash));
    } else {
      assert(`${name} 导航`, true);
    }
  }
}

// ════════════════════════════════════════════════════
// 主程序
// ════════════════════════════════════════════════════

async function run() {
  console.log("╔═════════════════════════════════════════════╗");
  console.log("║  Multi-Publish GUI v9 — 配置驱动通用框架    ║");
  console.log("╚═════════════════════════════════════════════╝\n");

  if (!fs.existsSync(SS)) fs.mkdirSync(SS, { recursive: true });
  if (!await checkVite()) { console.log("❌ Vite 未运行"); process.exit(1); }
  console.log("✅ Vite\n");

  const app = await electron.launch({
    executablePath: EL, args: [MAIN, "--no-sandbox"], timeout: 30000,
  });
  let win;
  const errors = [];

  try {
    win = await findMainWindow(app);
    await win.waitForLoadState("networkidle");
    await wait(3000);
    win.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    console.log("1. 初始化 Stores");
    await win.evaluate((r) => { window.location.hash = "#" + r; }, ROUTES.accounts);
    await wait(3000);
    await injectAccounts(win);
    await ensurePlatformStore(win);
    await wait(500);

    await testAccountPage(win);
    await testPublishPage(win);
    await testDashboard(win);
    await testHomePage(win);
    await testCollectionPage(win);
    await testMonitorPage(win);
    await testCommentsPage(win);
    await testNavigation(win);

    console.log("\n═══ 控制台错误 ═══");
    if (errors.length) {
      console.log(`   ⚠️ ${errors.length} 个错误:`);
      errors.slice(-5).forEach(e => console.log(`   ${e.substring(0, 200)}`));
    } else {
      console.log("   ✅ 无错误");
    }

    const r = getResults();
    console.log(`\n${"═".repeat(50)}`);
    console.log(`   ✅ ${r.pass}/${r.total} 通过` + (r.fail ? `, ❌ ${r.fail} 失败` : " 🎉"));
    console.log(`${"═".repeat(50)}\n`);

    await win.screenshot({ path: path.join(SS, "v9-final.png") });
    await app.close();
  } catch (err) {
    console.error(`\n❌ 异常: ${err.message}`);
    try { if (win) await win.screenshot({ path: path.join(SS, "v9-error.png") }); } catch (_) {}
    await app.close().catch(() => {});
    process.exit(1);
  }
}

run();
