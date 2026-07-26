// @ts-check
/**
 * PipelineEngine - 流水线编排引擎
 *
 * 双模式设计：
 *   1. state_machine（默认）- 仅跟踪状态，不执行阶段工作。与原 13 条流水线行为完全一致。
 *   2. orchestrator（新增）- 通过 StageExecutor 真正执行每个阶段，调用 ServiceBus。
 *
 * 切换方式：
 *   - 旧的同步 start()/advance() 保持 state_machine 行为
 *   - 新的 async startOrchestrated() 进入 orchestrator 模式
 *   - 编排模式下可通过 autoAdvance 自动执行全部阶段
 *
 * 向后兼容：
 *   - 构造函数参数全部可选（无参仍可正常工作，stageExecutor 为 null）
 *   - 所有现有同步方法签名和返回值保持不变
 *   - 现有 13 条流水线无 stage.type 字段，回退为 MANUAL_CHECKPOINT
 */

const path = require('path');
const { StageExecutor, STAGE_TYPES } = require('./stage-executor');
const { cleanupRunInputDir, cleanupImportedMediaPaths } = require('./story2video-paths');
const {
  STORY2VIDEO_PIPELINE,
  normalizeStory2VideoTextParams,
} = require('./story2video-text-config');

// --- 流水线元数据（与 Python pipeline_defs 同步） ---
const PIPELINES = [
  {
    name: 'animated-explainer',
    description: 'AI 生成解释视频 - 从主题/创意到完整视频',
    category: 'generated',
    stages: ['research', 'proposal', 'script', 'scenes', 'assets', 'editing', 'compose', 'publish'],
    estimatedCost: 'medium',
  },
  {
    name: 'talking-head',
    description: '说话头像视频 - 上传视频 + 文案生成带字幕讲话视频',
    category: 'talking_head',
    stages: ['upload', 'transcribe', 'captions', 'render'],
    estimatedCost: 'low',
  },
  {
    name: 'cinematic',
    description: '电影感短片 - 素材视频 → 电影感渲染',
    category: 'cinematic',
    stages: ['ingest', 'grade', 'compose', 'render'],
    estimatedCost: 'medium',
  },
  {
    name: 'animation',
    description: '动画视频 - AI 生成动画序列',
    category: 'animation',
    stages: ['concept', 'storyboard', 'animate', 'render'],
    estimatedCost: 'high',
  },
  {
    name: 'avatar-spokesperson',
    description: '数字人 spokesperson 视频',
    category: 'talking_head',
    stages: ['avatar_select', 'script', 'generate', 'render'],
    estimatedCost: 'high',
  },
  {
    name: 'character-animation',
    description: '角色动画 - AI 驱动角色表演',
    category: 'animation',
    stages: ['character_design', 'rigging', 'animate', 'render'],
    estimatedCost: 'high',
  },
  {
    name: 'clip-factory',
    description: '视频切片工厂 - 从长视频自动提取精彩片段',
    category: 'screen_recording',
    stages: ['analyze', 'extract', 'caption', 'export'],
    estimatedCost: 'low',
  },
  {
    name: 'documentary-montage',
    description: '纪录蒙太奇 - 素材纪录片风格剪辑',
    category: 'cinematic',
    stages: ['research', 'ingest', 'edit', 'narrate', 'render'],
    estimatedCost: 'medium',
  },
  {
    name: 'hybrid',
    description: '混合流水线 - AI 生成 + 实拍素材混合',
    category: 'hybrid',
    stages: ['plan', 'generate', 'merge', 'render'],
    estimatedCost: 'high',
  },
  {
    name: 'localization-dub',
    description: '本地化配音 - 视频翻译 + 多语言配音',
    category: 'hybrid',
    stages: ['transcribe', 'translate', 'tts', 'sync'],
    estimatedCost: 'medium',
  },
  {
    name: 'podcast-repurpose',
    description: '播客转视频 - 音频 → 可视化视频',
    category: 'hybrid',
    stages: ['analyze', 'visualize', 'assemble', 'render'],
    estimatedCost: 'low',
  },
  {
    name: 'screen-demo',
    description: '屏幕演示录制 - 录制 + 自动标注',
    category: 'screen_recording',
    stages: ['record', 'annotate', 'render'],
    estimatedCost: 'low',
  },
  {
    name: 'framework-smoke',
    description: '框架冒烟测试 - 快速验证流水线配置',
    category: 'custom',
    stages: ['verify', 'report'],
    estimatedCost: 'low',
  },
  {
    name: 'story2video-compose',
    description: 'Story2Video 文案转视频 - 分句+提示词优化+资源生成+合成+发布',
    category: 'generated',
    stages: ['split', 'domain_enrich', 'optimize', 'generate_assets', 'compose', 'publish'],
    estimatedCost: 'high',
    // stageDefs 定义每个阶段的执行类型和参数（供 StageExecutor 使用）
    // 旧流水线无 stageDefs 字段，回退为 MANUAL_CHECKPOINT
    stageDefs: [
      {
        name: 'split',
        type: 'split', // 内置 STAGE_TYPES.SPLIT
        description: '文案分句',
        checkpointRequired: false,
        options: {
          language: 'zh',
          mode: 'balanced',
          max_sentence_length: 200,
          target_duration: 6,
          base_words_per_second: 3.3,
          speech_rate: 1,
          min_words: 10,
          max_words: 50,
          enforce_sentence_boundary: true,
          overflow_to_next: true,
          subtitle_min_chars: 8,
          subtitle_max_chars: 15,
          subtitle_timing: 'proportional',
        },
        inputFrom: null, // 从 params.text 取
      },
      {
        name: 'domain_enrich',
        type: 'story2video_domain_enrich', // 历史内容领域增强（可选）
        description: '时代/朝代识别与视觉上下文增强',
        checkpointRequired: false,
        options: {
          contentType: 'general',
        },
        inputFrom: 'split',
      },
      {
        name: 'optimize',
        type: 'optimize_batch', // 内置 STAGE_TYPES.OPTIMIZE_BATCH
        description: '批量提示词优化',
        checkpointRequired: true,
        options: {
          platform: 'generic',
          style: 'realistic', // 必须是 prompt-engine StyleType 枚举值
          creative_level: 5,
          max_length: null,
          negative_prompt: '',
          num_candidates: 1,
          auto_detect_style: true,
          context: '',
        },
        inputFrom: 'domain_enrich', // 从 context.domain_enrich 取
      },
      {
        name: 'generate_assets',
        type: 'story2video_generate_assets', // 自定义类型，由 story2video-stages.js 注册
        description: '并行资源生成（图片 + TTS）',
        checkpointRequired: true,
        options: {
          concurrency: 3,
          imageStyle: 'cinematic',
          imageProvider: null,
          imageModel: null,
          aspectRatio: '9:16',
          voiceId: 'zh_female_qingxinnvsheng_uranus_bigtts',
          voiceProvider: null,
          voiceModel: null,
          voiceSpeed: 1,
          voicePitch: 0,
          voiceEmotion: 'default',
          contentType: 'general',
          inputMode: 'text',
          templateId: null,
        },
        // 从 context.optimize + context.split 取（执行器内部处理）
      },
      {
        name: 'compose',
        type: 'compose', // 内置 STAGE_TYPES.COMPOSE
        description: '视频合成',
        checkpointRequired: true,
        options: {
          // Story2Video 引擎选项
          transition: 'fade',
          imageEffect: 'zoom-in',
          subtitleEnabled: false,
          subtitleStyle: {
            font: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
            size: 'md',
            style: 'style1',
            color: 'white',
          },
          bgmPath: null,
          bgmVolume: 0.5,
          voiceVolume: 1,
          watermark: false,
          watermarkText: '',
          watermarkConfig: {
            enabled: false,
            text: '',
            position: 'bottom-right',
            fontSize: 24,
            opacity: 0.6,
            color: 'white',
          },
          resolution: '720x1280',
          fps: 30,
          format: 'mp4',
          defaultSceneDuration: 6,
          generateBase: true,
          generateMerged: true,
          seconds: 8,
        },
        inputFrom: 'generate_assets', // 从 context.generate_assets 取
      },
      {
        name: 'publish',
        type: 'publish', // 内置 STAGE_TYPES.PUBLISH
        description: '多平台发布',
        checkpointRequired: true,
        options: {
          publishEnabled: false,
          platforms: [],
          title: '',
          content: '',
          tags: [],
          coverUrl: '',
        },
        inputFrom: 'compose', // 从 context.compose 取 videoPath
      },
    ],
  },
];

