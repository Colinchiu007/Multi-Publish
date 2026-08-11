// E2E 集成测试 - 验证 PipelineEngine orchestrator 模式端到端执行 story2video-compose 流水线
// 前置条件：smart-sentence-splitter 已在 8002 启动。
// Story2Video 优化阶段统一走 prompt-engine（PromptBridge / 8013），
// 本测试注入 mock PromptBridge，不依赖真实 prompt-engine 服务与 LLM key。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ServiceBus = require('../services/service-bus');
const SplitterBridge = require('../services/splitter-bridge');
const { StageExecutor } = require('../services/stage-executor');
const { PipelineEngine } = require('../services/pipeline-engine');
const { registerStory2VideoStages } = require('../services/story2video-stages');

function createMockPromptEngine() {
  const calls = [];
  const promptBridge = {
    calls,
    start: async () => {},
    stop: async () => {},
    healthCheck: async () => true,
    optimize: async (request) => {
      calls.push(request);
      return {
        optimized_prompt: 'E2E visual prompt: ' + request.prompt,
        platform: request.platform || 'generic',
        style: request.style || null,
        model_used: 'e2e-model',
        key_source: 'config',
      };
    },
    optimizeBatch: async (requests) => requests.map((request) => ({
      optimized_prompt: 'E2E visual prompt: ' + request.prompt,
      platform: request.platform || 'generic',
      style: request.style || null,
      model_used: 'e2e-model',
      key_source: 'config',
    })),
  };
  return promptBridge;
}

