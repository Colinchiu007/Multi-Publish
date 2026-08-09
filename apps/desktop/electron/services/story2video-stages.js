// @ts-check
/**
 * story2video-stages - Story2Video-compose 流水线的自定义阶段执行器
 *
 * 注册与 story2video-compose 流水线配套的自定义 STAGE_TYPES：
 *   - story2video_optimize: 逐场景视觉提示词统一走 prompt-engine（风格检测/改写/输出校验）
 *   - story2video_generate_assets: 并行生成图片 + TTS 音频
 *
 * 设计意图：
 *   split / compose / publish 阶段使用 StageExecutor 内置类型。
 *   optimize 统一调用 prompt-engine（PromptBridge / 8013），完成风格检测、改写与输出校验；
 *   generate_assets 需要并行编排（图片+TTS 同时生成）。
 *
 * 注册方式：
 *   在 bootstrap.js 或 container.setup.js 中调用 registerStory2VideoStages(pipelineEngine)
 */

'use strict';

const { STAGE_TYPES } = require('./stage-executor');
const { enrichHistoryScenes, passthroughScenes } = require('./story2video-domain');
const {
  getAllowedMediaRoots,
  resolveReadableMediaFile,
  writeDataImage,
} = require('./story2video-paths');
const {
  MAX_IMAGE_GENERATION_ATTEMPTS,
  runContentPolicyImageRetry,
} = require('./story2video-image-retry');
const { ERROR_CODES } = require('./adapters/_base/provider-error');
const {
  buildPromptEngineOptimizeRequest,
  extractOptimizedPrompt,
} = require('./prompt-engine-contract');

/**
 * Story2Video-compose 专用的阶段类型
 */
const STORY2VIDEO_STAGE_TYPES = {
  DOMAIN_ENRICH: 'story2video_domain_enrich',
  OPTIMIZE: 'story2video_optimize',
  GENERATE_ASSETS: 'story2video_generate_assets',
};

const MAX_ASSET_CONCURRENCY = 8;

function normalizeAssetConcurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 3;
  return Math.min(MAX_ASSET_CONCURRENCY, Math.max(1, Math.floor(number)));
}

const RATE_LIMIT_PATTERN = /rate\s*limit|rate_limit|限流|频率.*(?:受限|限制)|额度|quota/i;
const TRANSIENT_PATTERN = /timed?\s*out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|network\s*error|超时|网络/i;

function messageOf(value) {
  if (value && typeof value === 'object') return String(value.message || value.error || value.msg || '');
  return String(value || '');
}

function isRateLimitErrorLike(value) {
  if (value && typeof value === 'object') {
    if (value.code === ERROR_CODES.RATE_LIMITED) return true;
    if (Number(value.statusCode) === 429 || Number(value.status) === 429 || Number(value.code) === 429) return true;
  }
  return RATE_LIMIT_PATTERN.test(messageOf(value));
}

function isTransientErrorLike(value) {
  if (isRateLimitErrorLike(value)) return true;
  if (value && typeof value === 'object' && [ERROR_CODES.TIMEOUT, ERROR_CODES.NETWORK_ERROR].includes(value.code)) return true;
  return TRANSIENT_PATTERN.test(messageOf(value));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 对抛错型 provider 调用做有界重试：
 * - 限流（429 / RATE_LIMITED）：更长退避（2500ms×attempt），最多 rateLimitMaxAttempts 次；
 * - 其他瞬时错误（超时/网络）：800ms×attempt，最多 maxAttempts 次；
 * - 非瞬时错误：立即抛出，不消耗重试次数。
 */
async function withTransientRetry(fn, { maxAttempts = 3, rateLimitMaxAttempts = 4 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= Math.max(maxAttempts, rateLimitMaxAttempts); attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (!isTransientErrorLike(error)) throw error;
      const limit = isRateLimitErrorLike(error) ? rateLimitMaxAttempts : maxAttempts;
      if (attempt >= limit) break;
      await sleep((isRateLimitErrorLike(error) ? 2500 : 800) * attempt);
    }
  }
  throw lastError;
}

/**
 * 对返回结果对象（如 { code: -1, message }）或抛错的资源生成调用做有界重试。
 * 仅在可判定为瞬时（限流/超时/网络）时重试；内容政策检查点、模型配置等失败原样返回。
 */
