const fs = require('fs');
const path = require('path');
const vm = require('vm');

const VISUAL_ROOT = __dirname;
const TARGET_FILES = [
  'autonomous-loop.js',
  'autonomous-fix-loop.js',
  'autonomous-enforce-loop.js',
  'functional-test.js',
  'views/supplementary-views.visual.test.js',
  'workflows/supplementary-workflows.visual.test.js',
];

function readTarget(relativePath) {
  return fs.readFileSync(path.join(VISUAL_ROOT, relativePath), 'utf8');
}

describe('视觉测试条件等待合同', () => {
  it.each(TARGET_FILES)('%s 不包含固定等待或毫秒等待配置', (relativePath) => {
    const source = readTarget(relativePath);

    expect(source).not.toMatch(/\bwaitForTimeout\s*\(/);
    expect(source).not.toMatch(/\bwaitMs\b/);
  });

  it.each(TARGET_FILES)('%s 保持语法有效且不使用空 catch 吞错', (relativePath) => {
    const source = readTarget(relativePath);

    expect(() => new vm.Script(source, { filename: relativePath })).not.toThrow();
    expect(source).not.toMatch(/catch\s*\(\s*_\s*\)\s*\{\s*\}/);
  });

  it('补充工作流用可观察状态约束每次页面进入和交互', async () => {
    const { supplementaryWorkflowTests } = require('./workflows/supplementary-workflows.visual.test');

    for (const workflow of supplementaryWorkflowTests) {
      expect(workflow.steps[0], `${workflow.name} 缺少首屏就绪等待`).toMatchObject({
        action: 'waitFor',
      });
      expect(workflow.steps[0].selector, `${workflow.name} 的首屏等待缺少选择器`).toBeTruthy();

      for (const step of workflow.steps) {
        if (step.action === 'click' || step.action === 'fill') {
          expect(step.waitFor, `${workflow.name}/${step.name || step.selector} 缺少交互后状态`).toBeTruthy();
        }
      }
    }
  });

  it('补充工作流等待失败和未知动作会向上抛出', async () => {
    const { executeStep } = require('./workflows/supplementary-workflows.visual.test');
    const waitError = new Error('页面状态未出现');
    const page = {
      waitForSelector: async () => { throw waitError; },
    };

    await expect(executeStep(page, { action: 'waitFor', selector: '.ready' }))
      .rejects.toBe(waitError);
    await expect(executeStep(page, { action: 'unknown' }))
      .rejects.toThrow('未知工作流动作');
  });

  it('补充视图的就绪条件、机器断言和交互终态都明确可执行', () => {
    const { supplementaryViewTests } = require('./views/supplementary-views.visual.test');

    for (const view of supplementaryViewTests) {
      expect(view.waitFor, `${view.name} 缺少首屏就绪条件`).toBeTruthy();
      expect(view.checks.length, `${view.name} 缺少机器断言`).toBeGreaterThan(0);
      for (const item of view.checks) {
        expect(item.selector, `${view.name}/${item.name} 缺少选择器`).toBeTruthy();
      }
      if (view.trigger) {
        expect(view.afterTrigger, `${view.name} 缺少交互终态`).toBeTruthy();
      }
    }
  });

  it('路由导航依次等待挂载路由和页面专属元素', async () => {
    const { navigateToReady } = require('./functional-test');
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
    };

    await navigateToReady(page, '/accounts');

    expect(page.goto).toHaveBeenCalledOnce();
    expect(page.waitForFunction).toHaveBeenCalledOnce();
    expect(page.waitForSelector).toHaveBeenCalledWith(
      '.cohere-main .page-title:has-text("账号管理")',
      { state: 'visible', timeout: 10000 },
    );
  });

  it('路由页面条件超时不会被降级为成功', async () => {
    const { navigateToReady } = require('./functional-test');
    const readyError = new Error('账号页面未出现');
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockRejectedValue(readyError),
    };

    await expect(navigateToReady(page, '/accounts')).rejects.toBe(readyError);
  });

  it('同一路由的不同工作流使用独立文档 URL，避免组件状态串用', () => {
    const { workflowUrl } = require('./workflows/supplementary-workflows.visual.test');

    const firstUrl = workflowUrl('http://127.0.0.1:5174', '/create', 'first');
    const secondUrl = workflowUrl('http://127.0.0.1:5174', '/create', 'second');

    expect(firstUrl).not.toBe(secondUrl);
    expect(firstUrl).toContain('visual-workflow=first');
    expect(firstUrl).toContain('#/create');
  });

  it('浏览器原生文本变化轮询只使用标准 CSS 选择器', () => {
    const { supplementaryWorkflowTests } = require('./workflows/supplementary-workflows.visual.test');
    const textChangeConditions = supplementaryWorkflowTests
      .flatMap(workflow => workflow.steps)
      .map(step => step.waitFor || step)
      .filter(condition => condition.textChanged);

    expect(textChangeConditions.length).toBeGreaterThan(0);
    for (const condition of textChangeConditions) {
      expect(condition.selector).not.toContain(':has-text');
    }
  });

  it('模型分类工作流先切换到全部视图并等待筛选条出现', () => {
    const { supplementaryWorkflowTests } = require('./workflows/supplementary-workflows.visual.test');
    const workflow = supplementaryWorkflowTests.find(item => (
      item.name === 'model-provider-category-filter'
    ));

    expect(workflow.steps[1]).toMatchObject({
      action: 'click',
      selector: '.view-mode-tab:has-text("全部")',
      waitFor: { selector: '.cohere-filter-bar .filter-chip' },
    });
  });
});
