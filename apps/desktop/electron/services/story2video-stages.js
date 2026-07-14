// @ts-check
/**
 * story2video-stages - Story2Video-compose 管线的自定义阶段执行器
 *
 * 注册与 story2video-compose 管线配套的自定义 STAGE_TYPES：
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

/**
 * Story2Video-compose 专用的阶段类型
 */
const STORY2VIDEO_STAGE_TYPES = {
  GENERATE_ASSETS: 'story2video_generate_assets',
};

/**
 * 注册 Story2Video-compose 管线的自定义阶段执行器
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
  // GENERATE_ASSETS - 并行图片 + TTS 生成
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS,
    async ({ stage, params, context, serviceBus }) => {
      const log = pipelineEngine.log;

      // 从 context 获取前序阶段的输出
      const optimizedPrompts = context.optimize || context.optimized_prompts;
      let sentences = context.split || context.sentences;

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

      const concurrency = stage.options?.concurrency || params.concurrency || 3;
      const imageStyle = stage.options?.imageStyle || params.imageStyle || 'cinematic';
      const voiceId = stage.options?.voiceId || params.voiceId || 'default';

      log.info('Story2VideoStages',
        'Generating assets: ' + optimizedPrompts.length + ' images + ' +
        sentences.length + ' TTS (concurrency=' + concurrency + ')');

      // 并行生成图片（分批控制并发）
      // 使用 AssetGenerator（ffmpeg 占位图）替代 serviceBus.callPythonSkill
      const assetGenerator = pipelineEngine._assetGenerator || serviceBus._assetGenerator;
      const imageResults = await _mapWithConcurrency(
        optimizedPrompts,
        concurrency,
        async (prompt, index) => {
          try {
            const promptText = typeof prompt === 'string' ? prompt : prompt.prompt || prompt.optimized_prompt || prompt.optimized;
            const result = assetGenerator
              ? await assetGenerator.generateImage(promptText, {
                  style: imageStyle,
                  index,
                  aspect_ratio: stage.options?.aspectRatio || '16:9',
                })
              : await serviceBus.callPythonSkill('generate_image', {
                  prompt: promptText, style: imageStyle, index,
                  aspect_ratio: stage.options?.aspectRatio || '16:9',
                });
            if (result && result.code === 0 && result.data) {
              return {
                index,
                success: true,
                path: result.data.path || result.data.url || result.data.image_path,
                meta: result.data,
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
      const ttsResults = await _mapWithConcurrency(
        sentences,
        concurrency,
        async (sentence, index) => {
          try {
            const text = typeof sentence === 'string' ? sentence : sentence.text || sentence.content;
            const result = assetGenerator
              ? await assetGenerator.generateTTS(text, { voice_id: voiceId, index })
              : await serviceBus.callPythonSkill('generate_tts', {
                  text, voice_id: voiceId, index,
                });
            if (result && result.code === 0 && result.data) {
              return {
                index,
                success: true,
                path: result.data.path || result.data.audio_path,
                duration: result.data.duration,
                meta: result.data,
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

      // 检查失败
      const failedImages = imageResults.filter(r => !r.success);
      const failedTts = ttsResults.filter(r => !r.success);
      if (failedImages.length > 0 || failedTts.length > 0) {
        log.warn('Story2VideoStages',
          'Asset generation had failures: ' + failedImages.length + ' images, ' +
          failedTts.length + ' TTS');
      }

      // 构建资源清单
      const assetManifest = {
        images: imageResults.filter(r => r.success),
        audio: ttsResults.filter(r => r.success),
        sentences: sentences.map((s, i) => ({
          index: i,
          text: typeof s === 'string' ? s : s.text || s.content,
          audioPath: ttsResults[i]?.path || null,
          duration: ttsResults[i]?.duration || null,
        })),
        optimizedPrompts: optimizedPrompts.map((p, i) => ({
          index: i,
          prompt: typeof p === 'string' ? p : p.prompt || p.optimized_prompt || p.optimized,
          imagePath: imageResults[i]?.path || null,
        })),
        stats: {
          totalImages: imageResults.length,
          successImages: imageResults.filter(r => r.success).length,
          totalTts: ttsResults.length,
          successTts: ttsResults.filter(r => r.success).length,
        },
        generatedAt: new Date().toISOString(),
      };

      // 全部失败才算 stage 失败
      if (assetManifest.stats.successImages === 0 && assetManifest.stats.successTts === 0) {
        return {
          success: false,
          error: 'All asset generation failed (images: 0/' + imageResults.length +
                 ', TTS: 0/' + ttsResults.length + ')',
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
};