async function withAssetTransientRetry(fn, { maxAttempts = 3, rateLimitMaxAttempts = 4 } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= Math.max(maxAttempts, rateLimitMaxAttempts); attempt++) {
    let outcome;
    try {
      outcome = await fn(attempt);
    } catch (error) {
      if (!isTransientErrorLike(error)) throw error;
      last = error;
      const limit = isRateLimitErrorLike(error) ? rateLimitMaxAttempts : maxAttempts;
      if (attempt >= limit) return { code: -1, message: error.message || String(error) };
      await sleep((isRateLimitErrorLike(error) ? 2500 : 800) * attempt);
      continue;
    }
    const ok = outcome && (Number(outcome.code) === 0 || outcome.success === true);
    const transient = !ok && outcome && isTransientErrorLike(outcome);
    if (ok) return outcome;
    if (!transient) return outcome;
    last = outcome;
    const limit = isRateLimitErrorLike(outcome) ? rateLimitMaxAttempts : maxAttempts;
    if (attempt >= limit) return outcome;
    await sleep((isRateLimitErrorLike(outcome) ? 2500 : 800) * attempt);
  }
  return last;
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

function summarizeAssetFailures(label, results) {
  return results.map((item) => {
    const index = Number.isInteger(item?.index) ? item.index + 1 : '?';
    const message = typeof item?.error === 'string' && item.error.trim()
      ? item.error.trim().replace(/\s+/g, ' ').slice(0, 500)
      : label + ' generation failed';
    return label + ' #' + index + ': ' + message;
  });
}

function getContentPolicyCheckpoint(result, fallbackSceneIndex) {
  const checkpoint = result?.checkpoint || result?.data?.checkpoint;
  if (!checkpoint || checkpoint.reason !== 'content_policy' || checkpoint.type !== 'needs_user_input') return null;

  const sceneIndex = fallbackSceneIndex;
  const sceneNumber = sceneIndex + 1;
  const attempts = Number.isInteger(checkpoint.attempts) && checkpoint.attempts > 0
    ? checkpoint.attempts
    : null;
  const recommendation = typeof checkpoint.recommendation === 'string' && checkpoint.recommendation.trim()
    ? checkpoint.recommendation.trim().replace(/\s+/g, ' ').slice(0, 500)
    : '请改写该场景为更抽象、非露骨的视觉描述后重试。';

  return {
    type: 'needs_user_input',
    status: 'needs_user_input',
    reason: 'content_policy',
    needsUserInput: true,
    sceneIndex,
    sceneNumber,
    attempts,
    recommendation,
  };
}

function buildContentPolicyCheckpointMeta(failedImages) {
  const scenes = failedImages
    .filter(item => item?.needsUserInput === true && item?.checkpoint?.reason === 'content_policy')
    .map(item => ({
      sceneIndex: item.checkpoint.sceneIndex,
      sceneNumber: item.checkpoint.sceneNumber,
      attempts: item.checkpoint.attempts,
      recommendation: item.checkpoint.recommendation,
    }));
  if (scenes.length === 0) return null;

  const first = scenes[0];
  return {
    type: 'needs_user_input',
    status: 'needs_user_input',
    reason: 'content_policy',
    needsUserInput: true,
    sceneIndex: first.sceneIndex,
    sceneNumber: first.sceneNumber,
    attempts: first.attempts,
    recommendation: first.recommendation,
    scenes,
  };
}

function getOptimizationScenes(context) {
  const source = context.domain_enrich || context.split || context.sentences;
  if (Array.isArray(source)) return source;
  if (source && Array.isArray(source.scenes)) return source.scenes;
  if (source && Array.isArray(source.sentences)) return source.sentences;
  return null;
}

