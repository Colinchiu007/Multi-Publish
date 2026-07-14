// stage-executor PUBLISH 阶段单元测试 (P2-10)
// 测试多平台发布的各种场景：占位/验证/单平台/多平台/失败处理
//
// 运行：node --test electron/tests/stage-executor-publish.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

let p = 0, f = 0;
const _testQueue = [];
function t(n, fn) { _testQueue.push({ name: n, fn }); }
function eq(a, b) { assert.deepStrictEqual(a, b); }
function ok(a, m) { assert.ok(a, m); }

async function _runAll() {
  for (const { name, fn } of _testQueue) {
    try {
      await fn();
      p++;
      console.log('  \u2705 ' + name);
    } catch (e) {
      f++;
      console.log('  \u274C ' + name + ': ' + e.message);
    }
  }
}

console.log('=== stage-executor PUBLISH (P2-10) ===');

let StageExecutor, STAGE_TYPES;
try {
  ({ StageExecutor, STAGE_TYPES } = require('../services/stage-executor'));
} catch (e) { console.log('  Skipped: ' + e.message); process.exit(0); }

// ---------- Mock 工具 ----------
function makeMockServiceBus() {
  return {
    splitText: async () => ({ code: 0, data: { sentences: [] } }),
    optimizePrompt: async () => ({ code: 0, data: {} }),
    optimizePromptsBatch: async () => ({ code: 0, data: [] }),
    composeVideo: async () => ({ code: 0, data: { videoPath: '/tmp/out.mp4' } }),
    callPythonSkill: async () => ({ code: 0, data: {} }),
    fetchPipeline: async () => ({ code: 0, data: {} }),
  };
}

function makeMockContainer(services) {
  return { get: (name) => services[name] };
}

function makeMockLogger() {
  const logs = { info: [], warn: [], error: [] };
  return {
    info: (c, m) => logs.info.push(c + ': ' + m),
    warn: (c, m) => logs.warn.push(c + ': ' + m),
    error: (c, m) => logs.error.push(c + ': ' + m),
    _logs: logs,
  };
}

// 创建真实临时文件作为 videoPath
function makeTempVideo() {
  const dir = path.join(os.tmpdir(), 'p2-10-test-' + Date.now());
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'test.mp4');
  fs.writeFileSync(file, Buffer.from('fake-video-content'));
  return file;
}

function cleanupTempVideo(file) {
  try {
    const dir = path.dirname(file);
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir);
      for (const e of entries) {
        fs.unlinkSync(path.join(dir, e));
      }
      fs.rmdirSync(dir);
    }
  } catch (_) { /* ignore */ }
}

// Mock publisherRouter: createPublisher(platform, deps) → { publish(task) }
function makeMockRouter(platformResults) {
  // platformResults: { platform: { success, url?, error?, throw? } }
  return {
    createPublisher: (platform, deps) => ({
      publish: async (task) => {
        const cfg = platformResults[platform] || { success: false, error: 'Unknown platform' };
        if (cfg.throw) throw new Error(cfg.throw);
        return { success: cfg.success, url: cfg.url, postId: cfg.postId, error: cfg.error };
      },
    }),
  };
}

// ============================================================
// 1. 占位分支（router 未配置）
// ============================================================

t('PUBLISH: router 为 null 时返回占位成功 + warn 日志', async function () {
  const log = makeMockLogger();
  const exec = new StageExecutor({
    serviceBus: makeMockServiceBus(),
    container: makeMockContainer({}), // 无 publisherRouter
    log,
  });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
    params: {},
    context: { compose: { videoPath: '/tmp/out.mp4' } },
  });
  eq(result.success, true);
  eq(result.output.placeholder, true);
  eq(result.output.publishedTo.length, 0);
  ok(log._logs.warn.length > 0, '应记录 warn 日志');
});

t('PUBLISH: container 为 null 时返回占位成功', async function () {
  const log = makeMockLogger();
  const exec = new StageExecutor({
    serviceBus: makeMockServiceBus(),
    container: null,
    log,
  });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'publish', type: STAGE_TYPES.PUBLISH },
    params: {},
    context: {},
  });
  eq(result.success, true);
  eq(result.output.placeholder, true);
});

t('PUBLISH: router 无 createPublisher 方法时返回占位成功', async function () {
  // 旧代码检查 router.publish，新代码检查 router.createPublisher
  // 如果 router 只有 publish 方法（不存在的情况），应走占位分支
  const log = makeMockLogger();
  const exec = new StageExecutor({
    serviceBus: makeMockServiceBus(),
    container: makeMockContainer({
      publisherRouter: { publish: () => {} }, // 只有 publish，没有 createPublisher
    }),
    log,
  });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'publish', type: STAGE_TYPES.PUBLISH },
    params: {},
    context: {},
  });
  eq(result.success, true);
  eq(result.output.placeholder, true);
});

