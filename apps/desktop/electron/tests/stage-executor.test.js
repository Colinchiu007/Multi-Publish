// stage-executor + orchestrator mode tests
import { describe, expect, it, vi } from 'vitest'

function eq(actual, expected, message) {
  expect(actual, message).toEqual(expected)
}

function ok(value, message) {
  expect(value, message).toBeTruthy()
}

const { StageExecutor, STAGE_TYPES } = require('../services/stage-executor');
const { PipelineEngine } = require('../services/pipeline-engine');

// ---------- Mock ServiceBus ----------
function makeMockServiceBus(overrides) {
  const bus = {
    splitText: vi.fn(async (text) => ({ code: 0, data: { sentences: text.split(/[。！？]/).filter(Boolean) } })),
    optimizePrompt: vi.fn(async (prompt) => ({ code: 0, data: { optimized: prompt + ' [optimized]' } })),
    optimizePromptsBatch: vi.fn(async (prompts) => ({ code: 0, data: prompts.map(p => p + ' [opt]') })),
    composeVideo: vi.fn(async () => ({ code: 0, data: { videoPath: '/tmp/out.mp4' } })),
    callPythonSkill: vi.fn(async (name) => ({ code: 0, data: { skill: name, result: 'ok' } })),
    fetchPipeline: vi.fn(async (name) => ({ code: 0, data: { name, stages: [] } })),
  };
  return Object.assign(bus, overrides || {});
}

// ---------- Mock Container ----------
function makeMockContainer(services) {
  return { get: vi.fn((name) => services[name]) };
}

describe('StageExecutor 与 PipelineEngine 编排模式', () => {

// ============================================================
// 1. StageExecutor 基础功能
// ============================================================

it('STAGE_TYPES 枚举完整', function () {
  eq(typeof STAGE_TYPES.SPLIT, 'string');
  eq(STAGE_TYPES.SPLIT, 'split');
  eq(STAGE_TYPES.OPTIMIZE_BATCH, 'optimize_batch');
  eq(STAGE_TYPES.MANUAL_CHECKPOINT, 'manual_checkpoint');
  eq(STAGE_TYPES.CUSTOM, 'custom');
  ok(Object.keys(STAGE_TYPES).length >= 10, '应有至少 10 种阶段类型');
});

it('StageExecutor 构造函数需要 serviceBus', function () {
  expect(() => new StageExecutor({})).toThrow(/serviceBus/);
});

it('StageExecutor 无参构造应抛错', function () {
  expect(() => new StageExecutor()).toThrow(/serviceBus/);
});

// ============================================================
// 2. 内置执行器测试
// ============================================================

it('SPLIT 阶段调用 serviceBus.splitText', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'split', type: STAGE_TYPES.SPLIT, inputFrom: 'input' },
    params: {},
    context: { input: '第一句。第二句！第三句？' },
  });
  eq(result.success, true);
  ok(Array.isArray(result.output.sentences), 'output 应包含 sentences 数组');
  eq(result.output.sentences.length, 3);
  expect(bus.splitText).toHaveBeenCalledOnce();
});