function getScenePromptSeed(scene) {
  if (typeof scene === 'string') return scene.trim();
  if (!scene || typeof scene !== 'object') return '';
  const candidate = scene.imagePromptSeed || scene.prompt || scene.text || scene.content;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

/**
 * 判断文案是否有实质内容。去掉空白/标点/符号后为空、或全部是数字（如「12」）
 * 的文案没有可描绘的语义，交给 LLM 优化只会被编造出与原文无关的场景。
 * 单字中文（如「一」「猫」）仍视为有内容。
 * @param {string} text
 * @returns {boolean}
 */
function hasMeaningfulText(text) {
  const cleaned = String(text || '')
    .replace(/[\s\p{P}\p{S}]/gu, '');
  if (!cleaned) return false;
  // 方案B（2026-08-09）：仅「单个纯数字」视为无实质内容并跳过 LLM 优化；
  // 2 位及以上纯数字（如 81、1949）视为有意义，正常走 prompt-engine 优化，
  // 避免数字类文案得不到增强（同时保留对「1」这类极短数字的防编造守卫）。
  if (/^\d$/.test(cleaned)) return false;
  return true;
}

/**
 * prompt-engine 校验拒绝（输入过短无法优化）判定。
 * 方案B 配套（2026-08-09）：app 侧已放行 2 位+数字，但 prompt-engine 的
 * 最小长度校验仍会拒绝单词输入（如「81」→ 422 Too short），此时应回退原文
 * 并继续运行，而不是让整条流水线失败。
 *
 * 2026-08-09 Bug 反哺：真实链路文案为「描述太简短了（2 字），建议更详细描述画面」，
 * 原词表只覆盖「太短」未覆盖「太简短/过短」，导致回退未命中、整条流水线失败；
 * 词表按真实返回文案扩展（中文「太短/太简短/过短」+ 英文 Too short/min length 等）。
 * @param {string} message
 * @returns {boolean}
 */
function isPromptEngineTooShortRejection (message) {
  return /too short|太短|太简短|过短|must be at least|min[_ -]?length|shorter than/i.test(String(message || ''))
}

/**
 * 净化 LLM 返回的优化提示词：剥离 <think>...</think> 思考块（带推理能力的模型
 * 可能把思考过程直接放进 content），避免思考内容被当作图片提示词。
 * @param {string|null} content
 * @returns {string}
 */
function sanitizeOptimizedPrompt(content) {
  if (typeof content !== 'string') return '';
  let out = content.trim();
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<think>[\s\S]*$/gi, '');
  return out.trim();
}

