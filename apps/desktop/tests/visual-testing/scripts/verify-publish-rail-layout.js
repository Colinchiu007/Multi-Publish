// 真实浏览器 DOM 布局验证（openspec optimize-publish-right-rail）：
// 在 dev server 渲染的发布页上断言右栏信息架构与面板贴邻字段——比 jsdom 单测更接近真实。
// 复用 e2e fixture 的 electronAPI mock（buildInitScript），hash 路由导航。
// 用法：node tests/visual-testing/scripts/verify-publish-rail-layout.js
const { chromium } = require('playwright');
const { buildInitScript } = require('../../e2e/helpers/fixture-loader');

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:5174';

async function main () {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1140 },
    locale: 'zh-CN',
    reducedMotion: 'reduce',
  });
  await context.addInitScript({ content: buildInitScript() });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/#/publish`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('.target-selector [data-testid^="platform-"]', { timeout: 15000 });

  const results = await page.evaluate(() => {
    const out = [];
    const check = (name, ok, detail = '') => out.push({ name, ok, detail });
    const side = document.querySelector('.flex-side');
    const main = document.querySelector('.flex-main');
    check('flex-side 存在', !!side);
    check('flex-main 存在', !!main);
    if (side) {
      const first = side.firstElementChild;
      check('右栏第一块是发布操作卡', first?.getAttribute('data-testid') === 'publish-action-card',
        first?.getAttribute('data-testid') || '(none)');
      check('右栏无最佳发布时间面板', !side.textContent.includes('最佳发布时间'));
      check('右栏无智能标签建议面板', !side.textContent.includes('智能标签建议'));
    }
    if (main) {
      check('标题输入存在', !!main.querySelector('[data-testid="publish-title"]'));
      check('定时发布输入存在', !!main.querySelector('input[type="datetime-local"]'));
    }
    return out;
  });

  // 填入标题触发面板渲染，再断言贴邻关系
  const titleInput = page.locator('[data-testid="publish-title"] input');
  if (await titleInput.count() > 0) {
    await titleInput.fill('这是一段足够长的真实浏览器测试标题');
  } else {
    await page.fill('[data-testid="publish-title"]', '这是一段足够长的真实浏览器测试标题');
  }
  await page.waitForTimeout(800);

  const filled = await page.evaluate(() => {
    const out = [];
    const check = (name, ok, detail = '') => out.push({ name, ok, detail });
    const follows = (a, b) => {
      if (!a || !b) return false;
      return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    };
    const main = document.querySelector('.flex-main');
    const side = document.querySelector('.flex-side');

    // 面板出现在左栏而非右栏
    const tagInMain = !!(main && main.textContent.includes('智能标签建议'));
    const ottInMain = !!(main && main.textContent.includes('最佳发布时间'));
    check('标签建议面板出现在左栏', tagInMain);
    check('最佳发布时间面板出现在左栏', ottInMain);
    check('右栏仍无智能面板', !(side && (side.textContent.includes('最佳发布时间') || side.textContent.includes('智能标签建议'))));

    // 贴邻顺序（DOM 文档序）。注意：外层表单大卡包含全部内容，textContent 也会命中
    // 面板关键词，必须取「最内层」匹配卡（不包含其他匹配卡的那张），否则祖先元素
    // 的 compareDocumentPosition 返回 CONTAINS 而非 FOLLOWING，断言必然假红。
    const innermostCard = (keyword) => {
      const cards = Array.from(main.querySelectorAll('.cohere-card'))
        .filter(c => c.textContent.includes(keyword));
      return cards.find(c => !cards.some(other => other !== c && c.contains(other))) || null;
    };
    const tagsGrid = document.querySelector('.publish-metadata-grid');
    const tagCard = innermostCard('智能标签建议');
    check('标签建议在标签/话题输入之后', follows(tagsGrid, tagCard));
    const schedule = document.querySelector('input[type="datetime-local"]');
    const ottCard = innermostCard('最佳发布时间');
    check('最佳发布时间在定时发布之后', follows(schedule, ottCard));
    const titleEl = document.querySelector('[data-testid="publish-title"]');
    const titleToggle = document.querySelector('[data-testid="title-assistant-toggle"]');
    check('标题助手入口在标题输入之后', follows(titleEl, titleToggle));
    return out;
  });

  const all = [...results, ...filled];
  let failed = 0;
  for (const r of all) {
    if (!r.ok) failed++;
    console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (!r.ok && r.detail ? '  [' + r.detail + ']' : ''));
  }
  console.log('真实浏览器布局断言: ' + (all.length - failed) + '/' + all.length + ' 通过');
  await browser.close();
  if (failed > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error('验证脚本失败: ' + err.message);
  process.exitCode = 1;
});