// ============================================================
// 2. 输入验证
// ============================================================

t('PUBLISH: videoPath 为 undefined 时失败', async function () {
  const log = makeMockLogger();
  const exec = new StageExecutor({
    serviceBus: makeMockServiceBus(),
    container: makeMockContainer({ publisherRouter: makeMockRouter({}) }),
    log,
  });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
    params: {},
    context: { compose: null }, // videoPath 为 null
  });
  eq(result.success, false);
  ok(/videoPath/.test(result.error), '错误应包含 videoPath');
});

t('PUBLISH: videoPath 文件不存在时失败', async function () {
  const log = makeMockLogger();
  const exec = new StageExecutor({
    serviceBus: makeMockServiceBus(),
    container: makeMockContainer({ publisherRouter: makeMockRouter({}) }),
    log,
  });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
    params: {},
    context: { compose: { videoPath: '/nonexistent/path/video.mp4' } },
  });
  eq(result.success, false);
  ok(/does not exist/.test(result.error), '错误应提示文件不存在');
});

t('PUBLISH: platforms 为空数组时失败', async function () {
  const log = makeMockLogger();
  const videoPath = makeTempVideo();
  try {
    const exec = new StageExecutor({
      serviceBus: makeMockServiceBus(),
      container: makeMockContainer({ publisherRouter: makeMockRouter({}) }),
      log,
    });
    const result = await exec.execute({
      runId: 'r1',
      stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
      params: { platforms: [] },
      context: { compose: { videoPath } },
    });
    eq(result.success, false);
    ok(/platforms/.test(result.error), '错误应提示 platforms');
  } finally {
    cleanupTempVideo(videoPath);
  }
});

t('PUBLISH: platforms 未指定时失败', async function () {
  const log = makeMockLogger();
  const videoPath = makeTempVideo();
  try {
    const exec = new StageExecutor({
      serviceBus: makeMockServiceBus(),
      container: makeMockContainer({ publisherRouter: makeMockRouter({}) }),
      log,
    });
    const result = await exec.execute({
      runId: 'r1',
      stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
      params: {}, // 无 platforms
      context: { compose: { videoPath } },
    });
    eq(result.success, false);
    ok(/platforms/.test(result.error), '错误应提示 platforms');
  } finally {
    cleanupTempVideo(videoPath);
  }
});

// ============================================================
// 3. 单平台发布
// ============================================================

t('PUBLISH: 单平台发布成功', async function () {
  const log = makeMockLogger();
  const videoPath = makeTempVideo();
  try {
    const exec = new StageExecutor({
      serviceBus: makeMockServiceBus(),
      container: makeMockContainer({
        publisherRouter: makeMockRouter({
          xiaohongshu: { success: true, url: 'https://xhs.example.com/post/123' },
        }),
      }),
      log,
    });
    const result = await exec.execute({
      runId: 'r1',
      stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
      params: { platforms: ['xiaohongshu'] },
      context: { compose: { videoPath } },
    });
    eq(result.success, true);
    eq(result.output.placeholder, false);
    eq(result.output.publishedTo, ['xiaohongshu']);
    eq(result.output.failedPlatforms.length, 0);
    eq(result.output.stats.total, 1);
    eq(result.output.stats.succeeded, 1);
    eq(result.output.stats.failed, 0);
    ok(log._logs.info.length > 0, '应记录 info 日志');
  } finally {
    cleanupTempVideo(videoPath);
  }
});

t('PUBLISH: 单平台发布失败时整体失败', async function () {
  const log = makeMockLogger();
  const videoPath = makeTempVideo();
  try {
    const exec = new StageExecutor({
      serviceBus: makeMockServiceBus(),
      container: makeMockContainer({
        publisherRouter: makeMockRouter({
          douyin: { success: false, error: 'Login expired' },
        }),
      }),
      log,
    });
    const result = await exec.execute({
      runId: 'r1',
      stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
      params: { platforms: ['douyin'] },
      context: { compose: { videoPath } },
    });
    eq(result.success, false);
    eq(result.output.publishedTo.length, 0);
    eq(result.output.failedPlatforms, ['douyin']);
    eq(result.output.stats.failed, 1);
    ok(/All platforms failed/.test(result.error), '错误应提示全部失败');
  } finally {
    cleanupTempVideo(videoPath);
  }
});