/**
 * 识别 LLM 的「拒绝/无法生成」回复。场景描述缺失时模型可能返回
 * "I cannot generate the image prompt because the visual description is missing..."，
 * 这类内容不能作为图片提示词，应回退原文或按失败处理。
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeRejection(text) {
  if (typeof text !== 'string' || !text) return false;
  return /cannot generate|can'?t generate|unable to (generate|create)|missing from your request|please provide|please describe|i cannot|i can'?t|无法生成|缺少.*(描述|内容)|请提供.*(描述|内容)/i
    .test(text);
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
  // OPTIMIZE - 统一走 prompt-engine（风格检测/改写/输出校验）
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    STORY2VIDEO_STAGE_TYPES.OPTIMIZE,
    async ({ stage, context, serviceBus }) => {
      if (!serviceBus || typeof serviceBus.optimizePrompt !== 'function') {
        return { success: false, error: 'Story2Video optimize 需要 prompt-engine 服务（PromptBridge 未注入）' };
      }

      const scenes = getOptimizationScenes(context || {});
      if (!Array.isArray(scenes) || scenes.length === 0) {
        return { success: false, error: 'Story2Video optimize 需要非空场景数组' };
      }

      // 性能修复：逐场景 LLM 优化改为有界并发（默认 3），避免长文案 20+ 场景串行
      // 调用导致「提示词优化」阶段耗时数分钟。
      const concurrency = normalizeAssetConcurrency(stage.options?.concurrency ?? 3)
      const maxAttempts = Math.max(1, Math.min(3, Number(stage.options?.maxRetries ?? 2) + 1))
      // 断点续传：上次失败时已完成的场景结果直接复用，避免重复消耗 LLM 额度。
      const partialResume = (context && Array.isArray(context.optimize_resume)) ? context.optimize_resume : []
      // 进度前置写入：一开始就显示「共 N 个场景，已完成 0 个」，避免整个阶段期间无数量信息
      if (context && typeof context === 'object') {
        context.optimize_progress = {
          done: partialResume.filter(Boolean).length,
          total: scenes.length,
        }
      }
      let output
      try {
        output = await _mapWithConcurrency(scenes, concurrency, async (scene, index) => {
          if (partialResume[index]) return partialResume[index]
          const promptSeed = getScenePromptSeed(scene)
          if (!promptSeed) {
            throw new Error('Story2Video optimize scene ' + index + ' is missing a prompt seed')
          }
          // 无实质内容的文案（单个纯数字/纯符号/过短）：跳过 LLM 优化，直接用原文，
          // 避免模型凭空编造与原文无关的场景（如输入「1」被编造成人物画面）。
          // 2 位及以上纯数字（如 81、1949）视为有意义，正常优化（方案B，2026-08-09）。
          if (!hasMeaningfulText(promptSeed)) {
            const skippedEntry = {
              optimized_prompt: promptSeed,
              providerId: null,
              model: null,
              skipped_optimize: true,
            };
            partialResume[index] = skippedEntry;
            if (context && typeof context === 'object') {
              context.optimize_resume = partialResume;
              context.optimize_progress = {
                done: partialResume.filter(Boolean).length,
                total: scenes.length,
              };
            }
            return skippedEntry;
          }
          // 图片提示词统一走 prompt-engine：构造请求（平台/风格别名归一、自动风格检测、
          // 创意度/长度/候选数边界）→ 瞬态错误有界重试（限流更长退避）→ 输出校验 fail closed。
          // 校验顺序：error 优先（/v1/optimize 失败兜底返回原文+error，忽略即静默降级）→ 结构 → 内容。
          // 请求构造一次（含别名归一与边界收敛），重试/校验共用同一份归一化参数
          const request = buildPromptEngineOptimizeRequest(promptSeed, stage.options || {})
          const { prompt: enginePrompt, ...requestOptions } = request
          let result
          try {
            result = await withTransientRetry(
              () => serviceBus.optimizePrompt(enginePrompt, requestOptions),
              { maxAttempts, rateLimitMaxAttempts: Math.max(maxAttempts + 1, 4) },
            )
          } catch (lastError) {
            const message = lastError && lastError.message ? lastError.message : String(lastError)
            // I6：服务不可用/连接失败时给出可操作排查指引（PROMPT_DIR / 8013）
            const hint = /not running|ECONNREFUSED|timed\s*out|ETIMEDOUT|network\s*error|超时|网络/i.test(message)
              ? '（prompt-engine 未运行或不可达，请检查 PROMPT_DIR 与端口 8013）'
              : ''
            throw new Error('Story2Video optimize scene ' + index + ' failed: ' + message + hint)
          }
          // 截断上限用契约收敛后的 max_length（W-2/I-4：兼容 camelCase 配置且不因原始越界值误截断）
          const validated = extractOptimizedPrompt(result, {
            index,
            maxLength: request.max_length,
            warn: (msg) => pipelineEngine.log.warn('Story2VideoStages', msg),
          })
          if (!validated.ok) {
            // prompt-engine 校验拒绝（如 Too short）：输入过短无法优化 → 回退原文并继续，
            // 不因「81」这类单词数字输入让整条流水线失败（方案B 2026-08-09 配套）。
            if (isPromptEngineTooShortRejection(validated.error)) {
              const tooShortEntry = {
                optimized_prompt: promptSeed,
                providerId: null,
                model: null,
                skipped_optimize: true,
                optimize_note: 'prompt_engine_too_short_use_original',
              };
              partialResume[index] = tooShortEntry;
              if (context && typeof context === 'object') {
                context.optimize_resume = partialResume;
                context.optimize_progress = {
                  done: partialResume.filter(Boolean).length,
                  total: scenes.length,
                };
              }
              return tooShortEntry;
            }
            throw new Error('Story2Video ' + validated.error)
          }
          // 剥离思考块后才是最终提示词：带推理能力的模型可能把 <think> 思考过程放进内容，
          // prompt-engine 返回后仍做防御性净化，不能把思考内容当作图片提示词。
          const optimizedPrompt = sanitizeOptimizedPrompt(validated.prompt)
          if (!optimizedPrompt) {
            throw new Error('Story2Video optimize scene ' + index + ' returned an empty prompt')
          }
          // LLM 拒绝/无法生成：场景描述缺失时模型可能返回 "I cannot generate..."，
          // 这类内容不能作为提示词——有实质内容时回退原文，否则按失败处理。
          if (looksLikeRejection(optimizedPrompt)) {
            if (!hasMeaningfulText(promptSeed)) {
              throw new Error('Story2Video optimize scene ' + index + ' returned a rejection instead of a prompt')
            }
            const rejectionEntry = {
              optimized_prompt: promptSeed,
              providerId: null,
              model: null,
              skipped_optimize: true,
              optimize_note: 'llm_rejected_use_original',
            };
            partialResume[index] = rejectionEntry;
            if (context && typeof context === 'object') {
              context.optimize_resume = partialResume;
              context.optimize_progress = {
                done: partialResume.filter(Boolean).length,
                total: scenes.length,
              };
            }
            return rejectionEntry;
          }
          const entry = {
            optimized_prompt: optimizedPrompt,
            providerId: 'prompt-engine',
            model: typeof validated.meta.model_used === 'string' && validated.meta.model_used.trim()
              ? validated.meta.model_used.trim()
              : null,
            ...validated.meta,
            truncated: validated.truncated || undefined,
          }
          // 逐场景写入部分结果，失败时可断点续传（context 与 run.context 同引用）
          partialResume[index] = entry
          if (context && typeof context === 'object') {
            context.optimize_resume = partialResume
            context.optimize_progress = {
              done: partialResume.filter(Boolean).length,
              total: scenes.length,
            }
          }
          return entry
        })
      } catch (error) {
        return {
          success: false,
          error: 'Story2Video optimize failed: ' + (error && error.message ? error.message : String(error)),
        }
      }
      if (context && typeof context === 'object' && Array.isArray(output)) {
        delete context.optimize_resume
      }

      return { success: true, output };
    },
  );
  registered.push(STORY2VIDEO_STAGE_TYPES.OPTIMIZE);

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

      const firstDefined = (...values) => values.find(v => v !== undefined && v !== null);
      const concurrency = normalizeAssetConcurrency(firstDefined(params.concurrency, stage.options?.concurrency, 3));
      const imageStyle = firstDefined(params.imageStyle, stage.options?.imageStyle, 'cinematic');
      const imageProvider = firstDefined(params.imageProvider, stage.options?.imageProvider);
      const imageModel = firstDefined(params.imageModel, stage.options?.imageModel);
      const aspectRatio = firstDefined(params.aspectRatio, stage.options?.aspectRatio, '16:9');
      const voiceId = firstDefined(params.voiceId, stage.options?.voiceId, 'default');
      const voiceProvider = firstDefined(params.voiceProvider, stage.options?.voiceProvider);
      // 多模态优先：未显式指定 provider 时，按能力让 ModelProviderManager.getDefault 解析
      // （开启「优先多模态」且多模态模型声明支持该能力时返回多模态模型）。仅 assetGenerator
      // 路径生效，legacy python 路径保持原有空 provider 行为。
      const resolveCapabilityProvider = (type) => {
        const container = pipelineEngine && pipelineEngine.container
        const manager = container && typeof container.get === 'function'
          ? container.get('modelProviderManager')
          : null
        if (!manager || typeof manager.getDefault !== 'function') return ''
        const provider = manager.getDefault(type)
        return provider && typeof provider.id === 'string' ? provider.id.trim() : ''
      }
      const hasAssetGenerator = Boolean((pipelineEngine && pipelineEngine._assetGenerator) || (serviceBus && serviceBus._assetGenerator))
      const resolvedImageProvider = imageProvider || (hasAssetGenerator ? resolveCapabilityProvider('image') : '')
      const resolvedVoiceProvider = voiceProvider || (hasAssetGenerator ? resolveCapabilityProvider('tts') : '')
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

      // 断点续传：上次失败时已完成的场景直接复用本地产物，避免重复消耗图片/TTS 额度
      const resumeCompleted = new Map();
      const priorResume = context && context.generate_assets && Array.isArray(context.generate_assets.resume?.completed)
        ? context.generate_assets.resume.completed
        : [];
      for (const item of priorResume) {
        if (item && Number.isInteger(item.index) && typeof item.imagePath === 'string' && typeof item.audioPath === 'string') {
          resumeCompleted.set(item.index, item);
        }
      }

      // 实时进度（供前端阶段清单展示「图片 x/y · 旁白 x/y」）
      let imagesDone = 0;
      let ttsDone = 0;
      const writeAssetsProgress = () => {
        if (context && typeof context === 'object') {
          context.assets_progress = {
            imagesDone,
            imagesTotal: optimizedPrompts.length,
            ttsDone,
            ttsTotal: sentences.length,
          };
        }
      };
      const markImageDone = () => { imagesDone += 1; writeAssetsProgress(); };
      const markTtsDone = () => { ttsDone += 1; writeAssetsProgress(); };
      // 进度前置写入：阶段一开始即显示「图片 0/N · 旁白 0/M」，
      // 避免首个图片/TTS 完成前（如图片生成需 16-30s）前端长期无数量信息
      writeAssetsProgress();

      // 并行生成图片（分批控制并发）
      // 使用 AssetGenerator（ffmpeg 占位图）替代 serviceBus.callPythonSkill
      const assetGenerator = pipelineEngine._assetGenerator || serviceBus._assetGenerator;
      const imagePromise = _mapWithConcurrency(
        optimizedPrompts,
        concurrency,
        async (prompt, index) => {
          try {
            const resumed = resumeCompleted.get(index);
            if (resumed) {
              markImageDone();
              return { index, success: true, path: resumed.imagePath, meta: { resumed: true } };
            }
            const promptText = typeof prompt === 'string' ? prompt : prompt.prompt || prompt.optimized_prompt || prompt.optimized;
            if (inputMode === 'images' && inputImages[index] !== undefined) {
              const suppliedPath = resolveInputImage(inputImages[index], runId, index);
              if (!suppliedPath) {
                return { index, success: false, error: 'Supplied image is missing, unreadable, or too large' };
              }
              markImageDone();
              return { index, success: true, path: suppliedPath, meta: { supplied: true } };
            }
            let result;
            if (assetGenerator) {
              // 瞬时错误（限流/超时/网络）有界重试；内容政策检查点等失败原样返回
              result = await withAssetTransientRetry(() => assetGenerator.generateImage(promptText, {
                style: imageStyle,
                image_provider: resolvedImageProvider,
                image_model: imageModel,
                index,
                aspect_ratio: aspectRatio,
                runId,
              }));
            } else {
              const retryResult = await runContentPolicyImageRetry({
                prompt: promptText,
                sceneIndex: index,
                maxAttempts: MAX_IMAGE_GENERATION_ATTEMPTS,
                generate: async ({ prompt: attemptPrompt }) => {
                  const attemptResult = await withAssetTransientRetry(() => serviceBus.callPythonSkill('generate_image', {
                    prompt: attemptPrompt,
                    style: imageStyle,
                    image_provider: imageProvider,
                    image_model: imageModel,
                    index,
                    aspect_ratio: aspectRatio,
                    runId,
                  }));
                  const providerError = attemptResult?.error || attemptResult?.data?.error;
                  if (providerError && typeof providerError === 'object') throw providerError;
                  if (attemptResult?.success === false || Number(attemptResult?.code) < 0) {
                    const error = new Error(
                      attemptResult?.message ||
                      (typeof providerError === 'string' ? providerError : 'Image generation failed')
                    );
                    if (attemptResult && typeof attemptResult === 'object') Object.assign(error, attemptResult);
                    throw error;
                  }
                  return attemptResult;
                },
              });
              if (retryResult.status === 'success') {
                result = retryResult.result;
              } else if (retryResult.status === 'needs_user_input') {
                result = {
                  code: -1,
                  message: 'Image generation requires user input after content-policy review',
                  needsUserInput: true,
                  checkpoint: retryResult.checkpoint,
                  data: {
                    needsUserInput: true,
                    checkpoint: retryResult.checkpoint,
                    generationAttempts: retryResult.attempts,
                  },
                };
              } else {
                result = {
                  code: -1,
                  message: retryResult.error?.message || 'Image generation failed',
                  data: { generationAttempts: retryResult.attempts },
                };
              }
            }
            const normalized = normalizeAssetResult(result, ['path', 'url', 'image_path']);
            if (normalized) {
              markImageDone();
              return {
                index,
                success: true,
                path: normalized.path,
                meta: normalized.meta,
              };
            }
            const contentPolicyCheckpoint = getContentPolicyCheckpoint(result, index);
            return {
              index,
              success: false,
              error: (result && result.message) || 'Image generation failed',
              needsUserInput: Boolean(contentPolicyCheckpoint),
              checkpoint: contentPolicyCheckpoint,
              generationAttempts: Array.isArray(result?.data?.generationAttempts)
                ? result.data.generationAttempts
                : [],
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
            const resumed = resumeCompleted.get(index);
            if (resumed) {
              markTtsDone();
              return { index, success: true, path: resumed.audioPath, duration: resumed.duration || null, meta: { resumed: true } };
            }
            const suppliedAudio = inputAudio[index]
            if (suppliedAudio !== undefined) {
              const suppliedPath = resolveInputAudio(suppliedAudio)
              if (!suppliedPath) {
                return { index, success: false, error: 'Supplied audio is missing or unreadable' };
              }
              markTtsDone();
              return {
                index,
                success: true,
                path: suppliedPath,
                duration: typeof suppliedAudio === 'object' ? suppliedAudio.duration : null,
                meta: { supplied: true },
              };
            }
            const text = typeof sentence === 'string' ? sentence : sentence.text || sentence.content;
            const result = await withAssetTransientRetry(() => assetGenerator
              ? assetGenerator.generateTTS(text, {
                  voice_id: voiceId,
                  voice_provider: resolvedVoiceProvider,
                  voice_model: firstDefined(params.voiceModel, stage.options?.voiceModel),
                  rate: firstDefined(params.voiceSpeed, stage.options?.voiceSpeed),
                  pitch: firstDefined(params.voicePitch, stage.options?.voicePitch),
                  emotion: firstDefined(params.voiceEmotion, stage.options?.voiceEmotion),
                  index,
                  runId,
                })
              : serviceBus.callPythonSkill('generate_tts', {
                  text,
                  voice_id: voiceId,
                  voice_provider: firstDefined(params.voiceProvider, stage.options?.voiceProvider),
                  voice_model: firstDefined(params.voiceModel, stage.options?.voiceModel),
                  rate: firstDefined(params.voiceSpeed, stage.options?.voiceSpeed),
                  pitch: firstDefined(params.voicePitch, stage.options?.voicePitch),
                  emotion: firstDefined(params.voiceEmotion, stage.options?.voiceEmotion),
                  index,
                  runId,
                }));
            const normalized = normalizeAssetResult(result, ['path', 'audio_path']);
            if (normalized) {
              markTtsDone();
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
          images: failedImages.map(item => ({
            index: item.index,
            error: item.error || 'Image generation failed',
            needsUserInput: item.needsUserInput === true,
            checkpoint: item.checkpoint || null,
            generationAttempts: Array.isArray(item.generationAttempts) ? item.generationAttempts : [],
          })),
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

      // 内容政策耗尽时必须停在可操作的人工处理点，不能因为允许部分资源而继续输出成片。
      const contentPolicyCheckpointMeta = buildContentPolicyCheckpointMeta(failedImages);
      if (contentPolicyCheckpointMeta) {
        return {
          success: true,
          output: assetManifest,
          checkpoint: 'needs_user_input',
          checkpointMeta: contentPolicyCheckpointMeta,
        };
      }

      // 默认要求每个 scene 都有成对资源；部分成片必须显式 opt-in。
      if (pairedScenes.length === 0 || (!allowPartialAssets && pairedScenes.length < maxScenes)) {
        // 记录已完成的场景（图片+音频都有），供「从断点继续」跳过，避免重复消耗额度
        if (context && typeof context === 'object') {
          context.generate_assets = context.generate_assets || {};
          context.generate_assets.resume = {
            completed: pairedScenes.map((scene) => ({
              index: scene.index,
              imagePath: scene.imagePath,
              audioPath: scene.audioPath,
              duration: scene.duration || null,
            })),
            total: maxScenes,
            savedAt: new Date().toISOString(),
          };
        }
        const failureDetails = [
          ...summarizeAssetFailures('Image', failedImages),
          ...summarizeAssetFailures('TTS', failedTts),
        ];
        return {
          success: false,
          error: 'Asset scene generation failed: ' + pairedScenes.length + '/' + maxScenes +
                 ' scenes have both image and audio' +
                 (failureDetails.length > 0 ? '. ' + failureDetails.join('; ') : ''),
        };
      }

      if (context && typeof context === 'object' && context.generate_assets && context.generate_assets.resume) {
        delete context.generate_assets.resume;
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
  hasMeaningfulText,
  isPromptEngineTooShortRejection,
};