it('Story2Video SPLIT 保留服务场景，并在场景内生成本地字幕块', async function () {
  const bus = makeMockServiceBus({
    splitText: vi.fn(async () => ({
      tier_used: 'tier3_rule',
      scenes: [{ text: '第一幕包含足够长的画面说明，随后继续补充细节。' }],
      sentences: ['第一幕包含足够长的画面说明，', '随后继续补充细节。'],
    })),
  });
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'story-service',
    stage: {
      name: 'split',
      type: STAGE_TYPES.SPLIT,
      options: {
        language: 'zh',
        mode: 'precise',
        max_sentence_length: 120,
        target_duration: 4,
        base_words_per_second: 2.8,
        speech_rate: 1.2,
        min_words: 12,
        max_words: 40,
        enforce_sentence_boundary: false,
        overflow_to_next: false,
        fallback_to_local: true,
        require_scene_output: true,
        subtitle_min_chars: 8,
        subtitle_max_chars: 15,
      },
    },
    params: { text: '第一幕包含足够长的画面说明，随后继续补充细节。' },
    context: {},
  });

  expect(result).toMatchObject({
    success: true,
    output: {
      sceneSource: 'smart-sentence-splitter',
      subtitleSource: 'local-typescript',
      degraded: false,
    },
  });
  expect(result.output.scenes[0].subtitleBlocks.join('')).toBe(result.output.scenes[0].text);
  const sentOptions = bus.splitText.mock.calls[0][1];
  expect(sentOptions).toMatchObject({
    language: 'zh',
    mode: 'precise',
    config: {
      sentence_tokenizer: {
        max_sentence_length: 120,
        language_specific: {
          zh: { max_sentence_length: 120 },
          en: { max_sentence_length: 120 },
        },
      },
      scene: {
        target_seconds: 4,
        base_words_per_second: 2.8,
        speech_rate: 1.2,
        min_words_per_segment: 12,
        max_words_per_segment: 40,
        enforce_sentence_boundary: false,
        allow_single_sentence_overflow: false,
      },
    },
  });
  expect(sentOptions).not.toHaveProperty('fallback_to_local');
  expect(sentOptions).not.toHaveProperty('require_scene_output');
  expect(sentOptions).not.toHaveProperty('target_duration');
  expect(sentOptions).not.toHaveProperty('subtitle_min_chars');
});

it('Story2Video SPLIT 仅在 8002 不可用时降级到本地双层分句', async function () {
  const unavailable = new Error('connect ECONNREFUSED 127.0.0.1:8002');
  unavailable.code = 'ECONNREFUSED';
  const bus = makeMockServiceBus({
    splitText: vi.fn(async () => { throw unavailable; }),
  });
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const text = '第一句话用于建立场景。第二句话继续补充信息。第三句话切换画面。';
  const result = await exec.execute({
    runId: 'story-fallback',
    stage: {
      name: 'split',
      type: STAGE_TYPES.SPLIT,
      options: { fallback_to_local: true, require_scene_output: true },
    },
    params: { text },
    context: {},
  });

  expect(result).toMatchObject({
    success: true,
    output: {
      sceneSource: 'local-typescript-fallback',
      subtitleSource: 'local-typescript',
      degraded: true,
      fallbackReason: expect.stringContaining('ECONNREFUSED'),
    },
  });
  expect(result.output.scenes.map(scene => scene.text).join('')).toBe(text);
});

it.each([
  ['请求超时', Object.assign(new Error('splitterbridge request timeout'), { code: 'ETIMEDOUT' }), 'ETIMEDOUT'],
  ['连接重置', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }), 'ECONNRESET'],
])('Story2Video SPLIT 在 8002 %s时允许本地降级', async function (_label, unavailable, reason) {
  const bus = makeMockServiceBus({
    splitText: vi.fn(async () => { throw unavailable; }),
  });
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const text = '第一句话用于建立场景。第二句话继续补充信息。';
  const result = await exec.execute({
    runId: 'story-fallback-' + reason.toLowerCase(),
    stage: {
      name: 'split',
      type: STAGE_TYPES.SPLIT,
      options: { fallback_to_local: true, require_scene_output: true },
    },
    params: { text },
    context: {},
  });

  expect(result).toMatchObject({
    success: true,
    output: {
      sceneSource: 'local-typescript-fallback',
      subtitleSource: 'local-typescript',
      degraded: true,
      fallbackReason: expect.stringContaining(reason),
    },
  });
  expect(result.output.scenes.map(scene => scene.text).join('')).toBe(text);
});

it('Story2Video SPLIT 对 8002 业务错误禁止本地降级', async function () {
  const businessError = Object.assign(new Error('splitter service rejected invalid mode'), {
    code: 'ERR_BAD_REQUEST',
  });
  const bus = makeMockServiceBus({
    splitText: vi.fn(async () => { throw businessError; }),
  });
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'story-business-error',
    stage: {
      name: 'split',
      type: STAGE_TYPES.SPLIT,
      options: { fallback_to_local: true, require_scene_output: true },
    },
    params: { text: '业务错误必须暴露给调用方。' },
    context: {},
  });

  expect(result.success).toBe(false);
  expect(result.error).toContain('invalid mode');
  expect(result.output).toBeUndefined();
});

