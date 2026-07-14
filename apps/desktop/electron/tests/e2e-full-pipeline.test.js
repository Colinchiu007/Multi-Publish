// @ts-check
/**
 * E2E 全链路测试 - story2video-compose 管线真实执行
 *
 * 测试范围：
 *   1. split (Python 8002) → 真实分句
 *   2. optimize (Python 8013) → 真实提示词优化
 *   3. generate_assets (Node.js AssetGenerator) → 真实图片+TTS 文件
 *   4. compose (ffmpeg) → 真实视频文件
 *
 * 前置条件：
 *   - smart-sentence-splitter 运行在 8002
 *   - prompt-engine 运行在 8013
 *   - ffmpeg 可用
 */
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ServiceBus = require('../services/service-bus');
const { StageExecutor, STAGE_TYPES } = require('../services/stage-executor');
const { PipelineEngine } = require('../services/pipeline-engine');
const { registerStory2VideoStages } = require('../services/story2video-stages');
const { AssetGenerator } = require('../services/asset-generator');
const { Story2VideoComposeEngine } = require('../services/story2video-compose-engine');
const SplitterBridge = require('../services/splitter-bridge');
const PromptBridge = require('../services/prompt-bridge');

const noopLog = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

// P2-8: 收集测试创建的临时文件路径，afterEach 统一清理
const _tmpFiles = [];
const _tmpDirs = [
  path.join(os.tmpdir(), 'story2video', 'assets'), // AssetGenerator 输出
  path.join(os.tmpdir(), 'story2video'),           // ComposeEngine outputDir
];

afterEach(() => {
  // 清理收集的文件
  for (const f of _tmpFiles) {
    try { fs.unlinkSync(f); } catch (_) { /* 已删除或不存在 */ }
  }
  _tmpFiles.length = 0;

  // 清理 assets 目录下的残留文件（img_*.png / tts_*.mp3）
  for (const dir of _tmpDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) continue; // 不递归子目录（sessionDir 由 ComposeEngine 自管）
        if (entry.name.startsWith('img_') || entry.name.startsWith('tts_') || entry.name.endsWith('_output.mp4')) {
          try { fs.unlinkSync(fullPath); } catch (_) { /* ignore */ }
        }
      }
    } catch (_) { /* 目录不存在或无权限 */ }
  }
});

const TEST_TEXT = '人工智能正在改变世界。从自动驾驶到智能助手，AI 技术已经深入我们生活的方方面面。未来十年，AI 将带来更多惊喜。';

async function buildRealContext() {
  const splitterBridge = new SplitterBridge({ port: 8002, log: noopLog });
  const promptBridge = new PromptBridge({ port: 8013, log: noopLog });

  const splitterOk = await splitterBridge.attach();
  const promptOk = await promptBridge.attach();
  if (!splitterOk || !promptOk) {
    throw new Error('Bridges not available (splitter=' + splitterOk + ', prompt=' + promptOk + ')');
  }

  const assetGenerator = new AssetGenerator({ log: noopLog });
  const composeEngine = new Story2VideoComposeEngine({ log: noopLog });

  const serviceBus = new ServiceBus({
    splitterBridge, promptBridge,
    story2videoEngine: composeEngine,
    log: noopLog,
  });
  serviceBus._assetGenerator = assetGenerator;

  return { serviceBus, splitterBridge, promptBridge, assetGenerator, composeEngine };
}

