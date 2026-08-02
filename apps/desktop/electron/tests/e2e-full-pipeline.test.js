// @ts-check
/**
 * E2E 全链路测试 - story2video-compose 流水线真实执行
 *
 * 测试范围：
 *   1. split (Python 8002) → 真实分句
 *   2. domain_enrich → 真实领域增强执行器
 *   3. optimize (当前默认 LLM 受控夹具) → 默认模型调用合同
 *   4. generate_assets (Node.js AssetGenerator) → 真实媒体文件（默认允许显式降级资产）
 *   5. compose (ffmpeg) → 真实可解码视频文件
 *   6. publish → 未启用时明确 skipped
 *
 * 前置条件：
 *   - smart-sentence-splitter 运行在 8002
 *   - ffmpeg 可用
 */
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ServiceBus = require('../services/service-bus');
const { PipelineEngine } = require('../services/pipeline-engine');
const { registerStory2VideoStages } = require('../services/story2video-stages');
const { AssetGenerator } = require('../services/asset-generator');
const { Story2VideoComposeEngine, findFfmpeg } = require('../services/story2video-compose-engine');
const SplitterBridge = require('../services/splitter-bridge');

const _diagnostics = [];
const noopLog = {
  info: () => {},
  warn: (...args) => _diagnostics.push(args.map(String).join(' ')),
  error: (...args) => _diagnostics.push(args.map(String).join(' ')),
  debug: () => {},
};

const _tmpRoots = [];

afterEach(() => {
  for (const root of _tmpRoots) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) { /* 已删除或无权限 */ }
  }
  _tmpRoots.length = 0;
  _diagnostics.length = 0;
});

const TEST_TEXT = '人工智能正在改变世界。从自动驾驶到智能助手，AI 技术已经深入我们生活的方方面面。未来十年，AI 将带来更多惊喜。';

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
async function buildRealContext() {
  const controlledTempRoot = path.join(os.tmpdir(), 'story2video');
  fs.mkdirSync(controlledTempRoot, { recursive: true });
  const runRoot = fs.mkdtempSync(path.join(controlledTempRoot, 'e2e-pipeline-'));
  _tmpRoots.push(runRoot);

  const splitterBridge = new SplitterBridge({ port: 8002, log: noopLog });

  const splitterOk = await splitterBridge.attach();
  if (!splitterOk) {
    throw new Error('Splitter bridge not available');
  }

  const assetGenerator = new AssetGenerator({ outputDir: path.join(runRoot, 'assets'), log: noopLog });
  const composeEngine = new Story2VideoComposeEngine({ outputDir: path.join(runRoot, 'output'), log: noopLog });

  const serviceBus = new ServiceBus({
    splitterBridge,
    story2videoEngine: composeEngine,
    log: noopLog,
  });
  serviceBus._assetGenerator = assetGenerator;
  const aiGenerator = createControlledDefaultLlm();
  const pipelineEngine = new PipelineEngine({ serviceBus, aiGenerator, log: noopLog });
  const registration = registerStory2VideoStages(pipelineEngine);
  if (!registration.success) throw new Error(registration.error);

  return { serviceBus, splitterBridge, aiGenerator, assetGenerator, composeEngine, pipelineEngine, runRoot };
}

function assertWithinRunRoot(runRoot, filePath) {
  const relative = path.relative(runRoot, filePath);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    'generated media should stay inside the E2E run root');
}

