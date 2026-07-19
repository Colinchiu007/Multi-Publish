import { beforeEach, describe, expect, it, vi } from 'vitest'

const ServiceBus = require('../services/service-bus')
const PluginRegistry = require('../services/plugin-registry')

function eq(actual, expected, message) {
  expect(actual, message).toEqual(expected)
}

function ok(value, message) {
  expect(value, message).toBeTruthy()
}

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================
// 1. ServiceBus 测试
// ============================================================

function makeMockSplitterBridge() {
  return {
    split: vi.fn(async (text) => ({ code: 0, data: { sentences: text.split(/[。！？]/).filter(Boolean) } })),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    healthCheck: vi.fn(async () => true),
  };
}

function makeMockPromptBridge() {
  return {
    optimize: vi.fn(async (req) => ({ code: 0, data: { optimized: req.prompt + ' [opt]' } })),
    optimizeBatch: vi.fn(async (reqs) => ({ code: 0, data: reqs.map(r => r.prompt + ' [opt]') })),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    healthCheck: vi.fn(async () => true),
  };
}

function makeMockPythonBridge() {
  return {
    requestBackend: vi.fn(async (method, path, body) => ({ code: 0, data: { method, path, body } })),
    startPythonBackend: vi.fn(async () => {}),
    stopPythonBackend: vi.fn(async () => {}),
    isRunning: vi.fn(() => true),
  };
}