test('E2E: split → optimize → generate_assets → compose 全链路', { timeout: 120000 }, async () => {
  const { serviceBus, assetGenerator, composeEngine } = await buildRealContext();

  // --- Stage 1: SPLIT ---
  const splitResult = await serviceBus.splitText(TEST_TEXT, { mode: 'semantic' });
  assert.ok(splitResult, 'split result should exist');
  // 适配两种响应格式
  const splitOutput = splitResult.code === 0 ? splitResult.data : splitResult;
  assert.ok(splitOutput.scenes || splitOutput.sentences, 'split should produce scenes or sentences');
  const sentences = splitOutput.scenes || splitOutput.sentences;
  console.log('  [split] ' + sentences.length + ' scenes');

  // --- Stage 2: OPTIMIZE_BATCH ---
  const prompts = sentences.map(s => s.text || s).filter(Boolean);
  assert.ok(prompts.length > 0, 'should have prompts to optimize');
  const optimizeResult = await serviceBus.optimizePromptsBatch(prompts, { style: 'realistic' });
  assert.ok(optimizeResult, 'optimize result should exist');
  const optimizeOutput = optimizeResult.code === 0 ? optimizeResult.data : optimizeResult;
  const optimizedPrompts = Array.isArray(optimizeOutput) ? optimizeOutput :
    (Array.isArray(optimizeOutput.results) ? optimizeOutput.results : [optimizeOutput]);
  assert.ok(optimizedPrompts.length > 0, 'should have optimized prompts');
  console.log('  [optimize] ' + optimizedPrompts.length + ' prompts optimized');

  // --- Stage 3: GENERATE_ASSETS (真实文件) ---
  const imagePromises = optimizedPrompts.slice(0, 3).map((p, i) => {
    const promptText = typeof p === 'string' ? p : p.optimized_prompt || p.prompt || String(p);
    return assetGenerator.generateImage(promptText, { style: 'cinematic', index: i, aspect_ratio: '16:9' });
  });
  const imageResults = await Promise.all(imagePromises);
  assert.ok(imageResults.every(r => r.code === 0), 'all images should succeed');
  assert.ok(imageResults.every(r => fs.existsSync(r.data.path)), 'image files should exist');
  // P2-8: 收集图片文件供 afterEach 清理
  imageResults.forEach(r => _tmpFiles.push(r.data.path));
  console.log('  [generate_assets] ' + imageResults.length + ' images created');

  const ttsPromises = prompts.slice(0, 3).map((text, i) =>
    assetGenerator.generateTTS(text, { voice_id: 'zh-CN-XiaoxiaoNeural', index: i })
  );
  const ttsResults = await Promise.all(ttsPromises);
  assert.ok(ttsResults.every(r => r.code === 0), 'all TTS should succeed');
  assert.ok(ttsResults.every(r => fs.existsSync(r.data.path)), 'TTS files should exist');
  // P2-8: 收集 TTS 文件供 afterEach 清理
  ttsResults.forEach(r => _tmpFiles.push(r.data.path));
  console.log('  [generate_assets] ' + ttsResults.length + ' TTS clips created');

  // --- Stage 4: COMPOSE (真实视频) ---
  const assetManifest = {
    images: imageResults.map((r, i) => ({ index: i, success: true, path: r.data.path, meta: r.data })),
    audio: ttsResults.map((r, i) => ({ index: i, success: true, path: r.data.path, duration: r.data.duration, meta: r.data })),
    sentences: prompts.slice(0, 3).map((text, i) => ({
      index: i, text,
      audioPath: ttsResults[i].data.path,
      duration: ttsResults[i].data.duration,
    })),
    optimizedPrompts: optimizedPrompts.slice(0, 3).map((p, i) => ({
      index: i,
      prompt: typeof p === 'string' ? p : p.optimized_prompt || p.prompt,
      imagePath: imageResults[i].data.path,
    })),
    stats: {
      totalImages: 3, successImages: 3,
      totalTts: 3, successTts: 3,
    },
  };

  const composeResult = await composeEngine.compose(assetManifest, {
    transition: 'fade', subtitleEnabled: true,
  });
  assert.strictEqual(composeResult.code, 0, 'compose should succeed');
  assert.ok(fs.existsSync(composeResult.data.videoPath), 'video file should exist');
  assert.ok(composeResult.data.fileSize > 0, 'video file should not be empty');
  // P2-8: 收集视频文件供 afterEach 清理
  _tmpFiles.push(composeResult.data.videoPath);
  console.log('  [compose] video created: ' + composeResult.data.fileSize + ' bytes, ' +
    composeResult.data.segmentCount + ' segments');

  console.log('  === E2E FULL PIPELINE PASSED ===');
});
