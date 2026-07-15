// @ts-check
/**
 * StageExecutor - 阶段执行器
 *
 * 职责：
 *   - 定义阶段类型枚举（STAGE_TYPES）
 *   - 为每种阶段类型注册对应的执行器函数
 *   - 支持自定义执行器注册（插件扩展点）
 *   - 提供统一的 execute() 入口供 PipelineEngine 调用
 *
 * 设计意图：
 *   PipelineEngine 原 start()/advance() 仅做状态机切换，不执行真实工作。
 *   StageExecutor 补齐这一缺口：每个阶段对应一次 ServiceBus 调用，
 *   阶段间通过 context 对象传递数据。
 *
 *   旧的 13 条流水线无 stage.type 字段，会回退为 MANUAL_CHECKPOINT，
 *   保持与原状态机行为完全一致。
 */

'use strict';

/**
 * 阶段类型枚举
 */
const STAGE_TYPES = {
  SPLIT: 'split',                       // 文本分句
  OPTIMIZE: 'optimize',                 // 单个提示词优化
  OPTIMIZE_BATCH: 'optimize_batch',     // 批量提示词优化
  GENERATE_ASSETS: 'generate_assets',   // 资源生成（图片/TTS，委托 Python 技能）
  COMPOSE: 'compose',                   // 视频合成（Story2Video 引擎）
  PUBLISH: 'publish',                   // 多平台发布
  FETCH_PIPELINE: 'fetch_pipeline',     // 从 Python 后端拉取流水线定义
  CALL_SKILL: 'call_skill',             // 通用 Python 技能调用
  MANUAL_CHECKPOINT: 'manual_checkpoint', // 人工检查点（不执行，等待 advance）
  CUSTOM: 'custom',                     // 自定义执行器（stage.executor 函数）
};

/**
 * StageExecutor 类
 */
class StageExecutor {
  /**
   * @param {object} deps
   * @param {object} deps.serviceBus - ServiceBus 实例（必需）
   * @param {object} [deps.container] - DI 容器（用于获取 publisherRouter 等）
   * @param {object} [deps.log] - 日志模块
   */
  constructor({ serviceBus, container, log }) {
    if (!serviceBus) {
      throw new Error('StageExecutor requires serviceBus');
    }
    this.serviceBus = serviceBus;
    this.container = container || null;
    this.log = log || require('./logger');
    this._customExecutors = new Map();
    this._builtinExecutors = this._buildBuiltinExecutors();
  }

  /**
   * 注册自定义阶段执行器
   * @param {string} stageType - 阶段类型（建议使用 STAGE_TYPES 枚举）
   * @param {Function} fn - async ({ runId, stage, params, context, serviceBus, container }) => { success, output?, error?, checkpoint? }
   */
  register(stageType, fn) {
    if (typeof fn !== 'function') {
      throw new Error('Executor must be a function');
    }
    this._customExecutors.set(stageType, fn);
    this.log.info('StageExecutor', 'Registered custom executor: ' + stageType);
  }

  /**
   * 执行单个阶段
   * @param {object} opts
   * @param {string} opts.runId - 运行 ID
   * @param {object} opts.stage - 阶段定义（包含 name/type/options/inputFrom 等）
   * @param {object} opts.params - 流水线启动参数
   * @param {object} opts.context - 阶段间上下文（前序阶段的 output 集合）
   * @returns {Promise<{success: boolean, output?: any, error?: string, checkpoint?: boolean}>}
   */
  async execute({ runId, stage, params, context }) {
    const stageType = stage.type || STAGE_TYPES.MANUAL_CHECKPOINT;

    // 自定义执行器优先
    const customFn = this._customExecutors.get(stageType);
    if (customFn) {
      return this._safeRun(customFn, { runId, stage, params, context });
    }

    // 内置执行器
    const builtinFn = this._builtinExecutors.get(stageType);
    if (!builtinFn) {
      this.log.warn('StageExecutor',
        'Unknown stage type: ' + stageType + ', fallback to manual_checkpoint');
      return { success: true, output: null, checkpoint: true };
    }

    return this._safeRun(builtinFn, { runId, stage, params, context });
  }