it('Story2Video SPLIT 对服务非法响应明确失败，不静默降级', async function () {
  const bus = makeMockServiceBus({
    splitText: vi.fn(async () => ({ code: 0, data: { unexpected: true } })),
  });
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'story-malformed',
    stage: {
      name: 'split',
      type: STAGE_TYPES.SPLIT,
      options: { fallback_to_local: true, require_scene_output: true },
    },
    params: { text: '服务合同不能被静默掩盖。' },
    context: {},
  });

  expect(result.success).toBe(false);
  expect(result.error).toMatch(/场景|响应|scenes/i);
});

it('SPLIT 音频模式在无文案时按音频数量生成场景', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'audio-run',
    stage: { name: 'split', type: STAGE_TYPES.SPLIT },
    params: {
      inputMode: 'audio',
      audio: [{ name: 'part-a.mp3', transcript: '识别后的第一段' }, { name: 'part-b.mp3' }],
    },
    context: {},
  });
  eq(result.success, true);
  eq(result.output.sentences.length, 2);
  eq(result.output.scenes[0].text, '识别后的第一段');
  eq(result.output.scenes[1].text, 'part-b.mp3');
  expect(bus.splitText).not.toHaveBeenCalled();
});

it('OPTIMIZE 阶段调用 serviceBus.optimizePrompt', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'opt', type: STAGE_TYPES.OPTIMIZE, inputFrom: 'prompt' },
    params: {},
    context: { prompt: '一只猫坐在窗台上' },
  });
  eq(result.success, true);
  eq(result.output.optimized, '一只猫坐在窗台上 [optimized]');
  expect(bus.optimizePrompt).toHaveBeenCalledOnce();
});

it('OPTIMIZE_BATCH 阶段需要数组输入', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  // 非数组输入应失败
  const r1 = await exec.execute({
    runId: 'r1',
    stage: { name: 'ob', type: STAGE_TYPES.OPTIMIZE_BATCH },
    params: { prompts: 'not_an_array' },
    context: {},
  });
  eq(r1.success, false);
  ok(/array/.test(r1.error), '错误信息应提示 array');
  // 数组输入应成功
  const r2 = await exec.execute({
    runId: 'r2',
    stage: { name: 'ob', type: STAGE_TYPES.OPTIMIZE_BATCH, inputFrom: 'prompts' },
    params: {},
    context: { prompts: ['prompt1', 'prompt2'] },
  });
  eq(r2.success, true);
  eq(r2.output.length, 2);
});

it('COMPOSE 阶段处理 code === 0 成功', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'compose', type: STAGE_TYPES.COMPOSE, inputFrom: 'assets' },
    params: {},
    context: { assets: { images: [], audio: [] } },
  });
  eq(result.success, true);
  eq(result.output.videoPath, '/tmp/out.mp4');
});

it('COMPOSE 阶段把用户选择的合成参数按白名单覆盖流水线默认值', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  await exec.execute({
    runId: 'compose-options',
    stage: { name: 'compose', type: STAGE_TYPES.COMPOSE, inputFrom: 'assets', options: { transition: 'fade' } },
    params: {
      transition: 'slide-left', imageEffect: 'pan-up', subtitleEnabled: false,
      defaultSceneDuration: 5, resolution: '1080x1920', fps: 25, voiceVolume: 0.8,
      untrustedOption: 'must-not-pass',
    },
    context: { assets: { scenes: [] } },
  });

  expect(bus.composeVideo).toHaveBeenCalledWith({ scenes: [] }, expect.objectContaining({
    transition: 'slide-left', imageEffect: 'pan-up', subtitleEnabled: false,
    defaultSceneDuration: 5, resolution: '1080x1920', fps: 25, voiceVolume: 0.8,
  }));
  expect(bus.composeVideo.mock.calls[0][1]).not.toHaveProperty('untrustedOption');
});

