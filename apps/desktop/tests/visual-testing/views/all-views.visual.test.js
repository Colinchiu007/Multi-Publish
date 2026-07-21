/**
 * 真实路由单视图视觉门禁。
 * 运行: node tests/visual-testing/views/all-views.visual.test.js
 */

const { VisualTestRunner } = require('../test-runner');

function routeView(name, route, waitFor, checkName = '页面主标题', expectedRoute = route, checks) {
  return {
    name,
    route,
    expectedRoute,
    waitFor,
    checks: checks || [{ name: checkName, selector: waitFor }],
  };
}

const viewTests = [
  routeView('home-default', '/', '.cohere-main .page-title:has-text("社媒管家")'),
  routeView('comments-list', '/comments', '.cohere-main .page-title:has-text("评论管理")'),
  routeView('first-run', '/first-run', '.cohere-main h2:has-text("欢迎使用社媒管家")'),
  routeView(
    'publish-form',
    '/publish',
    '.cohere-main .target-selector [data-testid^="platform-"]',
    '发布目标平台已加载',
    '/publish',
    [
      { name: '页面主标题', selector: '.cohere-main .page-title:has-text("一键发布")' },
      { name: '发布目标平台已加载', selector: '.cohere-main .target-selector [data-testid^="platform-"]' },
    ],
  ),
  routeView('accounts-list', '/accounts', '.cohere-main .page-title:has-text("账号管理")'),
  routeView('dashboard', '/dashboard', '.cohere-main .page-title:has-text("数据看板")'),
  routeView('collection', '/collection', '.cohere-main .page-title:has-text("内容采集")'),
  routeView('monitor-dashboard', '/monitor', '.cohere-main .page-title:has-text("分屏监控")'),
  routeView('keyword-monitor', '/keywords', '.cohere-main .page-title:has-text("关键词监测")'),
  routeView('viral-analysis', '/viral-analysis', '.cohere-main .page-title:has-text("爆款分析")'),
  routeView('providers-redirect', '/providers', '.cohere-main .page-title:has-text("模型服务商设置")', '页面主标题', '/model-providers'),
  routeView('model-providers', '/model-providers', '.cohere-main .page-title:has-text("模型服务商设置")'),
  routeView('create-editor', '/create', '.cohere-main h1:has-text("视频创作")'),
  routeView('create-pipeline-redirect', '/create/pipeline', '.cohere-main h1:has-text("视频创作")', '页面主标题', '/create'),
  routeView('create-result', '/create/result', '.cohere-main h1:has-text("视频预览")'),
  routeView('create-history', '/create/history', '.cohere-main h1:has-text("创作历史")'),
  routeView('cloud-publish', '/cloud-publish', '.cohere-main .page-title:has-text("云端发布")'),
  routeView('intelligence', '/intelligence', '.cohere-main .page-title:has-text("内容情报")'),
  routeView('calendar', '/calendar', '.cohere-main .page-title:has-text("发布日历")'),
  routeView('project-library', '/library', '.cohere-main h1:has-text("项目库")'),
  routeView('production-board', '/board/e2e-project', '.cohere-main .board-page .back-link:has-text("项目库")', '生产看板'),
  routeView('contact-sheet', '/board/e2e-project/contact-sheet', '.cohere-main .cs-title:has-text("场景审批")'),
  routeView('replay-timeline', '/replay/e2e-project', '.cohere-main .replay-title:has-text("生产回放")'),
];

function createRunner(options = {}) {
  return new VisualTestRunner({
    url: options.url || process.env.TEST_URL || 'http://127.0.0.1:5174',
    headless: options.headless ?? (process.env.HEADLESS !== 'false'),
  });
}

async function runViewSuite(tests = viewTests, options = {}) {
  const runner = options.runner || createRunner(options);
  const failures = [];
  let fatalError = null;

  try {
    await runner.launch();
    for (const test of tests) {
      console.log('视觉测试: ' + test.name);
      try {
        await runner.aiVisionTest(test.name, test.route, test.checks, {
          expectedRoute: test.expectedRoute,
          waitFor: test.waitFor,
        });
      } catch (error) {
        failures.push({ test: test.name, route: test.route, error });
        const alreadyRecorded = runner.results.some(result => (
          result.test === test.name
          && (result.status === 'FAILED' || result.status === 'ERROR')
        ));
        if (!alreadyRecorded) {
          runner.results.push({
            test: test.name,
            route: test.route,
            status: 'ERROR',
            error: error.message,
          });
        }
      }
    }
  } catch (error) {
    fatalError = error;
  } finally {
    try {
      await runner.close();
    } catch (error) {
      fatalError ||= error;
    }
  }

  if (fatalError) throw fatalError;
  if (failures.length > 0) {
    const error = new Error(
      '单视图视觉门禁失败: '
      + failures.map(failure => failure.test + ': ' + failure.error.message).join(' | '),
    );
    error.code = 'ERR_VISUAL_SUITE_FAILED';
    error.failures = failures;
    throw error;
  }

  return {
    total: tests.length,
    passed: tests.length,
    results: runner.results,
  };
}

async function runAllViewTests(options = {}) {
  return runViewSuite(viewTests, options);
}

async function runSingleView(viewName, options = {}) {
  const test = viewTests.find(view => view.name === viewName);
  if (!test) {
    const error = new Error('未找到视图: ' + viewName);
    error.code = 'ERR_VISUAL_VIEW_NOT_FOUND';
    throw error;
  }
  return runViewSuite([test], options);
}

async function main(args = process.argv.slice(2)) {
  if (args[0] === '--list') {
    viewTests.forEach(view => console.log(view.name));
    return;
  }
  if (args[0] === '--single') {
    if (!args[1]) throw new Error('--single 缺少视图名称');
    await runSingleView(args[1]);
    return;
  }
  await runAllViewTests();
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  viewTests,
  runViewSuite,
  runAllViewTests,
  runSingleView,
  main,
};