describe('ServiceBus 与 PluginRegistry', () => {

it('ServiceBus 构造函数正常工作', function () {
  const bus = new ServiceBus({
    pythonBridge: makeMockPythonBridge(),
    splitterBridge: makeMockSplitterBridge(),
    promptBridge: makeMockPromptBridge(),
    story2videoEngine: null,
    log: mockLog,
  });
  ok(bus.pythonBridge !== undefined);
  ok(bus.splitterBridge !== undefined);
  ok(bus.promptBridge !== undefined);
  eq(bus.story2videoEngine, null);
});

it('ServiceBus.splitText 委托 splitterBridge.split', async function () {
  const splitterBridge = makeMockSplitterBridge();
  const bus = new ServiceBus({
    pythonBridge: makeMockPythonBridge(),
    splitterBridge,
    promptBridge: makeMockPromptBridge(),
    log: mockLog,
  });
  const result = await bus.splitText('第一句。第二句！第三句？');
  eq(result.code, 0);
  eq(result.data.sentences.length, 3);
  expect(splitterBridge.split).toHaveBeenCalledWith('第一句。第二句！第三句？', undefined);
});

it('ServiceBus.optimizePrompt 委托 promptBridge.optimize', async function () {
  const promptBridge = makeMockPromptBridge();
  const bus = new ServiceBus({
    pythonBridge: makeMockPythonBridge(),
    splitterBridge: makeMockSplitterBridge(),
    promptBridge,
    log: mockLog,
  });
  const result = await bus.optimizePrompt('一只猫', { style: 'cinematic' });
  eq(result.code, 0);
  eq(result.data.optimized, '一只猫 [opt]');
  expect(promptBridge.optimize).toHaveBeenCalledWith({ prompt: '一只猫', style: 'cinematic' });
});

it('ServiceBus.optimizePromptsBatch 委托 promptBridge.optimizeBatch', async function () {
  const promptBridge = makeMockPromptBridge();
  const bus = new ServiceBus({
    pythonBridge: makeMockPythonBridge(),
    splitterBridge: makeMockSplitterBridge(),
    promptBridge,
    log: mockLog,
  });
  const result = await bus.optimizePromptsBatch(['prompt1', 'prompt2'], { style: 'cinematic' });
  eq(result.code, 0);
  eq(result.data.length, 2);
  eq(result.data[0], 'prompt1 [opt]');
  expect(promptBridge.optimizeBatch).toHaveBeenCalledWith([
    { prompt: 'prompt1', style: 'cinematic' },
    { prompt: 'prompt2', style: 'cinematic' },
  ]);
});

it('ServiceBus.composeVideo 在 story2videoEngine 为 null 时返回占位响应', async function () {
  const bus = new ServiceBus({
    pythonBridge: makeMockPythonBridge(),
    splitterBridge: makeMockSplitterBridge(),
    promptBridge: makeMockPromptBridge(),
    story2videoEngine: null,
    log: mockLog,
  });
  const result = await bus.composeVideo({ images: [] }, {});
  eq(result.code, -1);
  ok(/not implemented/.test(result.message));
});

it('ServiceBus.composeVideo 在 story2videoEngine 存在时委托 engine.compose', async function () {
  const mockEngine = {
    compose: async (assets, opts) => ({ code: 0, data: { videoPath: '/tmp/video.mp4', assets, opts } }),
  };
  const bus = new ServiceBus({
    pythonBridge: makeMockPythonBridge(),
    splitterBridge: makeMockSplitterBridge(),
    promptBridge: makeMockPromptBridge(),
    story2videoEngine: mockEngine,
    log: mockLog,
  });
  const result = await bus.composeVideo({ images: ['img1.png'] }, { transition: 'fade' });
  eq(result.code, 0);
  eq(result.data.videoPath, '/tmp/video.mp4');
  eq(result.data.opts.transition, 'fade');
});

it('ServiceBus.callPythonSkill 委托 pythonBridge.requestBackend', async function () {
  const pythonBridge = makeMockPythonBridge();
  const bus = new ServiceBus({
    pythonBridge,
    splitterBridge: makeMockSplitterBridge(),
    promptBridge: makeMockPromptBridge(),
    log: mockLog,
  });
  const result = await bus.callPythonSkill('generate_script', { topic: 'AI' });
  eq(result.code, 0);
  eq(result.data.method, 'POST');
  ok(result.data.path.includes('generate_script'));
  expect(pythonBridge.requestBackend).toHaveBeenCalledWith(
    'POST',
    '/api/skills/generate_script',
    { topic: 'AI' },
  );
});

it('ServiceBus.fetchPipeline 委托 pythonBridge.requestBackend', async function () {
  const pythonBridge = makeMockPythonBridge();
  const bus = new ServiceBus({
    pythonBridge,
    splitterBridge: makeMockSplitterBridge(),
    promptBridge: makeMockPromptBridge(),
    log: mockLog,
  });
  const result = await bus.fetchPipeline('story2video-compose');
  eq(result.code, 0);
  eq(result.data.method, 'GET');
  ok(result.data.path.includes('story2video-compose'));
  expect(pythonBridge.requestBackend).toHaveBeenCalledWith(
    'GET',
    '/api/pipelines/story2video-compose',
  );
});

it('ServiceBus.startAll 并行启动所有 Bridge', async function () {
  const startOrder = [];
  const splitter = { start: async () => { startOrder.push('splitter'); }, stop: async () => {}, healthCheck: async () => true };
  const prompt = { start: async () => { startOrder.push('prompt'); }, stop: async () => {}, healthCheck: async () => true };
  const python = { startPythonBackend: async () => { startOrder.push('python'); }, stopPythonBackend: async () => {}, isRunning: () => true };
  const bus = new ServiceBus({ pythonBridge: python, splitterBridge: splitter, promptBridge: prompt, log: mockLog });
  await bus.startAll();
  eq(startOrder.length, 3);
});

it('ServiceBus.stopAll 并行停止所有 Bridge', async function () {
  const stopOrder = [];
  const splitter = { start: async () => {}, stop: async () => { stopOrder.push('splitter'); }, healthCheck: async () => true };
  const prompt = { start: async () => {}, stop: async () => { stopOrder.push('prompt'); }, healthCheck: async () => true };
  const python = { startPythonBackend: async () => {}, stopPythonBackend: async () => { stopOrder.push('python'); }, isRunning: () => true };
  const bus = new ServiceBus({ pythonBridge: python, splitterBridge: splitter, promptBridge: prompt, log: mockLog });
  await bus.stopAll();
  eq(stopOrder.length, 3);
});

it('ServiceBus.healthCheckAll 返回所有服务健康状态', async function () {
  const bus = new ServiceBus({
    pythonBridge: makeMockPythonBridge(),
    splitterBridge: makeMockSplitterBridge(),
    promptBridge: makeMockPromptBridge(),
    story2videoEngine: null,
    log: mockLog,
  });
  const results = await bus.healthCheckAll();
  eq(results.pythonBridge, true);
  eq(results.splitterBridge, true);
  eq(results.promptBridge, true);
  eq(results.story2videoEngine, null);
});

it('ServiceBus.startAll 容忍 Bridge 启动失败', async function () {
  const splitter = {
    start: vi.fn(async () => { throw new Error('splitter start failed'); }),
    stop: vi.fn(async () => {}),
    healthCheck: vi.fn(async () => false),
  };
  const bus = new ServiceBus({
    pythonBridge: makeMockPythonBridge(),
    splitterBridge: splitter,
    promptBridge: makeMockPromptBridge(),
    log: mockLog,
  });
  await expect(bus.startAll()).resolves.toBeUndefined();
  expect(mockLog.error).toHaveBeenCalledWith(
    'ServiceBus',
    expect.stringContaining('splitter start failed'),
  );
});

// ============================================================
// 2. PluginRegistry 测试
// ============================================================

it('PluginRegistry 构造函数正常工作', function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  ok(reg.plugins instanceof Map);
  eq(reg.plugins.size, 0);
});

it('PluginRegistry.register 有效插件', function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  reg.register({ name: 'test-plugin', type: 'pipeline', version: '1.0.0' });
  eq(reg.plugins.size, 1);
  ok(reg.plugins.has('test-plugin'));
});