// 构造依赖注入的容器（attach 到外部已运行的 Python 服务）
async function buildContainer({ promptBridge = createMockPromptEngine() } = {}) {
  const splitterBridge = new SplitterBridge({});
  await splitterBridge.start();
  const pythonBridge = {
    isRunning: () => true,
    requestBackend: async () => ({ code: 0, data: {} }),
    startPythonBackend: async () => {},
    stopPythonBackend: async () => {},
  };

  const serviceBus = new ServiceBus({
    pythonBridge,
    splitterBridge,
    promptBridge,
    // E2E 测试用 mock 引擎（真实引擎需要图片/音频文件）
    story2videoEngine: {
      compose: async () => ({
        code: 0,
        data: { videoPath: '/tmp/e2e_test.mp4', fileSize: 1024, segmentCount: 2, duration: 5.0 },
      }),
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
  });
  const stageExecutor = new StageExecutor({
    serviceBus,
    container: {},
    log: { info: () => {}, warn: () => {}, error: () => {} },
  });
  const pipelineEngine = new PipelineEngine({
    serviceBus,
    stageExecutor,
    container: {},
    log: { info: () => {}, warn: () => {}, error: () => {} },
  });

  registerStory2VideoStages(pipelineEngine);

  return { pipelineEngine, serviceBus, promptBridge };
}

test('PipelineEngine orchestrator - story2video-compose 流水线稳定排在首位', { timeout: 10000 }, () => {
  const pe = new PipelineEngine({ log: { info: () => {}, warn: () => {}, error: () => {} } });
  const list = pe.listPipelines();
  const s2v = list.find(p => p.name === 'story2video-compose');
  assert.ok(s2v, 'story2video-compose 应存在于流水线列表');
  assert.equal(list[0].name, 'story2video-compose', 'Story2Video 应优先显示');
  assert.equal(s2v.category, 'generated');
  assert.equal(list.length, 14, '总流水线数应为 14');
});

test('PipelineEngine orchestrator - startOrchestrated 创建 run 并标记为 orchestrator 模式', { timeout: 60000 }, async () => {
  const { pipelineEngine } = await buildContainer();
  const res = await pipelineEngine.startOrchestrated('story2video-compose', {
    text: '美丽的日落。海边的椰子树。',
    autoAdvance: false,
  });
  assert.ok(res.success, '应成功创建 orchestrator run');
  assert.ok(res.runId, '应返回 runId');
  const ctx = pipelineEngine.getRunContext(res.runId);
  assert.ok(ctx !== null, '应返回 context 对象');
});

test('PipelineEngine orchestrator - stage 1 (split) 执行成功并写入 context', { timeout: 60000 }, async () => {
  const { pipelineEngine } = await buildContainer();
  const res = await pipelineEngine.startOrchestrated('story2video-compose', {
    text: '美丽的日落。海边的椰子树。远处的帆船。',
    autoAdvance: false,
  });
  const execRes = await pipelineEngine.executeStage(res.runId);
  if (!execRes.success) console.log('  stage 1 error:', execRes.error);
  assert.ok(execRes.success, 'stage 1 应执行成功');
  assert.ok(execRes.output, '应返回 output');
  const ctx = pipelineEngine.getRunContext(res.runId);
  assert.ok(ctx.split, 'context 应包含 split 结果');
  assert.ok(ctx.split.scenes?.length > 0, 'split 应返回 scenes');
  console.log('  stage 1 (split) 完成，场景数:', ctx.split.scenes?.length);
});

test('PipelineEngine orchestrator - domain_enrich 后由 prompt-engine 执行 optimize', { timeout: 60000 }, async () => {
  const { pipelineEngine, promptBridge } = await buildContainer();
  const res = await pipelineEngine.startOrchestrated('story2video-compose', {
    text: '美丽的日落。海边的椰子树。',
    autoAdvance: false,
  });
  for (const stageName of ['split', 'domain_enrich', 'scene_context', 'optimize']) {
    const execRes = await pipelineEngine.executeStage(res.runId);
    if (!execRes.success) console.log('  ' + stageName + ' error:', execRes.error, execRes.details);
    assert.ok(execRes.success, stageName + ' 应执行成功');
  }
  const ctx = pipelineEngine.getRunContext(res.runId);
  assert.ok(ctx.split, 'context 应包含 split 结果');
  assert.ok(ctx.domain_enrich, 'context 应包含 domain_enrich 结果');
  assert.ok(ctx.scene_context, 'context 应包含 scene_context 结果');
  assert.ok(ctx.optimize, 'context 应包含 optimize 结果');
  assert.equal(ctx.optimize[0].providerId, 'prompt-engine');
  const enrichedScenes = ctx.domain_enrich.scenes || ctx.domain_enrich.sentences || ctx.domain_enrich;
  assert.ok(Array.isArray(enrichedScenes), 'domain_enrich 应提供场景数组');
  assert.equal(promptBridge.calls.length, enrichedScenes.length,
    'prompt-engine 应逐场景接收 domain_enrich 输出');
  assert.ok(promptBridge.calls.every(call => typeof call.prompt === 'string' && call.prompt.length > 0),
    '优化请求必须携带场景 prompt seed');
  assert.ok(promptBridge.calls.every(call => call.auto_detect_style === true || call.style),
    '优化请求必须启用自动风格检测或显式风格');
  assert.ok(ctx.optimize.every(item => item.optimized_prompt.startsWith('E2E visual prompt:')),
    '优化输出必须来自 mock prompt-engine');
  assert.ok(ctx.optimize.every(item => item.providerId === 'prompt-engine' && item.model === 'e2e-model'),
    '优化输出必须保留 prompt-engine 身份');
  console.log('  domain_enrich + optimize 完成');
});

test('PipelineEngine orchestrator - prompt-engine 不可用时 optimize 明确 fail-closed', { timeout: 60000 }, async () => {
  const unavailablePromptBridge = {
    start: async () => {},
    stop: async () => {},
    healthCheck: async () => false,
    optimize: async () => { throw new Error('PromptBridge is not running'); },
    optimizeBatch: async () => [],
  };
  const { pipelineEngine } = await buildContainer({ promptBridge: unavailablePromptBridge });
  const res = await pipelineEngine.startOrchestrated('story2video-compose', {
    text: '美丽的日落。海边的椰子树。',
    autoAdvance: false,
  });
  assert.ok(res.success, '应成功创建 orchestrator run');
  for (const stageName of ['split', 'domain_enrich', 'scene_context']) {
    const execRes = await pipelineEngine.executeStage(res.runId);
    assert.ok(execRes.success, stageName + ' 应执行成功');
  }
  const optimize = await pipelineEngine.executeStage(res.runId);
  assert.equal(optimize.success, false, 'prompt-engine 不可用必须阻止 optimize');
  assert.match(optimize.error, /prompt-engine|PromptBridge|not running/i, '应返回可操作的 prompt-engine 错误');
});

test('PipelineEngine orchestrator - advanceToNextCheckpoint 推进到完成', { timeout: 120000 }, async () => {
  const { pipelineEngine } = await buildContainer();
  const res = await pipelineEngine.startOrchestrated('story2video-compose', {
    text: '美丽的日落。海边的椰子树。',
    autoAdvance: true,
  });
  if (!res.success) console.log('  autoAdvance error:', res.error, res.results);
  assert.ok(res.success, 'autoAdvance 应执行成功');
  // 流水线完成后 run 从 _runs 删除，context 通过返回值传递
  const ctx = res.context || pipelineEngine.getRunContext(res.runId);
  assert.ok(ctx, '应返回 context');
  console.log('  context keys:', Object.keys(ctx).join(', '));
  console.log('  autoAdvance 完成，paused:', res.paused);
});