class PipelineEngine {
  /**
   * @param {object} [deps] - 依赖（全部可选，保证向后兼容）
   * @param {object} [deps.serviceBus] - ServiceBus 实例
   * @param {object} [deps.container] - DI 容器
   * @param {object} [deps.stageExecutor] - 自定义 StageExecutor 实例（不传则自动构造）
   * @param {object} [deps.log] - 日志模块
   */
  constructor(deps) {
    this._runs = new Map();
    this._currentPipeline = null;
    this._history = [];
    this._eventListeners = new Map(); // Backlot 事件系统

    deps = deps || {};
    this.serviceBus = deps.serviceBus || null;
    this.container = deps.container || null;
    this.log = deps.log || require('./logger');
    this.story2videoProjectService = deps.story2videoProjectService || null;

    // 自动构造 StageExecutor（仅在 serviceBus 可用时）
    if (deps.stageExecutor) {
      this.stageExecutor = deps.stageExecutor;
    } else if (this.serviceBus) {
      try {
        this.stageExecutor = new StageExecutor({
          serviceBus: this.serviceBus,
          container: this.container,
          log: this.log,
        });
      } catch (e) {
        this.log.warn('PipelineEngine',
          'StageExecutor init failed: ' + (e instanceof Error ? e.message : String(e)));
        this.stageExecutor = null;
      }
    } else {
      // 无 serviceBus 时退化为纯状态机（兼容旧测试）
      this.stageExecutor = null;
    }
  }

