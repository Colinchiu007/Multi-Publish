// E2E 集成测试 - 验证 Electron 端 Bridge 能连通已启动的 Python 服务
// 前置条件：smart-sentence-splitter 已在 8002 启动，prompt-engine 已在 8013 启动

const { test } = require('node:test');
const assert = require('node:assert/strict');
const SplitterBridge = require('../services/splitter-bridge');
const PromptBridge = require('../services/prompt-bridge');

test('SplitterBridge - attach() 能附加到外部已运行的 8002 端口服务', async () => {
  const bridge = new SplitterBridge({});
  const attached = await bridge.attach();
  assert.ok(attached, '应成功附加到外部 splitter 服务');
  assert.ok(bridge.isRunning, 'attach 后 isRunning 应为 true');
});

test('SplitterBridge - split() 返回正确的分句结果', async () => {
  const bridge = new SplitterBridge({});
  await bridge.attach();
  const result = await bridge.split('今天天气真好。我们去公园玩吧！孩子们很开心。');
  assert.ok(result, '应返回结果');
  assert.ok(result.scenes, '应包含 scenes 数组');
  assert.ok(result.scenes.length > 0, 'scenes 应非空');
  assert.ok(result.sentences, '应包含 sentences 数组');
  console.log('  分句场景数:', result.scenes.length);
  console.log('  句子数:', result.sentences?.length);
  console.log('  使用 tier:', result.tier_used);
});

test('PromptBridge - attach() 能附加到外部已运行的 8013 端口服务', async () => {
  const bridge = new PromptBridge({});
  const attached = await bridge.attach();
  assert.ok(attached, '应成功附加到外部 prompt-engine 服务');
  assert.ok(bridge.isRunning, 'attach 后 isRunning 应为 true');
});

test('PromptBridge - optimize() 返回优化结果', async () => {
  const bridge = new PromptBridge({});
  await bridge.attach();
  const result = await bridge.optimize({ prompt: 'a cat sitting on a chair' });
  assert.ok(result, '应返回结果');
  assert.ok(result.optimized_prompt !== undefined, '应包含 optimized_prompt 字段');
  console.log('  优化结果:', result.optimized_prompt?.substring(0, 80));
  console.log('  平台:', result.platform);
  console.log('  模型:', result.model_used);
});

test('SplitterBridge + PromptBridge 串联调用（模拟 story2video-compose 的 split -> optimize）', async () => {
  const splitter = new SplitterBridge({});
  const prompter = new PromptBridge({});
  await splitter.attach();
  await prompter.attach();

  // Step 1: 分句
  const splitResult = await splitter.split('美丽的日落。海边的椰子树。远处的帆船。');
  assert.ok(splitResult.scenes?.length > 0, '分句应产生至少 1 个场景');

  // Step 2: 对每个场景生成并优化提示词
  const optimizedPrompts = [];
  for (const scene of splitResult.scenes) {
    const optResult = await prompter.optimize({ prompt: scene.text });
    optimizedPrompts.push(optResult.optimized_prompt);
  }

  assert.equal(optimizedPrompts.length, splitResult.scenes.length, '优化数量应等于场景数');
  console.log('  场景数:', splitResult.scenes.length);
  console.log('  优化提示词数:', optimizedPrompts.length);
  console.log('  端到端串联调用成功');
});