it('COMPOSE 阶段处理 code === -1 引擎不可用', async function () {
  const bus = makeMockServiceBus({
    composeVideo: async () => ({ code: -1, message: 'ffmpeg not found' }),
  });
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'compose', type: STAGE_TYPES.COMPOSE },
    params: {},
    context: {},
  });
  // 引擎不可用时返回失败
  eq(result.success, false);
  ok(/ffmpeg not found/.test(result.error));
});

it('CALL_SKILL 阶段需要 skillName', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  // 缺 skillName 应失败
  const r1 = await exec.execute({
    runId: 'r1',
    stage: { name: 'cs', type: STAGE_TYPES.CALL_SKILL },
    params: {},
    context: {},
  });
  eq(r1.success, false);
  ok(/skillName/.test(r1.error));
  // 正常调用
  const r2 = await exec.execute({
    runId: 'r2',
    stage: { name: 'cs', type: STAGE_TYPES.CALL_SKILL, skillName: 'generate_script' },
    params: { topic: 'AI' },
    context: {},
  });
  eq(r2.success, true);
  eq(r2.output.skill, 'generate_script');
});

it('MANUAL_CHECKPOINT 阶段返回 checkpoint: true', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'review', type: STAGE_TYPES.MANUAL_CHECKPOINT },
    params: {},
    context: {},
  });
  eq(result.success, true);
  eq(result.checkpoint, true);
  eq(result.output, null);
});

it('未知 stage.type 回退为 MANUAL_CHECKPOINT', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'unknown_stage', type: 'totally_unknown_type' },
    params: {},
    context: {},
  });
  eq(result.success, true);
  eq(result.checkpoint, true);
});

it('无 stage.type 回退为 MANUAL_CHECKPOINT（向后兼容）', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'research' }, // 旧流水线只有 name
    params: {},
    context: {},
  });
  eq(result.success, true);
  eq(result.checkpoint, true);
});

it('CUSTOM 阶段调用 stage.executor 函数', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'r1',
    stage: {
      name: 'custom_step',
      type: STAGE_TYPES.CUSTOM,
      executor: async ({ params, context }) => ({ success: true, output: { doubled: params.x * 2, ctx: context.previous } }),
    },
    params: { x: 21 },
    context: { previous: 'hello' },
  });
  eq(result.success, true);
  eq(result.output.doubled, 42);
  eq(result.output.ctx, 'hello');
});

it('CUSTOM 阶段缺 executor 函数应失败', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'cs', type: STAGE_TYPES.CUSTOM },
    params: {},
    context: {},
  });
  eq(result.success, false);
  ok(/executor/.test(result.error));
});

it('执行器抛异常被捕获返回 success:false', async function () {
  const bus = makeMockServiceBus({
    splitText: async () => { throw new Error('mock split failure'); },
  });
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'split', type: STAGE_TYPES.SPLIT, inputFrom: 'text' },
    params: {},
    context: { text: 'hello' },
  });
  eq(result.success, false);
  ok(/mock split failure/.test(result.error));
});

// ============================================================
// 3. 自定义执行器注册
// ============================================================

it('register 注册自定义执行器优先于内置', async function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const customExecutor = vi.fn(async () => ({ success: true, output: 'custom_split_result' }));
  exec.register(STAGE_TYPES.SPLIT, customExecutor);
  const result = await exec.execute({
    runId: 'r1',
    stage: { name: 'split', type: STAGE_TYPES.SPLIT },
    params: {},
    context: {},
  });
  expect(customExecutor).toHaveBeenCalledOnce();
  eq(result.output, 'custom_split_result');
  expect(bus.splitText).not.toHaveBeenCalled();
});