  // ============================================================
  // Backlot 事件系统（on/off/_emit）
  // ============================================================

  /**
   * 订阅事件
   * @param {string} event - 事件名（如 'pipeline:start', 'stage:complete'）
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  on(event, callback) {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, []);
    }
    this._eventListeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  /**
   * 取消订阅事件
   */
  off(event, callback) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }

  /**
   * 发射事件（单个 listener 失败不影响其他）
   * @protected
   */
  _emit(event, data) {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      for (const cb of listeners) {
        try { cb(data); } catch (_) { /* 单个 listener 失败不影响其他 */ }
      }
    }
  }

  /** 列出所有可用流水线（内置 + 动态注册） */
  listPipelines() {
    const builtIn = PIPELINES.map((p) => ({
      name: p.name,
      description: p.description,
      category: p.category,
      stageCount: p.stages.length,
      estimatedCost: p.estimatedCost,
    }));
    const custom = this._customPipelines
      ? Array.from(this._customPipelines.values()).map((p) => ({
          name: p.name,
          description: p.description,
          category: p.category,
          stageCount: p.stages.length,
          estimatedCost: p.estimatedCost,
        }))
      : [];
    return builtIn.concat(custom);
  }

  /** 获取单个流水线详情 */
  getPipeline(name) {
    const pl = PIPELINES.find((p) => p.name === name) ||
               (this._customPipelines && this._customPipelines.get(name));
    if (!pl) return null;
    return { ...pl }; // Return full detail including stages
  }

  /**
   * 动态注册流水线（插件扩展点）
   * 允许 PluginRegistry 或外部模块注册新流水线，无需修改源码中的 PIPELINES 数组
   * @param {object} def - 流水线定义 { name, description, category, stages, stageDefs?, estimatedCost? }
   * @returns {{success: boolean, error?: string}}
   */
  registerPipeline(def) {
    if (!def || !def.name || !Array.isArray(def.stages)) {
      return { success: false, error: 'Pipeline definition requires name and stages array' };
    }
    if (PIPELINES.find((p) => p.name === def.name) ||
        (this._customPipelines && this._customPipelines.has(def.name))) {
      return { success: false, error: 'Pipeline already exists: ' + def.name };
    }
    if (!this._customPipelines) this._customPipelines = new Map();
    this._customPipelines.set(def.name, {
      name: def.name,
      description: def.description || '',
      category: def.category || 'custom',
      stages: def.stages,
      stageDefs: def.stageDefs,
      estimatedCost: def.estimatedCost || 'medium',
    });
    this.log.info('PipelineEngine', 'Registered custom pipeline: ' + def.name);
    return { success: true };
  }

  /** 启动流水线执行（state_machine 模式，同步） */
  start(pipelineName, params) {
    const pl = this.getPipeline(pipelineName);
    if (!pl) return { success: false, error: 'Unknown pipeline: ' + pipelineName };

    const stageDefs = Array.isArray(pl.stageDefs) ? pl.stageDefs : [];
    const stageDefByName = new Map(stageDefs.map((def) => [def.name, def]));
    const runId = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const run = {
      id: runId,
      pipeline: pipelineName,
      status: 'running',
      currentStage: 0,
      stages: pl.stages.map((s, i) => ({
        name: s,
        type: stageDefByName.get(s)?.type,
        requiresCheckpoint: Boolean(
          stageDefByName.get(s)?.checkpointRequired ??
          stageDefByName.get(s)?.requiresCheckpoint,
        ),
        checkpointType: stageDefByName.get(s)?.checkpointType || 'stage',
        status: i === 0 ? 'running' : 'pending',
        startedAt: i === 0 ? new Date().toISOString() : null,
        completedAt: null,
      })),
      params: params || {},
      progress: 0,
      checkpoint: null,
      createdAt: new Date().toISOString(),
      // 编排模式扩展字段（默认 state_machine 模式不使用）
      orchestrationMode: 'state_machine',
      context: {},
      stageResults: [],
    };

    this._runs.set(runId, run);
    this._runs.set('_' + pipelineName, run); // Also index by pipeline name
    this._currentPipeline = pipelineName;

    // Backlot 事件：流水线启动
    this._emit('pipeline:start', { runId, pipelineType: pipelineName, stages: run.stages.map(s => s.name) });

    return { success: true, runId };
  }

  /** 暂停当前流水线 */
  pause() {
    const run = this._getCurrentRun();
    if (!run) return { success: false, error: 'No active pipeline' };
    if (run.status !== 'running') return { success: false, error: 'Pipeline is not running' };

    run.status = 'paused';
    run.stages[run.currentStage].status = 'paused';
    return { success: true };
  }

  /** 恢复流水线执行 */
  resume() {
    const run = this._getCurrentRun();
    if (!run) return { success: false, error: 'No active pipeline' };
    if (run.status !== 'paused') return { success: false, error: 'Pipeline is not paused' };

    run.status = 'running';
    run.stages[run.currentStage].status = 'running';
    return { success: true };
  }

  /** 取消流水线 */
  cancel() {
    const run = this._getCurrentRun();
    if (!run) return { success: false, error: 'No active pipeline' };

    run.cancelled = true;
    run.status = 'cancelled';
    run.stages[run.currentStage].status = 'cancelled';
    // Backlot 事件：流水线取消
    this._emit('pipeline:fail', { runId: run.id, pipelineType: run.pipeline, error: 'cancelled' });
    this._finalizeRun(run, 'cancelled', 'cancelled');
    return { success: true };
  }

  /** 获取流水线运行状态 */
  getStatus(pipelineName) {
    // Try exact run id first, then pipeline name
    const run = this._runs.get(pipelineName) || this._runs.get('_' + pipelineName);
    if (!run) return { status: 'idle', pipeline: pipelineName };

    return {
      id: run.id,
      pipeline: run.pipeline,
      status: run.status,
      currentStage: run.currentStage,
      stages: run.stages,
      totalStages: run.stages.length,
      progress: this._calcProgress(run),
      checkpoint: run.checkpoint,
      createdAt: run.createdAt,
      // 编排模式扩展字段
      orchestrationMode: run.orchestrationMode || 'state_machine',
      contextKeys: run.context ? Object.keys(run.context) : [],
    };
  }

  /** 获取历史执行记录 */
  getHistory() {
    return [...this._history];
  }

  /** 确认检查点（继续下一阶段） */
  advance() {
    const run = this._getCurrentRun();
    if (!run) return { success: false, error: 'No active pipeline' };

    return this._advanceRun(run);
  }

  /**
   * 只推进指定运行，避免 orchestrator 按 runId 执行后误用全局 currentPipeline。
   * @param {object} run
   */
  _advanceRun(run) {
    if (!run || !Array.isArray(run.stages) || !run.stages[run.currentStage]) {
      return { success: false, error: 'No active stage' };
    }

    const completedStageName = run.stages[run.currentStage].name;
    // 检查点只代表当前阶段的暂停状态，推进后不能泄漏到下一个运行快照。
    run.checkpoint = null;
    // Complete current stage
    run.stages[run.currentStage].status = 'completed';
    run.stages[run.currentStage].completedAt = new Date().toISOString();

    // Backlot 事件：阶段完成
    this._emit('stage:complete', { runId: run.id, stageName: completedStageName, stageIndex: run.currentStage });

    // Advance to next stage
    run.currentStage++;
    if (run.currentStage >= run.stages.length) {
      // Backlot 事件：流水线完成
      this._emit('pipeline:complete', { runId: run.id, pipelineType: run.pipeline, totalDuration: Date.now() - new Date(run.createdAt).getTime() });
      this._finalizeRun(run, 'completed');
      return { success: true, message: 'Pipeline completed' };
    }

    run.stages[run.currentStage].status = 'running';
    run.stages[run.currentStage].startedAt = new Date().toISOString();
    run.progress = this._calcProgress(run);

    // Backlot 事件：阶段开始
    this._emit('stage:start', { runId: run.id, stageName: run.stages[run.currentStage].name, stageIndex: run.currentStage });

    // Check if next stage requires user checkpoint
    const checkpoint = run.stages[run.currentStage].requiresCheckpoint || false;

    return { success: true, currentStage: run.stages[run.currentStage].name, checkpoint };
  }

  /** 通过 Python 后端加载流水线完整定义 */
  async fetchPipelineFromBackend(pipelineName) {
    const bridge = this._getPythonBridge();
    if (bridge && bridge.isRunning()) {
      try {
        const result = await bridge.requestBackend('GET', '/api/pipelines/' + pipelineName, null, 10000);
        if (result && result.code === 0 && result.data) {
          // Merge backend data with local metadata
          const local = this.getPipeline(pipelineName);
          return { ...local, fullManifest: result.data };
        }
      } catch {
        // Fall back to local data
      }
    }
    return this.getPipeline(pipelineName);
  }

  // ============================================================
  // 编排模式（Orchestrator）扩展方法
  // ============================================================

  /**
   * 启动编排模式流水线
   * @param {string} pipelineName
   * @param {object} [params] - { autoAdvance?: boolean, ...流水线特定参数 }
   * @returns {Promise<{success: boolean, runId?: string, error?: string, results?: any[], context?: object, paused?: boolean}>}
   */
  async startOrchestrated(pipelineName, params) {
    if (!this.stageExecutor) {
      return {
        success: false,
        error: 'StageExecutor not configured (ServiceBus missing). Use start() for state_machine mode.',
      };
    }
    const pl = this.getPipeline(pipelineName);
    if (!pl) return { success: false, error: 'Unknown pipeline: ' + pipelineName };

    params = params || {};
    if (typeof params !== 'object' || Array.isArray(params)) {
      return { success: false, error: 'Pipeline params must be an object' };
    }
    if (pipelineName === STORY2VIDEO_PIPELINE) {
      try {
        params = normalizeStory2VideoTextParams(params);
      } catch (error) {
        try { cleanupImportedMediaPaths(params); } catch (_) { /* 拒绝非法模式时尽力清理已导入媒体。 */ }
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    const initialContext = params.initialContext !== undefined
      ? params.initialContext
      : (params.context !== undefined ? params.context : {});
    if (!initialContext || typeof initialContext !== 'object' || Array.isArray(initialContext)) {
      return { success: false, error: 'Invalid initialContext: expected an object' };
    }
    let serializedContext;
    try {
      serializedContext = JSON.parse(JSON.stringify(initialContext));
    } catch (e) {
      return { success: false, error: 'Invalid initialContext: ' + e.message };
    }

    // 上下文验证通过后再创建 run，避免非法输入留下孤儿运行。
    const startResult = this.start(pipelineName, params);
    if (!startResult.success) return startResult;

    const runId = startResult.runId;
    const run = this._runs.get(runId);
    if (!run) return { success: false, error: 'Failed to create run' };

    // 标记为编排模式
    run.orchestrationMode = 'orchestrator';
    run.context = serializedContext;
    run.stageResults = [];

    if (params.autoAdvance) {
      return await this._autoAdvanceRun(runId);
    }

    return { success: true, runId };
  }

  /**
   * 执行当前阶段（编排模式）
   * @param {string} runId
   * @returns {Promise<{success: boolean, output?: any, error?: string, checkpoint?: boolean}>}
   */
  async executeStage(runId) {
    const result = await this._executeStage(runId);
    const run = this._runs.get(runId);
    if (!result.success) {
      if (run && !run.cancelled) {
        this._emit('stage:fail', { runId, stageName: run.stages[run.currentStage]?.name, error: result.error });
        this._emit('pipeline:fail', { runId, pipelineType: run.pipeline, error: result.error });
        this._finalizeRun(run, 'failed', result.error);
      }
      return result;
    }
    if (!run || run.orchestrationMode !== 'orchestrator') return result;

    if (result.checkpoint) {
      const stage = run.stages[run.currentStage];
      const checkpoint = this._buildCheckpoint(run, result.checkpointMeta || {
        stageName: stage?.name,
        stageIndex: run.currentStage,
        required: true,
        type: result.checkpoint,
      });
      run.checkpoint = checkpoint;
      run.status = 'paused';
      if (stage) stage.status = 'paused';
      this._emit('checkpoint:pause', {
        runId,
        stageName: stage?.name,
        checkpointType: result.checkpoint,
      });
      return { ...result, checkpointData: checkpoint, paused: true };
    }

    const advResult = this._advanceRun(run);
    if (advResult.message === 'Pipeline completed') {
      return { ...result, completed: true, context: run.context };
    }
    if (!advResult.success && advResult.message !== 'Pipeline completed') {
      this.log.warn('PipelineEngine', 'advance after executeStage: ' + (advResult.message || advResult.error));
    }
    return result;
  }

  /**
   * 执行并自动推进到下一个检查点或完成
   * @param {string} runId
   * @returns {Promise<{success: boolean, results?: any[], context?: object, paused?: boolean, error?: string}>}
   */
  async advanceToNextCheckpoint(runId) {
    const run = this._runs.get(runId);
    if (!run) return { success: false, error: 'Run not found: ' + runId };
    if (run.orchestrationMode !== 'orchestrator') {
      return { success: false, error: 'Run is not in orchestrator mode' };
    }
    if (run.status === 'paused') {
      // 检查点阶段已经执行完毕，确认操作应先完成该阶段，再执行后续阶段。
      const advanced = this._advanceRun(run);
      if (!advanced.success) return advanced;
      if (advanced.message === 'Pipeline completed') {
        return { success: true, runId, context: run.context, completed: true, results: [] };
      }
      run.status = 'running';
      if (run.stages[run.currentStage]) run.stages[run.currentStage].status = 'running';
    }
    return this._autoAdvanceRun(runId);
  }

  /**
   * 获取运行上下文（编排模式）
   * @param {string} runId
   * @returns {object|null}
   */
  getRunContext(runId) {
    const run = this._runs.get(runId);
    if (!run) return null;
    return run.context || null;
  }

  /**
   * 获取供 renderer 使用的运行快照。
   * getRunContext 保持返回原始 context 的兼容性；新接口同时返回状态、阶段和检查点。
   */
  getRunSnapshot(runId) {
    const run = this._runs.get(runId);
    if (!run) return null;
    return {
      runId: run.id,
      pipeline: run.pipeline,
      status: {
        status: run.status,
        currentStage: run.currentStage,
        progress: this._calcProgress(run),
      },
      currentStage: run.currentStage,
      stages: run.stages,
      context: run.context || {},
      checkpoint: run.checkpoint || null,
      orchestrationMode: run.orchestrationMode || 'state_machine',
      createdAt: run.createdAt,
    };
  }

  /**
   * 暂停 + 保存检查点（编排模式增强）
   * 检查点包含 currentStage + context 快照
   */
  pauseWithCheckpoint() {
    const run = this._getCurrentRun();
    if (!run) return { success: false, error: 'No active pipeline' };
    const result = this.pause();
    if (!result.success) return result;

    if (run.orchestrationMode === 'orchestrator') {
      run.checkpoint = this._buildCheckpoint(run, {
        stageName: run.stages[run.currentStage]?.name,
        required: true,
      });
    }
    return { success: true, checkpoint: run.checkpoint };
  }

  /**
   * 从检查点恢复（编排模式增强）
   */
  resumeFromCheckpoint() {
    const run = this._getCurrentRun();
    if (!run) return { success: false, error: 'No active pipeline' };
    const result = this.resume();
    if (!result.success) return result;

    if (run.checkpoint && run.orchestrationMode === 'orchestrator') {
      // 恢复 context（currentStage 已由 pause 保留，无需重置）
      run.context = run.checkpoint.context || run.context;
    }
    return { success: true };
  }

  /**
   * 注册自定义阶段执行器（插件扩展点）
   * @param {string} stageType
   * @param {Function} fn
   * @returns {{success: boolean, error?: string}}
   */
  registerStageExecutor(stageType, fn) {
    if (!this.stageExecutor) {
      return { success: false, error: 'StageExecutor not configured' };
    }
    try {
      this.stageExecutor.register(stageType, fn);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ============================================================
  // 内部辅助方法
  // ============================================================

  _getCurrentRun() {
    if (!this._currentPipeline) return null;
    return this._runs.get('_' + this._currentPipeline);
  }

  _finalizeRun(run, status, error) {
    if (!run || run.endedAt) return;
    run.status = status;
    if (error) run.error = error;
    run.endedAt = new Date().toISOString();
    if (run.pipeline === 'story2video-compose' && status === 'completed' && this.story2videoProjectService) {
      try {
        const project = this.story2videoProjectService.saveRun(run);
        if (project) {
          run.projectId = project.projectId;
          run.context = run.context || {};
          run.context.story2videoProject = project;
        }
      } catch (persistError) {
        run.status = 'failed';
        run.error = 'Story2Video 项目保存失败: ' + persistError.message;
        status = 'failed';
        this.log.error('PipelineEngine', run.error);
      }
    }
    this._history.push({
      ...run,
      stages: Array.isArray(run.stages) ? run.stages.map(stage => ({ ...stage })) : [],
      context: run.context || {},
    });
    this._runs.delete(run.id);
    if (this._runs.get('_' + run.pipeline) === run) {
      this._runs.delete('_' + run.pipeline);
      if (this._currentPipeline === run.pipeline) this._currentPipeline = null;
    }
    if (run.pipeline === 'story2video-compose') {
      try {
        cleanupRunInputDir(run.id);
        cleanupImportedMediaPaths(run.params);
      } catch (cleanupError) {
        this.log.warn('PipelineEngine', 'Story2Video input cleanup failed: ' + cleanupError.message);
      }
    }
  }

  _calcProgress(run) {
    const completed = run.stages.filter((s) => s.status === 'completed').length;
    return Math.round((completed / run.stages.length) * 100);
  }

  _getPythonBridge() {
    try { return require('./python-bridge'); } catch { return null; }
  }

  /**
   * 执行单个阶段（内部实现）
   * @param {string} runId
   * @returns {Promise<{success: boolean, output?: any, error?: string, checkpoint?: boolean}>}
   */
  async _executeStage(runId) {
    const run = this._runs.get(runId);
    if (!run) return { success: false, error: 'Run not found: ' + runId };
    if (run.orchestrationMode !== 'orchestrator') {
      return { success: false, error: 'Run is not in orchestrator mode' };
    }
    const stage = run.stages[run.currentStage];
    if (!stage) return { success: false, error: 'No stage to execute' };

    // 合并流水线定义中的 stage 元数据（type, options, inputFrom 等）
    // 旧流水线无 stageDefs，stageDef 为空对象，type 为 undefined → 回退为 MANUAL_CHECKPOINT
    const pl = this.getPipeline(run.pipeline);
    const stageDef = (pl && Array.isArray(pl.stageDefs))
      ? (pl.stageDefs.find((s) => s.name === stage.name) || {})
      : {};
    const fullStage = {
      ...stageDef,
      ...stage,
      options: {
        ...(stageDef.options || {}),
        ...(stage.options || {}),
        ...resolveRuntimeStageOptions(stage.name, run.params),
      },
    };

    const result = await this.stageExecutor.execute({
      runId,
      stage: fullStage,
      params: run.params,
      context: run.context || {},
    });
    if (run.cancelled || this._runs.get(runId) !== run) {
      return { success: false, cancelled: true, error: 'Run cancelled' };
    }

    // 阶段执行成功且有输出 -> 写入 context 供后续阶段使用
    if (result.success && result.output !== undefined) {
      run.context = run.context || {};
      run.context[stage.name] = result.output;
    }
    const normalizedResult = { ...result };
    if (normalizedResult.success && this._shouldCheckpoint(fullStage, run.params)) {
      normalizedResult.checkpoint = normalizedResult.checkpoint || fullStage.checkpointType || 'stage';
      normalizedResult.checkpointMeta = {
        stageName: stage.name,
        stageIndex: run.currentStage,
        required: true,
        type: normalizedResult.checkpoint,
      };
    }

    run.stageResults.push({
      stage: stage.name,
      success: normalizedResult.success,
      error: normalizedResult.error,
      checkpoint: normalizedResult.checkpointMeta || null,
      timestamp: new Date().toISOString(),
    });

    return normalizedResult;
  }

  _shouldCheckpoint(stage, params) {
    const policy = params && params.checkpointPolicy;
    if (policy === 'none') return false;
    if (policy === 'manual_all') return stage.name !== 'split';
    if (policy === 'auto_noncreative') {
      return ['optimize', 'compose', 'publish'].includes(stage.name);
    }
    return Boolean(stage.requiresCheckpoint || stage.checkpointRequired);
  }

  _buildCheckpoint(run, meta) {
    return {
      ...(meta || {}),
      currentStage: run.currentStage,
      context: JSON.parse(JSON.stringify(run.context || {})),
      savedAt: new Date().toISOString(),
    };
  }

  /**
   * 自动推进执行，直到遇到检查点或完成
   * @param {string} runId
   * @returns {Promise<{success: boolean, results?: any[], context?: object, paused?: boolean, error?: string}>}
   */
  async _autoAdvanceRun(runId) {
    const run = this._runs.get(runId);
    if (!run) return { success: false, error: 'Run not found: ' + runId };

    const results = [];
    while (run.status === 'running') {
      const stage = run.stages[run.currentStage];
      if (!stage) break;

      const execResult = await this._executeStage(runId);
      results.push({ stage: stage.name, ...execResult });

      if (!execResult.success) {
        // Backlot 事件：阶段失败 + 流水线失败
        this._emit('stage:fail', { runId, stageName: stage.name, error: execResult.error });
        this._emit('pipeline:fail', { runId, pipelineType: run.pipeline, error: execResult.error });
        this._finalizeRun(run, 'failed', execResult.error);
        return {
          success: false,
          runId,
          results,
          context: run.context,
          error: execResult.error,
        };
      }

      // 遇到人工检查点 → 暂停并返回
      if (execResult.checkpoint) {
        const checkpoint = this._buildCheckpoint(run, execResult.checkpointMeta || {
          stageName: stage.name,
          stageIndex: run.currentStage,
          required: true,
          type: execResult.checkpoint,
        });
        run.checkpoint = checkpoint;
        run.status = 'paused';
        stage.status = 'paused';
        // Backlot 事件：检查点暂停
        this._emit('checkpoint:pause', { runId, stageName: stage.name, checkpointType: execResult.checkpoint });
        return {
          success: true,
          runId,
          results,
          context: run.context,
          checkpoint,
          paused: true,
        };
      }

      // 推进到下一阶段（同步 advance）
      const advResult = this._advanceRun(run);
      if (!advResult.success) {
        // 流水线完成或出错
        if (advResult.message === 'Pipeline completed') {
          return {
            success: true,
            runId,
            results,
            context: run.context,
            completed: true,
          };
        }
        break;
      }
    }

    return {
      success: true,
      runId,
      results,
      context: run.context,
      completed: run.status === 'completed',
    };
  }
}

/**
 * 将 renderer 传入的运行时配置合并到阶段 options。
 * 阶段定义提供安全默认值，用户参数只覆盖同一阶段允许的配置键。
 */
function resolveRuntimeStageOptions(stageName, params) {
  const input = params || {};
  const stageOptions = input.stageOptions && input.stageOptions[stageName];
  const result = stageOptions && typeof stageOptions === 'object' ? { ...stageOptions } : {};
  const set = (key, value) => {
    if (value !== undefined && value !== null) result[key] = value;
  };

  if (stageName === 'split') {
    set('mode', input.splitMode);
    set('language', input.language);
  } else if (stageName === 'optimize') {
    set('style', input.promptStyle || input.imageStyle || input.style);
    set('platform', input.promptPlatform || input.platform);
    set('creative_level', input.creativeLevel);
    set('num_candidates', input.numCandidates);
  } else if (stageName === 'generate_assets') {
    set('concurrency', input.concurrency);
    set('imageStyle', input.imageStyle);
    set('imageProvider', input.imageProvider);
    set('imageModel', input.imageModel);
    set('aspectRatio', input.aspectRatio);
    set('voiceId', input.voiceId);
    set('voiceProvider', input.voiceProvider);
    set('voiceModel', input.voiceModel);
    set('voiceSpeed', input.voiceSpeed);
    set('voicePitch', input.voicePitch);
    set('voiceEmotion', input.voiceEmotion);
    set('contentType', input.contentType);
    set('inputMode', input.inputMode);
    set('images', input.images);
    set('audio', input.audio);
    set('allowPartialAssets', input.allowPartialAssets);
    set('templateId', input.templateId);
  } else if (stageName === 'domain_enrich') {
    set('contentType', input.contentType);
  } else if (stageName === 'compose') {
    set('transition', input.transition);
    set('imageEffect', input.imageEffect);
    set('subtitleEnabled', input.subtitleEnabled);
    set('subtitleStyle', input.subtitleStyle);
    set('bgmPath', input.bgmPath);
    set('bgmVolume', input.bgmVolume);
    set('watermark', input.watermark);
    set('watermarkText', input.watermarkText);
    set('watermarkConfig', input.watermarkConfig);
    set('voiceVolume', input.voiceVolume);
    set('templateId', input.templateId);
    set('resolution', input.resolution || input.output?.resolution);
    set('fps', input.fps || input.output?.fps);
    set('format', input.format || input.output?.format);
  } else if (stageName === 'publish') {
    set('platforms', input.platforms);
    set('title', input.title || input.output?.title);
    set('content', input.content || input.text);
    set('tags', input.tags);
    set('publishEnabled', input.publishEnabled);
  }

  return result;
}

module.exports = { PipelineEngine, STAGE_TYPES };