// ============================================================
// 4. 多平台发布
// ============================================================

t('PUBLISH: 多平台部分成功部分失败 — 整体成功', async function () {
  const log = makeMockLogger();
  const videoPath = makeTempVideo();
  try {
    const exec = new StageExecutor({
      serviceBus: makeMockServiceBus(),
      container: makeMockContainer({
        publisherRouter: makeMockRouter({
          xiaohongshu: { success: true, url: 'https://xhs.example.com/1' },
          douyin: { success: false, error: 'Login expired' },
          bilibili: { success: true, url: 'https://bilibili.example.com/2' },
        }),
      }),
      log,
    });
    const result = await exec.execute({
      runId: 'r1',
      stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
      params: { platforms: ['xiaohongshu', 'douyin', 'bilibili'] },
      context: { compose: { videoPath } },
    });
    eq(result.success, true); // 至少一个成功
    eq(result.output.publishedTo.length, 2);
    eq(result.output.failedPlatforms, ['douyin']);
    eq(result.output.stats.total, 3);
    eq(result.output.stats.succeeded, 2);
    eq(result.output.stats.failed, 1);
    eq(result.output.results.length, 3);
  } finally {
    cleanupTempVideo(videoPath);
  }
});

t('PUBLISH: 多平台全部失败 — 整体失败', async function () {
  const log = makeMockLogger();
  const videoPath = makeTempVideo();
  try {
    const exec = new StageExecutor({
      serviceBus: makeMockServiceBus(),
      container: makeMockContainer({
        publisherRouter: makeMockRouter({
          xiaohongshu: { success: false, error: 'err1' },
          douyin: { success: false, error: 'err2' },
        }),
      }),
      log,
    });
    const result = await exec.execute({
      runId: 'r1',
      stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
      params: { platforms: ['xiaohongshu', 'douyin'] },
      context: { compose: { videoPath } },
    });
    eq(result.success, false);
    eq(result.output.publishedTo.length, 0);
    eq(result.output.failedPlatforms.length, 2);
    ok(/All platforms failed/.test(result.error));
  } finally {
    cleanupTempVideo(videoPath);
  }
});

// ============================================================
// 5. 异常处理
// ============================================================

t('PUBLISH: publisher.publish 抛异常时不中断其他平台', async function () {
  const log = makeMockLogger();
  const videoPath = makeTempVideo();
  try {
    const exec = new StageExecutor({
      serviceBus: makeMockServiceBus(),
      container: makeMockContainer({
        publisherRouter: makeMockRouter({
          xiaohongshu: { throw: 'RPA view crashed' }, // 抛异常
          douyin: { success: true, url: 'https://douyin.example.com/1' },
        }),
      }),
      log,
    });
    const result = await exec.execute({
      runId: 'r1',
      stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
      params: { platforms: ['xiaohongshu', 'douyin'] },
      context: { compose: { videoPath } },
    });
    // douyin 成功，整体成功
    eq(result.success, true);
    eq(result.output.publishedTo, ['douyin']);
    eq(result.output.failedPlatforms, ['xiaohongshu']);
    // xiaohongshu 的 error 应包含异常信息
    const xhsResult = result.output.results.find(r => r.platform === 'xiaohongshu');
    ok(/RPA view crashed/.test(xhsResult.error), '应记录异常信息');
    ok(log._logs.warn.length > 0, '应记录 warn 日志');
  } finally {
    cleanupTempVideo(videoPath);
  }
});

t('PUBLISH: stage.platforms 优先于 params.platforms', async function () {
  const log = makeMockLogger();
  const videoPath = makeTempVideo();
  try {
    const exec = new StageExecutor({
      serviceBus: makeMockServiceBus(),
      container: makeMockContainer({
        publisherRouter: makeMockRouter({
          bilibili: { success: true, url: 'https://b.example.com/1' },
        }),
      }),
      log,
    });
    const result = await exec.execute({
      runId: 'r1',
      stage: {
        name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose',
        platforms: ['bilibili'], // stage.platforms 优先
      },
      params: { platforms: ['xiaohongshu'] }, // params.platforms 应被忽略
      context: { compose: { videoPath } },
    });
    eq(result.success, true);
    eq(result.output.publishedTo, ['bilibili']);
    eq(result.output.stats.total, 1);
  } finally {
    cleanupTempVideo(videoPath);
  }
});

(async () => {
  await _runAll();
  console.log('========== ' + p + '/' + (p + f) + ' ==========');
  if (f > 0) process.exit(1);
})();