it('PluginRegistry.register 非对象应抛错', function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  expect(() => reg.register(null)).toThrow(/object/);
  expect(() => reg.register('string')).toThrow(/object/);
});

it('PluginRegistry.register 缺 name 应抛错', function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  expect(() => reg.register({ type: 'pipeline', version: '1.0.0' })).toThrow(/name/);
});

it('PluginRegistry.register 无效 type 应抛错', function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  expect(() => reg.register({ name: 'test', type: 'invalid', version: '1.0.0' }))
    .toThrow(/invalid type/);
});

it('PluginRegistry.register 缺 version 应抛错', function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  expect(() => reg.register({ name: 'test', type: 'pipeline' })).toThrow(/version/);
});

it('PluginRegistry.register 重复插件名应抛错', function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  reg.register({ name: 'dup-plugin', type: 'pipeline', version: '1.0.0' });
  expect(() => reg.register({ name: 'dup-plugin', type: 'service', version: '2.0.0' }))
    .toThrow(/already registered/);
});

it('PluginRegistry.startAll 按注册顺序启动插件', async function () {
  const startOrder = [];
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  reg.register({ name: 'p1', type: 'pipeline', version: '1.0.0', start: async () => { startOrder.push('p1'); } });
  reg.register({ name: 'p2', type: 'service', version: '1.0.0', start: async () => { startOrder.push('p2'); } });
  reg.register({ name: 'p3', type: 'data_source', version: '1.0.0', start: async () => { startOrder.push('p3'); } });
  await reg.startAll();
  eq(startOrder, ['p1', 'p2', 'p3']);
});

it('PluginRegistry.stopAll 逆序停止插件', async function () {
  const stopOrder = [];
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  reg.register({ name: 'p1', type: 'pipeline', version: '1.0.0', stop: async () => { stopOrder.push('p1'); } });
  reg.register({ name: 'p2', type: 'service', version: '1.0.0', stop: async () => { stopOrder.push('p2'); } });
  reg.register({ name: 'p3', type: 'data_source', version: '1.0.0', stop: async () => { stopOrder.push('p3'); } });
  await reg.stopAll();
  eq(stopOrder, ['p3', 'p2', 'p1']); // 逆序
});

it('PluginRegistry.startAll 容忍插件启动失败', async function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  const okStart = vi.fn(async () => {});
  reg.register({ name: 'fail-plugin', type: 'pipeline', version: '1.0.0', start: vi.fn(async () => { throw new Error('start failed'); }) });
  reg.register({ name: 'ok-plugin', type: 'service', version: '1.0.0', start: okStart });

  await expect(reg.startAll()).resolves.toBeUndefined();
  expect(okStart).toHaveBeenCalledOnce();
  expect(mockLog.error).toHaveBeenCalledWith(
    'PluginRegistry',
    expect.stringContaining('start failed'),
  );
});

it('PluginRegistry.list 返回插件信息', function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  reg.register({ name: 'p1', type: 'pipeline', version: '1.0.0', extraField: 'hidden' });
  reg.register({ name: 'p2', type: 'service', version: '2.0.0' });
  const list = reg.list();
  eq(list.length, 2);
  eq(list[0].name, 'p1');
  eq(list[0].type, 'pipeline');
  eq(list[0].version, '1.0.0');
  // list 不应包含 extraField
  ok(!('extraField' in list[0]), 'list 不应包含额外字段');
});

it('PluginRegistry.startAll 跳过无 start 方法的插件', async function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  reg.register({ name: 'no-start', type: 'pipeline', version: '1.0.0' }); // 无 start 方法
  await expect(reg.startAll()).resolves.toBeUndefined();
});

it('PluginRegistry.stopAll 跳过无 stop 方法的插件', async function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  reg.register({ name: 'no-stop', type: 'pipeline', version: '1.0.0' }); // 无 stop 方法
  await expect(reg.stopAll()).resolves.toBeUndefined();
});

it('PluginRegistry 所有三种类型都可注册', function () {
  const reg = new PluginRegistry({ serviceBus: {}, container: { get: () => null }, log: mockLog });
  reg.register({ name: 'pipe', type: 'pipeline', version: '1.0.0' });
  reg.register({ name: 'svc', type: 'service', version: '1.0.0' });
  reg.register({ name: 'data', type: 'data_source', version: '1.0.0' });
  eq(reg.plugins.size, 3);
  const types = reg.list().map(p => p.type);
  ok(types.includes('pipeline'));
  ok(types.includes('service'));
  ok(types.includes('data_source'));
});

})
