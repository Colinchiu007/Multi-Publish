// @ts-check
/**
 * story2video-stages - Story2Video-compose 流水线的自定义阶段执行器
 *
 * 注册与 story2video-compose 流水线配套的自定义 STAGE_TYPES：
 *   - story2video_generate_assets: 并行生成图片 + TTS 音频
 *
 * 设计意图：
 *   split / optimize / compose / publish 阶段使用 StageExecutor 内置类型，
 *   只有 generate_assets 需要并行编排（图片+TTS 同时生成），故注册为自定义执行器。
 *
 * 注册方式：
 *   在 bootstrap.js 或 container.setup.js 中调用 registerStory2VideoStages(pipelineEngine)
 */

'use strict';

const { STAGE_TYPES } = require('./stage-executor');
const { enrichHistoryScenes, passthroughScenes } = require('./story2video-domain');
const {
  MAX_SCENES,
  getAllowedMediaRoots,
  resolveReadableMediaFile,
  writeDataImage,
} = require('./story2video-paths');

/**
 * Story2Video-compose 专用的阶段类型
 */
const STORY2VIDEO_STAGE_TYPES = {
  DOMAIN_ENRICH: 'story2video_domain_enrich',
  GENERATE_ASSETS: 'story2video_generate_assets',
};

const MAX_ASSET_CONCURRENCY = 8;

function normalizeAssetConcurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 3;
  return Math.min(MAX_ASSET_CONCURRENCY, Math.max(1, Math.floor(number)));
}

/** 将 renderer 传入的图片路径或 data URL 解析为主进程可读的本地文件。 */
function resolveInputImage(source, runId, index, options = {}) {
  const candidate = typeof source === 'object' && source !== null
    ? (source.path || source.filePath || source.preview || source.url)
    : source;
  if (typeof candidate !== 'string' || !candidate) return null;

  if (/^data:/i.test(candidate)) {
    try {
      return writeDataImage(candidate, runId, index, options);
    } catch {
      return null;
    }
  }

  return resolveReadableMediaFile(candidate, {
    kind: 'image',
    allowedRoots: options.allowedRoots || getAllowedMediaRoots(),
    maxBytes: options.maxBytes,
  });
}

/** 将 renderer 传入的音频路径解析为主进程可读的本地文件。 */
function resolveInputAudio(source, options = {}) {
  const candidate = typeof source === 'object' && source !== null
    ? (source.path || source.filePath || source.audioPath || source.url)
    : source;
  if (typeof candidate !== 'string' || !candidate) return null;
  return resolveReadableMediaFile(candidate, {
    kind: 'audio',
    allowedRoots: options.allowedRoots || getAllowedMediaRoots(),
    maxBytes: options.maxBytes,
  });
}

function normalizeAssetResult(result, pathKeys) {
  if (!result || result.code < 0 || result.success === false) return null;
  const data = result.code === 0
    ? (result.data || result)
    : (result.data && typeof result.data === 'object' ? result.data : result);
  const assetPath = pathKeys.map(key => data && data[key]).find(Boolean);
  if (typeof assetPath !== 'string' || !assetPath) return null;
  return { path: assetPath, duration: data.duration, meta: data };
}

