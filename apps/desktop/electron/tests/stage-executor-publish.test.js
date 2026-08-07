// stage-executor PUBLISH 阶段单元测试 (P2-10)
// 测试多平台发布的各种场景：跳过/验证/单平台/多平台/失败处理
//
// 运行：vitest run electron/tests/stage-executor-publish.test.js
import { describe, expect, it, vi } from 'vitest'

const fs = require('fs');
const path = require('path');
const os = require('os');

function eq(actual, expected, message) {
  expect(actual, message).toEqual(expected)
}

function ok(value, message) {
  expect(value, message).toBeTruthy()
}

const { StageExecutor, STAGE_TYPES } = require('../services/stage-executor');

// ---------- Mock 工具 ----------
function makeMockServiceBus() {
  return {
    splitText: vi.fn(async () => ({ code: 0, data: { sentences: [] } })),
    optimizePrompt: vi.fn(async () => ({ code: 0, data: {} })),
    optimizePromptsBatch: vi.fn(async () => ({ code: 0, data: [] })),
    composeVideo: vi.fn(async () => ({ code: 0, data: { videoPath: '/tmp/out.mp4' } })),
    callPythonSkill: vi.fn(async () => ({ code: 0, data: {} })),
    fetchPipeline: vi.fn(async () => ({ code: 0, data: {} })),
  };
}

function makeMockContainer(services) {
  return { get: vi.fn((name) => services[name]) };
}

function makeMockLogger() {
  const logs = { info: [], warn: [], error: [] };
  return {
    info: vi.fn((c, m) => logs.info.push(c + ': ' + m)),
    warn: vi.fn((c, m) => logs.warn.push(c + ': ' + m)),
    error: vi.fn((c, m) => logs.error.push(c + ': ' + m)),
    _logs: logs,
  };
}

// 创建真实临时文件作为 videoPath
function makeTempVideo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-10-test-'));
  const file = path.join(dir, 'test.mp4');
  fs.writeFileSync(file, Buffer.from('fake-video-content'));
  return file;
}

function cleanupTempVideo(file) {
  try {
    const dir = path.dirname(file);
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
}

// Mock publisherRouter: createPublisher(platform, deps) → { publish(task) }
function makeMockRouter(platformResults) {
  // platformResults: { platform: { success, url?, error?, throw? } }
  return {
    createPublisher: vi.fn((platform) => ({
      publish: vi.fn(async () => {
        const cfg = platformResults[platform] || { success: false, error: 'Unknown platform' };
        if (cfg.throw) throw new Error(cfg.throw);
        return { success: cfg.success, url: cfg.url, postId: cfg.postId, error: cfg.error };
      }),
    })),
  };
}

describe('StageExecutor PUBLISH 阶段', () => {

// ============================================================
// 1. 占位分支（router 未配置）
// ============================================================

it('PUBLISH: 未选择平台时明确跳过，不伪造发布成功', async function () {
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
  eq(result.output.skipped, true);
  eq(result.output.placeholder, false);
  eq(result.output.publishedTo.length, 0);
  eq(log._logs.warn.length, 0);
});

it('PUBLISH: 显式开启但没有 publisherRouter 时失败', async function () {
  const log = makeMockLogger();
  const exec = new StageExecutor({
    serviceBus: makeMockServiceBus(),
    container: null,
    log,
  });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'publish', type: STAGE_TYPES.PUBLISH },
    params: { publishEnabled: true, platforms: ['douyin'] },
    context: { compose: { videoPath: '/tmp/out.mp4' } },
  });
  eq(result.success, false);
  ok(/publisherRouter/.test(result.error));
});

it('PUBLISH: router 无 createPublisher 方法时失败', async function () {
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
    params: { publishEnabled: true, platforms: ['douyin'] },
    context: { compose: { videoPath: '/tmp/out.mp4' } },
  });
  eq(result.success, false);
  ok(/publisherRouter/.test(result.error));
});

// ============================================================
// 2. 输入验证
// ============================================================

it('PUBLISH: videoPath 为 undefined 时失败', async function () {
  const log = makeMockLogger();
  const exec = new StageExecutor({
    serviceBus: makeMockServiceBus(),
    container: makeMockContainer({ publisherRouter: makeMockRouter({}) }),
    log,
  });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
    params: { publishEnabled: true, platforms: ['douyin'] },
    context: { compose: null }, // videoPath 为 null
  });
  eq(result.success, false);
  ok(/videoPath/.test(result.error), '错误应包含 videoPath');
});

it('PUBLISH: videoPath 文件不存在时失败', async function () {
  const log = makeMockLogger();
  const exec = new StageExecutor({
    serviceBus: makeMockServiceBus(),
    container: makeMockContainer({ publisherRouter: makeMockRouter({}) }),
    log,
  });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'publish', type: STAGE_TYPES.PUBLISH, inputFrom: 'compose' },
    params: { publishEnabled: true, platforms: ['douyin'] },
    context: { compose: { videoPath: '/nonexistent/path/video.mp4' } },
  });
  eq(result.success, false);
  ok(/does not exist/.test(result.error), '错误应提示文件不存在');
});

it('PUBLISH: platforms 为空数组时失败', async function () {
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
      params: { publishEnabled: true, platforms: [] },
      context: { compose: { videoPath } },
    });
    eq(result.success, false);
    ok(/platforms/.test(result.error), '错误应提示 platforms');
  } finally {
    cleanupTempVideo(videoPath);
  }
});

it('PUBLISH: platforms 未指定时失败', async function () {
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
      params: { publishEnabled: true }, // 无 platforms
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

it('PUBLISH: 单平台发布成功', async function () {
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

it('PUBLISH: 将封面 URL 传递给发布器任务', async function () {
  const log = makeMockLogger();
  const videoPath = makeTempVideo();
  const publisher = { publish: vi.fn(async () => ({ success: true, url: 'https://xhs.example.com/post/cover' })) };
  const router = { createPublisher: vi.fn(() => publisher) };
  try {
    const exec = new StageExecutor({
      serviceBus: makeMockServiceBus(),
      container: makeMockContainer({ publisherRouter: router }),
      log,
    });
    const result = await exec.execute({
      runId: 'r-cover',
      stage: {
        name: 'publish',
        type: STAGE_TYPES.PUBLISH,
        inputFrom: 'compose',
        options: { title: '封面回归', content: '内容', tags: ['回归'], coverUrl: 'https://cdn.example.com/cover.jpg' },
      },
      params: { platforms: ['xiaohongshu'] },
      context: { compose: { videoPath } },
    });
    eq(result.success, true);
    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      article: expect.objectContaining({
        title: '封面回归',
        content: '内容',
        tags: ['回归'],
        cover_url: 'https://cdn.example.com/cover.jpg',
      }),
    }));
  } finally {
    cleanupTempVideo(videoPath);
  }
});

it('PUBLISH: 单平台发布失败时整体失败', async function () {
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

it('PUBLISH: 多平台部分成功部分失败 — 整体成功', async function () {
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

it('PUBLISH: 多平台全部失败 — 整体失败', async function () {
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

it('PUBLISH: publisher.publish 抛异常时不中断其他平台', async function () {
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

it('PUBLISH: stage.platforms 优先于 params.platforms', async function () {
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

})
