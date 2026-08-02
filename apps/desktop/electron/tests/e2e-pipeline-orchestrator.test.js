// E2E 集成测试 - 验证 PipelineEngine orchestrator 模式端到端执行 story2video-compose 流水线
// 前置条件：smart-sentence-splitter 已在 8002 启动。
// Story2Video 优化阶段使用受控的默认 LLM 夹具，不能回退到 prompt-engine。

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ServiceBus = require('../services/service-bus');
const SplitterBridge = require('../services/splitter-bridge');
const { StageExecutor } = require('../services/stage-executor');
const { PipelineEngine } = require('../services/pipeline-engine');
const { registerStory2VideoStages } = require('../services/story2video-stages');

function createControlledDefaultLlm() {
  const calls = [];
  return {
    calls,
    _modelProviderManager: {
      getDefault: (type) => type === 'llm'
        ? { id: 'e2e-llm', models: ['e2e-model'] }
        : null,
    },
    generateWithDefault: async (type, params) => {
      calls.push({ type, params });
      return {
        content: 'E2E visual prompt: ' + params.messages[1].content,
        model: 'e2e-model',
      };
    },
  };
}

// 构造依赖注入的容器（attach 到外部已运行的 Python 服务）
async function buildContainer({ aiGenerator = createControlledDefaultLlm() } = {}) {
  const splitterBridge = new SplitterBridge({});
  await splitterBridge.attach();
  const pythonBridge = {
    isRunning: () => true,
    requestBackend: async () => ({ code: 0, data: {} }),
    startPythonBackend: async () => {},
    stopPythonBackend: async () => {},
  };

  const serviceBus = new ServiceBus({
    pythonBridge,
    splitterBridge,
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
    aiGenerator,
    log: { info: () => {}, warn: () => {}, error: () => {} },
  });

  registerStory2VideoStages(pipelineEngine);

  return { pipelineEngine, serviceBus, aiGenerator };
}

test('PipelineEngine orchestrator - story2video-compose 流水线已注册为第 14 条', { timeout: 10000 }, () => {
  const pe = new PipelineEngine({ log: { info: () => {}, warn: () => {}, error: () => {} } });
  const list = pe.listPipelines();
  const s2v = list.find(p => p.name === 'story2video-compose');
  assert.ok(s2v, 'story2video-compose 应存在于流水线列表');
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

test('PipelineEngine orchestrator - domain_enrich 后由默认 LLM 执行 optimize', { timeout: 60000 }, async () => {
  const { pipelineEngine, aiGenerator } = await buildContainer();
  const res = await pipelineEngine.startOrchestrated('story2video-compose', {
    text: '美丽的日落。海边的椰子树。',
    autoAdvance: false,
  });
  for (const stageName of ['split', 'domain_enrich', 'optimize']) {
    const execRes = await pipelineEngine.executeStage(res.runId);
    if (!execRes.success) console.log('  ' + stageName + ' error:', execRes.error, execRes.details);
    assert.ok(execRes.success, stageName + ' 应执行成功');
  }
  const ctx = pipelineEngine.getRunContext(res.runId);
  assert.ok(ctx.split, 'context 应包含 split 结果');
  assert.ok(ctx.domain_enrich, 'context 应包含 domain_enrich 结果');
  assert.ok(ctx.optimize, 'context 应包含 optimize 结果');
  assert.equal(ctx.optimize[0].providerId, 'e2e-llm');
  const enrichedScenes = ctx.domain_enrich.scenes || ctx.domain_enrich.sentences || ctx.domain_enrich;
  assert.ok(Array.isArray(enrichedScenes), 'domain_enrich 应提供场景数组');
  assert.equal(aiGenerator.calls.length, enrichedScenes.length,
    '默认 LLM 应逐场景接收 domain_enrich 输出');
  assert.ok(aiGenerator.calls.every(call => call.type === 'llm'), '优化必须调用 LLM 默认模型');
  assert.ok(aiGenerator.calls.every(call => call.params.messages[1].content.includes('Scene source:')),
    '优化请求必须带入场景 prompt seed');
  assert.ok(ctx.optimize.every(item => item.optimized_prompt.startsWith('E2E visual prompt:')),
    '优化输出必须来自受控默认 LLM');
  assert.ok(ctx.optimize.every(item => item.providerId === 'e2e-llm' && item.model === 'e2e-model'),
    '优化输出必须保留默认 LLM 身份');
  console.log('  domain_enrich + optimize 完成');
});

test('PipelineEngine orchestrator - 缺少默认 LLM 时 optimize 明确 fail-closed', { timeout: 60000 }, async () => {
  const { pipelineEngine } = await buildContainer({ aiGenerator: null });
  const res = await pipelineEngine.startOrchestrated('story2video-compose', {
    text: '美丽的日落。海边的椰子树。',
    autoAdvance: false,
  });
  assert.ok(res.success, '应成功创建 orchestrator run');
  for (const stageName of ['split', 'domain_enrich']) {
    const execRes = await pipelineEngine.executeStage(res.runId);
    assert.ok(execRes.success, stageName + ' 应执行成功');
  }
  const optimize = await pipelineEngine.executeStage(res.runId);
  assert.equal(optimize.success, false, '缺失默认 LLM 必须阻止 optimize');
  assert.match(optimize.error, /默认 LLM 不可用/, '应返回可操作的默认 LLM 配置错误');
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