it('register 非函数应抛错', function () {
  const bus = makeMockServiceBus();
  const exec = new StageExecutor({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  expect(() => exec.register('bad_type', 'not_a_function')).toThrow(/function/);
});

// ============================================================
// 4. PipelineEngine 编排模式
// ============================================================

it('PipelineEngine 无参构造仍可工作（向后兼容）', function () {
  const pe = new PipelineEngine();
  eq(pe.stageExecutor, null);
  eq(pe.serviceBus, null);
  // state_machine 模式仍可用
  const r = pe.start('animated-explainer', {});
  eq(r.success, true);
});

it('PipelineEngine 注入 serviceBus 后自动构造 StageExecutor', function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  ok(pe.stageExecutor !== null, 'StageExecutor 应已构造');
  ok(pe.stageExecutor instanceof StageExecutor);
});

it('startOrchestrated 在无 stageExecutor 时返回错误', async function () {
  const pe = new PipelineEngine(); // 无 serviceBus
  const r = await pe.startOrchestrated('animated-explainer', {});
  eq(r.success, false);
  ok(/StageExecutor/.test(r.error));
});

it('startOrchestrated 在未知流水线时返回错误', async function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const r = await pe.startOrchestrated('nonexistent', {});
  eq(r.success, false);
  ok(/Unknown pipeline/.test(r.error));
});

it('startOrchestrated 手动模式（autoAdvance=false）只创建 run', async function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const r = await pe.startOrchestrated('framework-smoke', { autoAdvance: false });
  eq(r.success, true);
  ok(r.runId, '应返回 runId');
  // 第一个阶段未执行（手动模式）
  const status = pe.getStatus('framework-smoke');
  eq(status.orchestrationMode, 'orchestrator');
  eq(status.status, 'running');
});

it('startOrchestrated + autoAdvance 自动执行全部阶段（旧流水线回退为 checkpoint）', async function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  // framework-smoke 有 2 个阶段：verify, report（无 stage.type，回退为 MANUAL_CHECKPOINT）
  const r = await pe.startOrchestrated('framework-smoke', { autoAdvance: true });
  eq(r.success, true);
  eq(r.paused, true, '应在第一个 MANUAL_CHECKPOINT 暂停');
  ok(r.results.length >= 1, '至少执行了 1 个阶段');
  eq(r.results[0].checkpoint, true);
});

it('executeStage 在非编排模式 run 上返回错误', async function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  pe.start('animated-explainer', {}); // state_machine 模式
  // 获取 runId（通过 status）
  const status = pe.getStatus('animated-explainer');
  const r = await pe.executeStage(status.id);
  eq(r.success, false);
  ok(/orchestrator mode/.test(r.error));
});

it('executeStage 执行单个阶段并将输出写入 context', async function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });

  // 动态注册带 stageDefs 的测试流水线
  pe.registerPipeline({
    name: 'test-call-skill-pipeline',
    description: '测试 CALL_SKILL 阶段',
    category: 'custom',
    stages: ['verify', 'report'],
    stageDefs: [
      { name: 'verify', type: STAGE_TYPES.CALL_SKILL, skillName: 'verify_pipeline' },
      { name: 'report', type: STAGE_TYPES.MANUAL_CHECKPOINT },
    ],
  });

  const startR = await pe.startOrchestrated('test-call-skill-pipeline', { autoAdvance: false });
  const runId = startR.runId;
  const r = await pe.executeStage(runId);
  eq(r.success, true);
  ok(r.output, '应返回 output');
  eq(r.output.skill, 'verify_pipeline');
  // context 应包含 verify 阶段的输出
  const ctx = pe.getRunContext(runId);
  ok(ctx.verify, 'context 应有 verify 键');
  eq(ctx.verify.skill, 'verify_pipeline');
});

it('advanceToNextCheckpoint 推进到检查点', async function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  pe.registerPipeline({
    name: 'test-advance-checkpoint-pipeline',
    description: '测试 advanceToNextCheckpoint',
    category: 'custom',
    stages: ['verify', 'report'],
    stageDefs: [
      { name: 'verify', type: STAGE_TYPES.CALL_SKILL, skillName: 'verify_pipeline' },
      { name: 'report', type: STAGE_TYPES.MANUAL_CHECKPOINT },
    ],
  });
  const startR = await pe.startOrchestrated('test-advance-checkpoint-pipeline', { autoAdvance: false });
  const r = await pe.advanceToNextCheckpoint(startR.runId);
  eq(r.success, true);
  ok(r.results.length >= 1, '至少执行了 1 个阶段');
  eq(r.paused, true, '应在 report 检查点暂停');
});