test('E2E: PipelineEngine 真实执行 Story2Video 六阶段并产出可解码视频', { timeout: 180000 }, async () => {
  const { pipelineEngine, aiGenerator, runRoot } = await buildRealContext();
  let result = await pipelineEngine.startOrchestrated('story2video-compose', {
    text: TEST_TEXT,
    autoAdvance: true,
    checkpointPolicy: 'guided',
    imageStyle: 'cinematic',
    resolution: '320x180',
    aspectRatio: '16:9',
    defaultSceneDuration: 1,
    subtitleEnabled: false,
    publishEnabled: false,
    platforms: [],
  });
  assert.strictEqual(result.success, true, [result.error, ..._diagnostics].filter(Boolean).join('\n'));
  assert.ok(result.runId, 'pipeline should create a run');
  const runId = result.runId;

  let checkpoints = 0;
  while (result.paused) {
    checkpoints += 1;
    assert.ok(checkpoints <= 6, 'pipeline should not loop indefinitely at checkpoints');
    result = await pipelineEngine.advanceToNextCheckpoint(runId);
    assert.strictEqual(result.success, true, [result.error, ..._diagnostics].filter(Boolean).join('\n'));
  }
  assert.strictEqual(result.completed, true, 'pipeline should complete all six stages');

  const completedRun = pipelineEngine.getHistory().find(run => run.id === runId);
  assert.ok(completedRun, 'completed pipeline should move to history');
  assert.strictEqual(completedRun.status, 'completed');
  assert.deepStrictEqual(
    completedRun.stages.map(stage => stage.name),
    ['split', 'domain_enrich', 'optimize', 'generate_assets', 'compose', 'publish'],
  );
  assert.ok(completedRun.stages.every(stage => stage.status === 'completed'));

  const context = result.context || completedRun.context;
  for (const stageName of ['split', 'domain_enrich', 'optimize', 'generate_assets', 'compose', 'publish']) {
    assert.ok(context[stageName], 'context should contain ' + stageName);
  }

  const splitScenes = context.split.scenes || context.split.sentences;
  assert.ok(Array.isArray(splitScenes) && splitScenes.length > 0, 'split service should return scenes');
  assert.ok(Array.isArray(context.optimize), 'default LLM should return an optimized prompt array');
  assert.strictEqual(context.optimize.length, splitScenes.length,
    'default LLM result count should match split scenes');
  assert.ok(context.optimize.every(item => {
    const prompt = typeof item === 'string'
      ? item
      : item?.prompt || item?.optimized_prompt || item?.optimized;
    return typeof prompt === 'string' && prompt.trim().length > 0;
  }), 'default LLM should return a non-empty optimized prompt for every scene');
  assert.ok(context.optimize.every(item => item.providerId === 'e2e-llm' && item.model === 'e2e-model'),
    'every optimized prompt should retain the selected default model identity');
  assert.strictEqual(aiGenerator.calls.length, splitScenes.length,
    'controlled default LLM should receive one optimization call per scene');
  assert.ok(aiGenerator.calls.every(call => call.type === 'llm'),
    'optimization should use the configured default LLM interface');
  assert.ok(aiGenerator.calls.every(call => call.params.messages[1].content.includes('Scene source:')),
    'each optimization request should include the scene prompt seed');

  const assets = context.generate_assets;
  assert.ok(assets.scenes.length > 0, 'asset stage should create paired scenes');
  assert.strictEqual(assets.stats.successScenes, assets.stats.totalScenes);
  assert.ok(assets.images.every(item => fs.existsSync(item.path)), 'all image files should exist');
  assert.ok(assets.audio.every(item => fs.existsSync(item.path)), 'all audio files should exist');
  assert.ok(assets.images.every(item => item.meta?.source === 'ffmpeg-placeholder'));
  assert.ok(assets.audio.every(item => ['edge-tts', 'ffmpeg-silence'].includes(item.meta?.source)));
  assets.images.forEach(item => assertWithinRunRoot(runRoot, item.path));
  assets.audio.forEach(item => assertWithinRunRoot(runRoot, item.path));

  const compose = context.compose;
  assert.ok(fs.existsSync(compose.videoPath), 'video file should exist');
  assert.ok(compose.fileSize > 0, 'video file should not be empty');
  assert.ok(compose.duration > 0, 'video duration should be positive');
  const ffmpeg = findFfmpeg();
  assert.ok(ffmpeg, 'ffmpeg should be available for decode verification');
  execFileSync(ffmpeg, ['-v', 'error', '-i', compose.videoPath, '-map', '0:v:0', '-f', 'null', '-'], {
    stdio: 'pipe',
    timeout: 60000,
  });
  assertWithinRunRoot(runRoot, compose.videoPath);
  if (compose.audioPath) assertWithinRunRoot(runRoot, compose.audioPath);

  assert.deepStrictEqual(context.publish.publishedTo, []);
  assert.strictEqual(context.publish.skipped, true);
  assert.strictEqual(context.publish.videoPath, compose.videoPath);

  console.log('  [stages] split → domain_enrich → optimize → generate_assets → compose → publish');
  console.log('  [assets] image=' + assets.images[0].meta.source +
    ', audio=' + assets.audio[0].meta.source);
  console.log('  [compose] video created: ' + compose.fileSize + ' bytes, ' +
    compose.duration + ' seconds');
  console.log('  === E2E FULL PIPELINE PASSED ===');
});
