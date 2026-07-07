// @ts-check
/**
 * PipelineEngine — 管线编排引擎
 * 管理 13 条内容管线的加载、执行、检查点、暂停/恢复/取消
 */

const path = require('path');

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
];

class PipelineEngine {
  constructor() {
    this._runs = new Map();
    this._currentPipeline = null;
    this._history = [];
  }

  /** 列出所有可用管线 */
  listPipelines() {
    return PIPELINES.map((p) => ({
      name: p.name,
      description: p.description,
      category: p.category,
      stageCount: p.stages.length,
      estimatedCost: p.estimatedCost,
    }));
  }

  /** 获取单个管线详情 */
  getPipeline(name) {
    const pl = PIPELINES.find((p) => p.name === name);
    if (!pl) return null;
    return { ...pl }; // Return full detail including stages
  }

  /** 启动管线执行 */
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
}

module.exports = { PipelineEngine };