it('executeStage 遇到检查点时暂停，不提前推进或重复执行', async function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  pe.registerPipeline({
    name: 'test-execute-checkpoint-pipeline',
    description: '测试 executeStage 检查点',
    category: 'custom',
    stages: ['review', 'done'],
    stageDefs: [
      { name: 'review', type: STAGE_TYPES.MANUAL_CHECKPOINT, checkpointRequired: true },
      { name: 'done', type: STAGE_TYPES.CALL_SKILL, skillName: 'verify_pipeline' },
    ],
  });
  const startR = await pe.startOrchestrated('test-execute-checkpoint-pipeline', { autoAdvance: false });
  const result = await pe.executeStage(startR.runId);
  eq(result.success, true);
  ok(result.checkpoint, '应返回 checkpoint');
  const snapshot = pe.getRunSnapshot(startR.runId);
  eq(snapshot.status.status, 'paused');
  eq(snapshot.currentStage, 0);
  eq(snapshot.stages[0].status, 'paused');
  eq(bus.callPythonSkill.mock.calls.length, 0, '下一阶段不应被提前执行');
});

it('pauseWithCheckpoint 保存 context 快照', async function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  pe.registerPipeline({
    name: 'test-pause-checkpoint-pipeline',
    description: '测试 pauseWithCheckpoint',
    category: 'custom',
    stages: ['verify', 'report'],
    stageDefs: [
      { name: 'verify', type: STAGE_TYPES.CALL_SKILL, skillName: 'verify_pipeline' },
      { name: 'report', type: STAGE_TYPES.MANUAL_CHECKPOINT },
    ],
  });
  const startR = await pe.startOrchestrated('test-pause-checkpoint-pipeline', { autoAdvance: false });
  await pe.executeStage(startR.runId); // 执行 verify
  const pauseR = pe.pauseWithCheckpoint();
  eq(pauseR.success, true);
  ok(pauseR.checkpoint, '应有 checkpoint');
  ok(pauseR.checkpoint.context, 'checkpoint 应含 context');
  ok(pauseR.checkpoint.context.verify, 'checkpoint context 应含 verify 输出');
});

it('resumeFromCheckpoint 恢复 context', async function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  pe.registerPipeline({
    name: 'test-resume-checkpoint-pipeline',
    description: '测试 resumeFromCheckpoint',
    category: 'custom',
    stages: ['verify', 'report'],
    stageDefs: [
      { name: 'verify', type: STAGE_TYPES.CALL_SKILL, skillName: 'verify_pipeline' },
      { name: 'report', type: STAGE_TYPES.MANUAL_CHECKPOINT },
    ],
  });
  const startR = await pe.startOrchestrated('test-resume-checkpoint-pipeline', { autoAdvance: false });
  await pe.executeStage(startR.runId);
  pe.pauseWithCheckpoint();
  // 清空 context 模拟崩溃后重启
  const run = pe._runs.get(startR.runId);
  run.context = {};
  const r = pe.resumeFromCheckpoint();
  eq(r.success, true);
  const ctx = pe.getRunContext(startR.runId);
  ok(ctx.verify, 'context 应从 checkpoint 恢复 verify 输出');
});

it('registerStageExecutor 插件扩展点', async function () {
  const bus = makeMockServiceBus();
  const pe = new PipelineEngine({ serviceBus: bus, log: { info() {}, warn() {}, error() {} } });
  const pluginExecutor = vi.fn(async ({ params }) => ({
    success: true,
    output: { custom: params.foo },
  }));
  pe.registerStageExecutor('my_custom_type', pluginExecutor);
  // 注册一个使用自定义 stage 类型的流水线
  pe.registerPipeline({
    name: 'test-plugin-stage-pipeline',
    description: '测试插件 stage 扩展',
    category: 'custom',
    stages: ['custom_step'],
    stageDefs: [{ name: 'custom_step', type: 'my_custom_type' }],
  });
  const startR = await pe.startOrchestrated('test-plugin-stage-pipeline', { autoAdvance: false, foo: 'bar' });
  const r = await pe.executeStage(startR.runId);
  expect(pluginExecutor).toHaveBeenCalledOnce();
  eq(r.output.custom, 'bar');
});