/**
 * 注册 Story2Video-compose 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例（需已注入 serviceBus）
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerStory2VideoStages(pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return {
      success: false,
      error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)',
    };
  }

  const registered = [];

  // ----------------------------------------------------------
  // DOMAIN_ENRICH - 历史内容领域增强（可选）
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    STORY2VIDEO_STAGE_TYPES.DOMAIN_ENRICH,
    async ({ stage, params, context }) => {
      params = params || {};
      const source = context.split || context.sentences || [];
      const scenes = Array.isArray(source)
        ? source
        : (source.scenes || source.sentences || []);
      const contentType = params.contentType || stage.options?.contentType || 'general';
      if (contentType !== 'history') {
        return { success: true, output: passthroughScenes(scenes) };
      }
      return { success: true, output: enrichHistoryScenes(scenes) };
    },
  );
  registered.push(STORY2VIDEO_STAGE_TYPES.DOMAIN_ENRICH);

  // ----------------------------------------------------------
  // GENERATE_ASSETS - 并行图片 + TTS 生成
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS,
    async ({ runId, stage, params, context, serviceBus }) => {
      const log = pipelineEngine.log;
      params = params || {};

      // 从 context 获取前序阶段的输出
      let optimizedPrompts = context.optimize || context.optimized_prompts;
      let sentences = context.domain_enrich || context.split || context.sentences;

      // 兼容 prompt-engine 的包装响应 { results } / { data: { results } }
      if (!Array.isArray(optimizedPrompts)) {
        const wrapped = optimizedPrompts && optimizedPrompts.data
          ? optimizedPrompts.data
          : optimizedPrompts;
        if (Array.isArray(wrapped?.results)) optimizedPrompts = wrapped.results;
        else if (Array.isArray(wrapped?.optimized_prompts)) optimizedPrompts = wrapped.optimized_prompts;
      }

      // 适配 split 阶段输出：{ scenes: [...], sentences: [...], ... }（对象，非数组）
      // 与 stage-executor.js 中 OPTIMIZE_BATCH 的适配逻辑一致
      if (sentences && !Array.isArray(sentences)) {
        if (Array.isArray(sentences.scenes)) {
          sentences = sentences.scenes;
        } else if (Array.isArray(sentences.sentences)) {
          sentences = sentences.sentences;
        }
      }

      if (!Array.isArray(optimizedPrompts) || optimizedPrompts.length === 0) {
        return {
          success: false,
          error: 'generate_assets 需要 context.optimize (优化后的提示词数组)',
        };
      }
      if (!Array.isArray(sentences) || sentences.length === 0) {
        return {
          success: false,
          error: 'generate_assets 需要 context.split (分句结果数组)',
        };
      }
      const requestedScenes = Math.max(optimizedPrompts.length, sentences.length);
      if (requestedScenes > MAX_SCENES) {
        return {
          success: false,
          error: 'generate_assets scene count exceeds the allowed limit: ' + MAX_SCENES,
        };
      }

      const firstDefined = (...values) => values.find(v => v !== undefined && v !== null);
      const concurrency = normalizeAssetConcurrency(firstDefined(params.concurrency, stage.options?.concurrency, 3));
      const imageStyle = firstDefined(params.imageStyle, stage.options?.imageStyle, 'cinematic');
      const imageProvider = firstDefined(params.imageProvider, stage.options?.imageProvider);
      const imageModel = firstDefined(params.imageModel, stage.options?.imageModel);
      const aspectRatio = firstDefined(params.aspectRatio, stage.options?.aspectRatio, '16:9');
      const voiceId = firstDefined(params.voiceId, stage.options?.voiceId, 'default');
      const inputMode = firstDefined(params.inputMode, stage.options?.inputMode, 'text');
      const inputImages = Array.isArray(params.images)
        ? params.images
        : (Array.isArray(stage.options?.images) ? stage.options.images : []);
      const inputAudio = Array.isArray(params.audio)
        ? params.audio
        : (Array.isArray(stage.options?.audio) ? stage.options.audio : []);
      const allowPartialAssets = params.allowPartialAssets === true || stage.options?.allowPartialAssets === true;

      log.info('Story2VideoStages',
        'Generating assets: ' + optimizedPrompts.length + ' images + ' +
        sentences.length + ' TTS (concurrency=' + concurrency + ')');

      // 并行生成图片（分批控制并发）
      // 使用 AssetGenerator（ffmpeg 占位图）替代 serviceBus.callPythonSkill
      const assetGenerator = pipelineEngine._assetGenerator || serviceBus._assetGenerator;
      const imagePromise = _mapWithConcurrency(
        optimizedPrompts,
        concurrency,
        async (prompt, index) => {
          try {
            const promptText = typeof prompt === 'string' ? prompt : prompt.prompt || prompt.optimized_prompt || prompt.optimized;
            if (inputMode === 'images' && inputImages[index] !== undefined) {
              const suppliedPath = resolveInputImage(inputImages[index], runId, index);
              if (!suppliedPath) {
                return { index, success: false, error: 'Supplied image is missing, unreadable, or too large' };
              }
              return { index, success: true, path: suppliedPath, meta: { supplied: true } };
            }
            const result = assetGenerator
              ? await assetGenerator.generateImage(promptText, {
                  style: imageStyle,
                  image_provider: imageProvider,
                  image_model: imageModel,
                  index,
                   aspect_ratio: aspectRatio,
                   runId,
                })
              : await serviceBus.callPythonSkill('generate_image', {
                   prompt: promptText, style: imageStyle, image_provider: imageProvider, image_model: imageModel, index,
                   aspect_ratio: aspectRatio, runId,
                });
            const normalized = normalizeAssetResult(result, ['path', 'url', 'image_path']);
            if (normalized) {
              return {
                index,
                success: true,
                path: normalized.path,
                meta: normalized.meta,
              };
            }
            return {
              index,
              success: false,
              error: (result && result.message) || 'Image generation failed',
            };
          } catch (e) {
            return { index, success: false, error: e.message };
          }
        }
      );

      // 并行生成 TTS 音频（分批控制并发）
      const ttsPromise = _mapWithConcurrency(
        sentences,
        concurrency,
        async (sentence, index) => {
          try {
            const suppliedAudio = inputAudio[index]
            if (suppliedAudio !== undefined) {
              const suppliedPath = resolveInputAudio(suppliedAudio)
              if (!suppliedPath) {
                return { index, success: false, error: 'Supplied audio is missing or unreadable' };
              }
              return {
                index,
                success: true,
                path: suppliedPath,
                duration: typeof suppliedAudio === 'object' ? suppliedAudio.duration : null,
                meta: { supplied: true },
              };
            }
            const text = typeof sentence === 'string' ? sentence : sentence.text || sentence.content;
            const result = assetGenerator
              ? await assetGenerator.generateTTS(text, {
                  voice_id: voiceId,
                  voice_provider: firstDefined(params.voiceProvider, stage.options?.voiceProvider),
                  rate: firstDefined(params.voiceSpeed, stage.options?.voiceSpeed),
                  pitch: firstDefined(params.voicePitch, stage.options?.voicePitch),
                  emotion: firstDefined(params.voiceEmotion, stage.options?.voiceEmotion),
                  index,
                  runId,
                })
              : await serviceBus.callPythonSkill('generate_tts', {
                  text,
                  voice_id: voiceId,
                  voice_provider: firstDefined(params.voiceProvider, stage.options?.voiceProvider),
                  rate: firstDefined(params.voiceSpeed, stage.options?.voiceSpeed),
                  pitch: firstDefined(params.voicePitch, stage.options?.voicePitch),
                  emotion: firstDefined(params.voiceEmotion, stage.options?.voiceEmotion),
                  index,
                  runId,
                });
            const normalized = normalizeAssetResult(result, ['path', 'audio_path']);
            if (normalized) {
              return {
                index,
                success: true,
                path: normalized.path,
                duration: normalized.duration,
                meta: normalized.meta,
              };
            }
            return {
              index,
              success: false,
              error: (result && result.message) || 'TTS generation failed',
            };
          } catch (e) {
            return { index, success: false, error: e.message };
          }
        }
      );
      const [imageResults, ttsResults] = await Promise.all([imagePromise, ttsPromise]);

      // 检查失败
      const failedImages = imageResults.filter(r => !r.success);
      const failedTts = ttsResults.filter(r => !r.success);
      if (failedImages.length > 0 || failedTts.length > 0) {
        log.warn('Story2VideoStages',
          'Asset generation had failures: ' + failedImages.length + ' images, ' +
          failedTts.length + ' TTS');
      }

      // 以 scene index 配对图片和音频，避免独立过滤后发生错位。
      const pairedScenes = [];
      const maxScenes = Math.max(imageResults.length, ttsResults.length, sentences.length, optimizedPrompts.length);
      for (let i = 0; i < maxScenes; i++) {
        const image = imageResults[i];
        const audio = ttsResults[i];
        if (!image?.success || !audio?.success || !image.path || !audio.path) continue;
        const sentence = sentences[i];
        const prompt = optimizedPrompts[i];
        pairedScenes.push({
          index: i,
          text: typeof sentence === 'string' ? sentence : sentence?.text || sentence?.content || '',
          prompt: typeof prompt === 'string' ? prompt : prompt?.prompt || prompt?.optimized_prompt || prompt?.optimized || '',
          imagePath: image.path,
          audioPath: audio.path,
          duration: audio.duration || null,
          imageMeta: image.meta || null,
          audioMeta: audio.meta || null,
          subtitleBlocks: Array.isArray(sentence?.subtitleBlocks) ? [...sentence.subtitleBlocks] : [],
          sceneSource: sentence?.sceneSource || null,
          subtitleSource: sentence?.subtitleSource || null,
          degraded: sentence?.degraded === true,
          fallbackReason: sentence?.fallbackReason || null,
        });
      }

      // 构建资源清单
      const assetManifest = {
        scenes: pairedScenes,
        images: pairedScenes.map(scene => ({
          index: scene.index, success: true, path: scene.imagePath, meta: scene.imageMeta,
        })),
        audio: pairedScenes.map(scene => ({
          index: scene.index, success: true, path: scene.audioPath, duration: scene.duration, meta: scene.audioMeta,
        })),
        sentences: sentences.map((s, i) => ({
          index: i,
          text: typeof s === 'string' ? s : s.text || s.content,
          audioPath: ttsResults[i]?.path || null,
          duration: ttsResults[i]?.duration || null,
          audioMeta: ttsResults[i]?.meta || null,
          subtitleBlocks: Array.isArray(s?.subtitleBlocks) ? [...s.subtitleBlocks] : [],
          sceneSource: s?.sceneSource || null,
          subtitleSource: s?.subtitleSource || null,
          degraded: s?.degraded === true,
          fallbackReason: s?.fallbackReason || null,
        })),
        optimizedPrompts: optimizedPrompts.map((p, i) => ({
          index: i,
          prompt: typeof p === 'string' ? p : p.prompt || p.optimized_prompt || p.optimized,
          imagePath: imageResults[i]?.path || null,
          imageMeta: imageResults[i]?.meta || null,
        })),
        failures: {
          images: failedImages.map(item => ({ index: item.index, error: item.error || 'Image generation failed' })),
          audio: failedTts.map(item => ({ index: item.index, error: item.error || 'TTS generation failed' })),
        },
        segmentation: {
          sceneSource: pairedScenes.find(scene => scene.sceneSource)?.sceneSource || null,
          subtitleSource: pairedScenes.find(scene => scene.subtitleSource)?.subtitleSource || null,
          degraded: pairedScenes.some(scene => scene.degraded === true),
          fallbackReason: pairedScenes.find(scene => scene.fallbackReason)?.fallbackReason || null,
        },
        stats: {
          totalImages: imageResults.length,
          successImages: imageResults.filter(r => r.success).length,
          totalTts: ttsResults.length,
          successTts: ttsResults.filter(r => r.success).length,
          totalScenes: maxScenes,
          successScenes: pairedScenes.length,
          failedScenes: maxScenes - pairedScenes.length,
          degradedImages: pairedScenes.filter(scene => scene.imageMeta?.degraded === true).length,
          degradedTts: pairedScenes.filter(scene => scene.audioMeta?.degraded === true).length,
        },
        generatedAt: new Date().toISOString(),
      };

      // 默认要求每个 scene 都有成对资源；部分成片必须显式 opt-in。
      if (pairedScenes.length === 0 || (!allowPartialAssets && pairedScenes.length < maxScenes)) {
        return {
          success: false,
          error: 'Asset scene generation failed: ' + pairedScenes.length + '/' + maxScenes +
                 ' scenes have both image and audio',
        };
      }

      return {
        success: true,
        output: assetManifest,
      };
    }
  );
  registered.push(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS);

  return { success: true, registered };
}

/**
 * 带并发限制的 map
 * @param {Array} items
 * @param {number} concurrency
 * @param {Function} fn - async (item, index) => result
 * @returns {Promise<Array>}
 */
async function _mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

module.exports = {
  registerStory2VideoStages,
  STORY2VIDEO_STAGE_TYPES,
  MAX_ASSET_CONCURRENCY,
  normalizeAssetConcurrency,
  normalizeAssetResult,
  resolveInputImage,
  resolveInputAudio,
};