  /**
   * 安全执行（捕获异常，统一返回格式）
   */
  async _safeRun(fn, opts) {
    try {
      const result = await fn({
        runId: opts.runId,
        stage: opts.stage,
        params: opts.params,
        context: opts.context,
        serviceBus: this.serviceBus,
        container: this.container,
      });
      return result || { success: true, output: null };
    } catch (e) {
      this.log.error('StageExecutor',
        'Stage "' + (opts.stage?.name || 'unknown') + '" failed: ' + e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * 构建内置执行器映射
   */
  _buildBuiltinExecutors() {
    const map = new Map();
    const self = this;

    // SPLIT - 文本分句
    map.set(STAGE_TYPES.SPLIT, async ({ stage, params, context }) => {
      const text = _resolveInput(stage, params, context);
      if (!text) {
        return { success: false, error: 'No text input for split stage' };
      }
      const result = await self.serviceBus.splitText(text, stage.options || {});
      // 响应格式适配：Bridge 返回原始数据 { scenes, sentences, ... }
      // 也兼容 Python 后端包装格式 { code: 0, data: ... }
      if (result && (result.scenes || result.sentences || (result.code === 0 && result.data))) {
        const output = result.code === 0 ? (result.data || result) : result;
        return { success: true, output };
      }
      return { success: false, error: (result && result.message) || 'Split failed' };
    });

    // OPTIMIZE - 单个提示词优化
    map.set(STAGE_TYPES.OPTIMIZE, async ({ stage, params, context }) => {
      const prompt = _resolveInput(stage, params, context);
      if (!prompt) {
        return { success: false, error: 'No prompt input for optimize stage' };
      }
      const result = await self.serviceBus.optimizePrompt(prompt, stage.options || {});
      // 响应格式适配：Bridge 返回 { optimized_prompt, ... } 或 { code: 0, data: ... }
      if (result && (result.optimized_prompt !== undefined || (result.code === 0 && result.data))) {
        const output = result.code === 0 ? (result.data || result) : result;
        return { success: true, output };
      }
      return { success: false, error: (result && result.message) || 'Optimize failed' };
    });

    // OPTIMIZE_BATCH - 批量提示词优化
    map.set(STAGE_TYPES.OPTIMIZE_BATCH, async ({ stage, params, context }) => {
      let prompts = _resolveInput(stage, params, context);
      // 适配 split 阶段输出：{ scenes: [{ text }], sentences: [{ text }] }
      // 自动从 scenes/sentences 提取文本作为 prompts 数组
      if (prompts && !Array.isArray(prompts)) {
        if (Array.isArray(prompts.scenes)) {
          prompts = prompts.scenes.map(s => s.text || s).filter(Boolean);
        } else if (Array.isArray(prompts.sentences)) {
          prompts = prompts.sentences.map(s => s.text || s).filter(Boolean);
        }
      }
      if (!Array.isArray(prompts)) {
        return { success: false, error: 'No prompts array for optimize_batch stage' };
      }
      const result = await self.serviceBus.optimizePromptsBatch(prompts, stage.options || {});
      // 响应格式适配：Bridge 返回数组或 { results: [...] } 或 { code: 0, data: ... }
      if (result && (Array.isArray(result) || Array.isArray(result.results) || (result.code === 0 && result.data))) {
        const output = result.code === 0 ? (result.data || result) : result;
        return { success: true, output };
      }
      return { success: false, error: (result && (result.message || (result.detail && JSON.stringify(result.detail)))) || 'Batch optimize failed' };
    });

    // GENERATE_ASSETS - 资源生成（委托 Python 技能）
    map.set(STAGE_TYPES.GENERATE_ASSETS, async ({ stage, params, context }) => {
      const input = _resolveInput(stage, params, context);
      const result = await self.serviceBus.callPythonSkill('generate_assets', {
        ...stage.options,
        input,
      });
      if (result && result.code === 0) {
        return { success: true, output: result.data || result };
      }
      return { success: false, error: (result && result.message) || 'Asset generation failed' };
    });

    // COMPOSE - 视频合成（基于 ffmpeg 的真实合成引擎）
    map.set(STAGE_TYPES.COMPOSE, async ({ stage, params, context }) => {
      const assets = _resolveInput(stage, params, context);
      const result = await self.serviceBus.composeVideo(assets, stage.options || {});
      // code === 0 或 code === undefined（直接返回数据的桥接）都算成功
      if (result && (result.code === 0 || result.code === undefined)) {
        return { success: true, output: result.data || result };
      }
      // 引擎不可用时返回失败（不再用占位成功）
      return { success: false, error: (result && result.message) || 'Compose failed' };
    });

    // PUBLISH - 多平台发布
    // P2-10: 重写为 createPublisher 模式，匹配 PublisherRouter 真实 API
    map.set(STAGE_TYPES.PUBLISH, async ({ stage, params, context }) => {
      const router = (self.container && typeof self.container.get === 'function')
        ? self.container.get('publisherRouter')
        : null;

      // 占位分支：router 未配置（E2E 编排验证 / 开发环境）
      // 真实 PublisherRouter 只有 createPublisher 方法，没有 publish 方法
      if (!router || typeof router.createPublisher !== 'function') {
        self.log.warn('StageExecutor',
          'PUBLISH: publisherRouter not available, returning placeholder success');
        // 提取 videoPath 用于日志（不做验证，占位模式允许文件不存在）
        const composeOut = _resolveInput(stage, params, context);
        const phVideoPath = typeof composeOut === 'string'
          ? composeOut
          : (composeOut && composeOut.videoPath) || (params && params.videoPath) || null;
        return {
          success: true,
          output: {
            placeholder: true,
            message: 'PublisherRouter not available (placeholder)',
            publishedTo: [],
            videoPath: phVideoPath,
          },
        };
      }

      // 1. 解析并验证 videoPath
      // compose 阶段的 output 是 { videoPath, fileSize, segmentCount, duration }
      // _resolveInput 返回整个 compose 对象，需提取 videoPath 字段
      const composeOutput = _resolveInput(stage, params, context);
      let videoPath;
      if (typeof composeOutput === 'string') {
        videoPath = composeOutput;
      } else if (composeOutput && typeof composeOutput === 'object') {
        videoPath = composeOutput.videoPath || composeOutput.path || composeOutput.output;
      } else if (params && params.videoPath) {
        videoPath = params.videoPath;
      }
      if (!videoPath) {
        return { success: false, error: 'PUBLISH: No videoPath resolved from context/params' };
      }
      const fs = require('fs');
      if (!fs.existsSync(videoPath)) {
        return {
          success: false,
          error: 'PUBLISH: videoPath does not exist: ' + videoPath,
        };
      }

      // 2. 解析并验证 platforms
      const platforms = stage.platforms || params.platforms || [];
      if (!Array.isArray(platforms) || platforms.length === 0) {
        return {
          success: false,
          error: 'PUBLISH: No platforms specified (stage.platforms or params.platforms required)',
        };
      }

      // 3. 构建 publish deps（rpaViewManager + store + pythonBridge 从 container 获取）
      const rpaViewManager = (self.container && typeof self.container.get === 'function')
        ? self.container.get('rpaViewManager') : null;
      const store = (self.container && typeof self.container.get === 'function')
        ? self.container.get('store') : null;
      const pythonBridge = (self.container && typeof self.container.get === 'function')
        ? self.container.get('pythonBridge') : null;
      const publishDeps = { rpaViewManager, store, pythonBridge };

      // 4. 逐平台发布（createPublisher + publisher.publish 模式）
      const results = [];
      for (const platform of platforms) {
        try {
          const publisher = router.createPublisher(platform, publishDeps);
          const task = {
            id: 's2v_' + Date.now() + '_' + platform,
            platform,
            article: {
              video_path: videoPath,
              title: stage.options?.title || params.title || '',
              content: stage.options?.content || params.content || '',
              tags: stage.options?.tags || [],
            },
          };
          const r = await publisher.publish(task);
          results.push({
            platform,
            success: !!(r && r.success),
            url: r?.url || r?.postId || '',
            error: r?.success ? null : (r?.error || 'Publish failed'),
          });
          self.log.info('StageExecutor',
            'PUBLISH: ' + platform + ' ' + (r?.success ? 'success' : 'failed') +
            (r?.url ? ' url=' + r.url : ''));
        } catch (e) {
          results.push({
            platform,
            success: false,
            url: '',
            error: e instanceof Error ? e.message : String(e),
          });
          self.log.warn('StageExecutor',
            'PUBLISH: ' + platform + ' exception: ' + (e instanceof Error ? e.message : String(e)));
        }
      }

      // 5. 汇总结果
      const succeeded = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      const overallSuccess = succeeded.length > 0; // 至少一个平台成功

      return {
        success: overallSuccess,
        output: {
          placeholder: false,
          videoPath,
          publishedTo: succeeded.map(r => r.platform),
          failedPlatforms: failed.map(r => r.platform),
          results,
          stats: {
            total: platforms.length,
            succeeded: succeeded.length,
            failed: failed.length,
          },
        },
        error: overallSuccess ? null : 'All platforms failed: ' +
          failed.map(r => r.platform + '(' + r.error + ')').join(', '),
      };
    });

    // FETCH_PIPELINE - 从 Python 后端拉取流水线定义
    map.set(STAGE_TYPES.FETCH_PIPELINE, async ({ stage, params }) => {
      const name = stage.pipelineName || params.pipelineName;
      if (!name) {
        return { success: false, error: 'No pipelineName for fetch_pipeline stage' };
      }
      const result = await self.serviceBus.fetchPipeline(name);
      if (result && result.code === 0) {
        return { success: true, output: result.data || result };
      }
      return { success: false, error: (result && result.message) || 'Fetch pipeline failed' };
    });

    // CALL_SKILL - 通用 Python 技能调用
    map.set(STAGE_TYPES.CALL_SKILL, async ({ stage, params, context }) => {
      const skillName = stage.skillName;
      if (!skillName) {
        return { success: false, error: 'No skillName for call_skill stage' };
      }
      const skillContext = {
        ...params,
        ...context,
        ...stage.options,
      };
      const result = await self.serviceBus.callPythonSkill(skillName, skillContext);
      if (result && result.code === 0) {
        return { success: true, output: result.data || result };
      }
      return { success: false, error: (result && result.message) || 'Skill call failed' };
    });

    // MANUAL_CHECKPOINT - 人工检查点（不执行，等待 advance）
    map.set(STAGE_TYPES.MANUAL_CHECKPOINT, async () => {
      return { success: true, output: null, checkpoint: true };
    });

    // CUSTOM - 自定义函数（stage.executor 或 params.executor）
    map.set(STAGE_TYPES.CUSTOM, async ({ stage, params, context, runId }) => {
      const fn = stage.executor || params.executor;
      if (typeof fn !== 'function') {
        return { success: false, error: 'No executor function for custom stage' };
      }
      const result = await fn({
        runId,
        stage,
        params,
        context,
        serviceBus: self.serviceBus,
        container: self.container,
      });
      return result || { success: true, output: null };
    });

    return map;
  }
}

/**
 * 解析阶段输入：优先从 context 取（前序阶段输出），其次从 params 取
 * @param {object} stage - 阶段定义
 * @param {object} params - 流水线参数
 * @param {object} context - 阶段间上下文
 * @returns {any}
 */
function _resolveInput(stage, params, context) {
  if (stage.inputFrom && context && context[stage.inputFrom] !== undefined) {
    return context[stage.inputFrom];
  }
  if (stage.inputKey && params && params[stage.inputKey] !== undefined) {
    return params[stage.inputKey];
  }
  // 默认 fallback：尝试常见的输入键
  if (params) {
    return params.text || params.prompt || params.prompts ||
           params.assets || params.videoPath || null;
  }
  return null;
}

module.exports = { StageExecutor, STAGE_TYPES };