it('registerPipeline 动态注册流水线', function () {
  const pe = new PipelineEngine();
  // 注册新流水线
  const r1 = pe.registerPipeline({
    name: 'test-dynamic-pipeline',
    description: '动态注册测试',
    category: 'custom',
    stages: ['step1', 'step2'],
  });
  eq(r1.success, true);
  // 在 listPipelines 中应可见
  const list = pe.listPipelines();
  ok(list.find(p => p.name === 'test-dynamic-pipeline'), '动态注册的流水线应在 list 中');
  // 重复注册应失败
  const r2 = pe.registerPipeline({ name: 'test-dynamic-pipeline', stages: ['x'] });
  eq(r2.success, false);
  ok(/already exists/.test(r2.error));
  // 缺 stages 应失败
  const r3 = pe.registerPipeline({ name: 'bad-pipeline' });
  eq(r3.success, false);
  ok(/stages/.test(r3.error));
});

it('registerPipeline 注册的流水线可启动和推进', function () {
  const pe = new PipelineEngine();
  pe.registerPipeline({
    name: 'test-runnable-dynamic',
    description: '可运行动态流水线',
    category: 'custom',
    stages: ['init', 'process', 'finalize'],
    estimatedCost: 'low',
  });
  const r = pe.start('test-runnable-dynamic', { foo: 1 });
  eq(r.success, true);
  for (let i = 0; i < 3; i++) {
    eq(pe.advance().success, true);
  }
  eq(pe.getStatus('test-runnable-dynamic').status, 'idle');
});

it('registerStageExecutor 在无 stageExecutor 时返回错误', function () {
  const pe = new PipelineEngine(); // 无 serviceBus
  const r = pe.registerStageExecutor('x', () => {});
  eq(r.success, false);
  ok(/StageExecutor/.test(r.error));
});

// ============================================================
// 5. 现有 14 条流水线回归（state_machine 模式）
// ============================================================

it('现有 14 条流水线在 state_machine 模式下全部可启动', function () {
  const pe = new PipelineEngine(); // 无 serviceBus，纯状态机
  const list = pe.listPipelines();
  eq(list.length, 14, '应有 14 条流水线（含 story2video-compose）');
  for (const pl of list) {
    const r = pe.start(pl.name, { test: true });
    eq(r.success, true, pl.name + ' 应可启动');
    pe.cancel();
  }
});

it('story2video-compose 流水线已注册为第 14 条', function () {
  const pe = new PipelineEngine();
  const list = pe.listPipelines();
  const s2v = list.find(p => p.name === 'story2video-compose');
  ok(s2v, 'story2video-compose 应存在于流水线列表');
  eq(s2v.category, 'generated');
  const detail = pe.getPipeline('story2video-compose');
  eq(detail.stages.length, 6);
  eq(detail.stageDefs[0].name, 'split');
  eq(detail.stageDefs[1].name, 'domain_enrich');
  eq(detail.stageDefs[2].name, 'optimize');
  eq(detail.stageDefs[3].name, 'generate_assets');
  eq(detail.stageDefs[4].name, 'compose');
  eq(detail.stageDefs[5].name, 'publish');
});

it('现有 14 条流水线可完整 advance 到完成', function () {
  const pe = new PipelineEngine();
  const list = pe.listPipelines();
  for (const pl of list) {
    pe.start(pl.name, {});
    const detail = pe.getPipeline(pl.name);
    for (let i = 0; i < detail.stages.length; i++) {
      const r = pe.advance();
      eq(r.success, true, pl.name + ' stage ' + i + ' 应可推进');
    }
    // 最后一次 advance 应返回 completed
    const status = pe.getStatus(pl.name);
    eq(status.status, 'idle', pl.name + ' 完成后应回到 idle');
  }
});

})
