// @ts-check
/**
 * PipelineEngine - 管线编排引擎
 *
 * 双模式设计：
 *   1. state_machine（默认）- 仅跟踪状态，不执行阶段工作。与原 13 条管线行为完全一致。
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
 *   - 现有 13 条管线无 stage.type 字段，回退为 MANUAL_CHECKPOINT
 */

const path = require('path');
const { StageExecutor, STAGE_TYPES } = require('./stage-executor');

// --- 管线元数据（与 Python pipeline_defs 同步） ---
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
    description: '混合管线 - AI 生成 + 实拍素材混合',
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
    description: '框架冒烟测试 - 快速验证管线配置',
    category: 'custom',
    stages: ['verify', 'report'],
    estimatedCost: 'low',
  },
  {
    name: 'story2video-compose',
    description: 'Story2Video 文案转视频 - 分句+提示词优化+资源生成+合成+发布',
    category: 'generated',
    stages: ['split', 'optimize', 'generate_assets', 'compose', 'publish'],
    estimatedCost: 'high',
    // stageDefs 定义每个阶段的执行类型和参数（供 StageExecutor 使用）
    // 旧管线无 stageDefs 字段，回退为 MANUAL_CHECKPOINT
    stageDefs: [
      {
        name: 'split',
        type: 'split', // 内置 STAGE_TYPES.SPLIT
        description: '文案分句',
        options: {
          // smart-sentence-splitter 选项
          mode: 'semantic',
        },
        inputFrom: null, // 从 params.text 取
      },
      {
        name: 'optimize',
        type: 'optimize_batch', // 内置 STAGE_TYPES.OPTIMIZE_BATCH
        description: '批量提示词优化',
        options: {
          style: 'cinematic',
        },
        inputFrom: 'split', // 从 context.split 取
      },
      {
        name: 'generate_assets',
        type: 'story2video_generate_assets', // 自定义类型，由 story2video-stages.js 注册
        description: '并行资源生成（图片 + TTS）',
        options: {
          concurrency: 3,
          imageStyle: 'cinematic',
          aspectRatio: '16:9',
          voiceId: 'default',
        },
        // 从 context.optimize + context.split 取（执行器内部处理）
      },
      {
        name: 'compose',
        type: 'compose', // 内置 STAGE_TYPES.COMPOSE
        description: '视频合成',
        options: {
          // Story2Video 引擎选项
          transition: 'fade',
          subtitleEnabled: true,
        },
        inputFrom: 'generate_assets', // 从 context.generate_assets 取
      },
      {
        name: 'publish',
        type: 'publish', // 内置 STAGE_TYPES.PUBLISH
        description: '多平台发布',
        options: {},
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

    deps = deps || {};
    this.serviceBus = deps.serviceBus || null;
    this.container = deps.container || null;
    this.log = deps.log || require('./logger');

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

  /** 列出所有可用管线（内置 + 动态注册） */
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

  /** 获取单个管线详情 */
  getPipeline(name) {
    const pl = PIPELINES.find((p) => p.name === name) ||
               (this._customPipelines && this._customPipelines.get(name));
    if (!pl) return null;
    return { ...pl }; // Return full detail including stages
  }

  /**
   * 动态注册管线（插件扩展点）
   * 允许 PluginRegistry 或外部模块注册新管线，无需修改源码中的 PIPELINES 数组
   * @param {object} def - 管线定义 { name, description, category, stages, stageDefs?, estimatedCost? }
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

  /** 启动管线执行（state_machine 模式，同步） */
  start(pipelineName, params) {
    const pl = this.getPipeline(pipelineName);
    if (!pl) return { success: false, error: 'Unknown pipeline: ' + pipelineName };

    const runId = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const run = {
      id: runId,
      pipeline: pipelineName,
      status: 'running',
      currentStage: 0,
      stages: pl.stages.map((s, i) => ({
        name: s,
        status: i === 0 ? 'running' : 'pending',
        startedAt: i === 0 ? new Date().toISOString() : null,
        completedAt: null,
      })),
      params,
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
    return { success: true, runId };
  }

  /** 暂停当前管线 */
  pause() {
    const run = this._getCurrentRun();
    if (!run) return { success: false, error: 'No active pipeline' };
    if (run.status !== 'running') return { success: false, error: 'Pipeline is not running' };

    run.status = 'paused';
    run.stages[run.currentStage].status = 'paused';
    return { success: true };
  }

  /** 恢复管线执行 */
  resume() {
    const run = this._getCurrentRun();
    if (!run) return { success: false, error: 'No active pipeline' };
    if (run.status !== 'paused') return { success: false, error: 'Pipeline is not paused' };

    run.status = 'running';
    run.stages[run.currentStage].status = 'running';
    return { success: true };
  }

  /** 取消管线 */
  cancel() {
    const run = this._getCurrentRun();
    if (!run) return { success: false, error: 'No active pipeline' };

    run.status = 'cancelled';
    run.stages[run.currentStage].status = 'cancelled';
    this._history.push({ ...run, endedAt: new Date().toISOString() });
    this._runs.delete(run.id);
    this._runs.delete('_' + run.pipeline);
    this._currentPipeline = null;
    return { success: true };
  }

  /** 获取管线运行状态 */
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

    // Complete current stage
    run.stages[run.currentStage].status = 'completed';
    run.stages[run.currentStage].completedAt = new Date().toISOString();

    // Advance to next stage
    run.currentStage++;
    if (run.currentStage >= run.stages.length) {
      run.status = 'completed';
      this._history.push({ ...run, endedAt: new Date().toISOString() });
      this._runs.delete(run.id);
      this._runs.delete('_' + run.pipeline);
      this._currentPipeline = null;
      return { success: true, message: 'Pipeline completed' };
    }

    run.stages[run.currentStage].status = 'running';
    run.stages[run.currentStage].startedAt = new Date().toISOString();
    run.progress = this._calcProgress(run);

    // Check if next stage requires user checkpoint
    const checkpoint = run.stages[run.currentStage].requiresCheckpoint || false;

    return { success: true, currentStage: run.stages[run.currentStage].name, checkpoint };
  }

  /** 通过 Python 后端加载管线完整定义 */
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
   * 启动编排模式管线
   * @param {string} pipelineName
   * @param {object} [params] - { autoAdvance?: boolean, ...管线特定参数 }
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

    // 先调用同步 start 创建 run
    const startResult = this.start(pipelineName, params);
    if (!startResult.success) return startResult;

    const runId = startResult.runId;
    const run = this._runs.get(runId);
    if (!run) return { success: false, error: 'Failed to create run' };

    // 标记为编排模式
    run.orchestrationMode = 'orchestrator';
    run.context = {};
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
    return this._executeStage(runId);
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
   * 暂停 + 保存检查点（编排模式增强）
   * 检查点包含 currentStage + context 快照
   */
  pauseWithCheckpoint() {
    const run = this._getCurrentRun();
    if (!run) return { success: false, error: 'No active pipeline' };
    const result = this.pause();
    if (!result.success) return result;

    if (run.orchestrationMode === 'orchestrator') {
      run.checkpoint = {
        currentStage: run.currentStage,
        context: JSON.parse(JSON.stringify(run.context || {})),
        savedAt: new Date().toISOString(),
      };
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

    // 合并管线定义中的 stage 元数据（type, options, inputFrom 等）
    // 旧管线无 stageDefs，stageDef 为空对象，type 为 undefined → 回退为 MANUAL_CHECKPOINT
    const pl = this.getPipeline(run.pipeline);
    const stageDef = (pl && Array.isArray(pl.stageDefs))
      ? (pl.stageDefs.find((s) => s.name === stage.name) || {})
      : {};
    const fullStage = { ...stageDef, ...stage };

    const result = await this.stageExecutor.execute({
      runId,
      stage: fullStage,
      params: run.params,
      context: run.context || {},
    });

    // 阶段执行成功且有输出 → 写入 context 供后续阶段使用
    if (result.success && result.output !== undefined) {
      run.context = run.context || {};
      run.context[stage.name] = result.output;
    }
    run.stageResults.push({
      stage: stage.name,
      success: result.success,
      error: result.error,
      timestamp: new Date().toISOString(),
    });

    return result;
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
        run.status = 'failed';
        run.error = execResult.error;
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
        this.pause();
        return {
          success: true,
          runId,
          results,
          context: run.context,
          paused: true,
        };
      }

      // 推进到下一阶段（同步 advance）
      const advResult = this.advance();
      if (!advResult.success) {
        // 管线完成或出错
        if (advResult.message === 'Pipeline completed') {
          return {
            success: true,
            runId,
            results,
            context: run.context,
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
    };
  }
}

module.exports = { PipelineEngine, STAGE_TYPES };
