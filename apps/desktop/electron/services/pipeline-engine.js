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

const os = require('os');
const { StageExecutor, STAGE_TYPES } = require('./stage-executor');
const { cleanupRunInputDir, cleanupImportedMediaPaths } = require('./story2video-paths');
const {
  STORY2VIDEO_PIPELINE,
  normalizeStory2VideoTextParams,
} = require('./story2video-text-config');

/**
 * 依据机器资源计算默认后台并发上限（低配保守、高配放宽）：
 * - 可用并行度 ≥8 且可用内存 ≥8GB → 4
 * - 可用并行度 ≥4 且可用内存 ≥4GB → 3
 * - 可用并行度 <2 或可用内存 <2GB → 1
 * - 其余 → 2
 * 最终封顶 [1, 4]。env 可注入（测试用）：{ cpus, freeMemGB }。
 * 说明：compose 阶段 ffmpeg 合成 CPU/内存密集（27 场景曾触发 x264 OOM），
 * API 阶段受 api-usage-governor 限流，因此高配也不超过 4 条。
 */
function computeDefaultMaxConcurrentRuns(env = {}) {
  const cpus = Number.isFinite(Number(env.cpus)) ? Number(env.cpus)
    : (typeof os.availableParallelism === 'function' ? os.availableParallelism() : (os.cpus ? os.cpus().length : 1))
  const freeMemGB = Number.isFinite(Number(env.freeMemGB)) ? Number(env.freeMemGB)
    : (os.freemem ? os.freemem() / (1024 ** 3) : 2)
  let limit = 2
  if (cpus >= 8 && freeMemGB >= 8) limit = 4
  else if (cpus >= 4 && freeMemGB >= 4) limit = 3
  else if (cpus < 2 || freeMemGB < 2) limit = 1
  return Math.max(1, Math.min(4, limit))
}

// --- 流水线元数据（与 Python pipeline_defs 同步） ---
const PIPELINES = [
  {
    name: 'animated-explainer',
    description: 'AI 生成解释视频 - 从主题/创意到完整视频',
    category: 'generated',
    stages: ['research', 'proposal', 'script', 'scenes', 'assets', 'editing', 'compose', 'publish'],
    estimatedCost: 'medium',
    // 真实编排：LLM 规划链（explainer-stages.js 注册）→ 图片+旁白 → FFmpeg 合成 → 发布（可选）
    stageDefs: [
      {
        name: 'research',
        type: 'explainer_research',
        description: '主题研究生成大纲',
        checkpointRequired: false,
      },
      {
        name: 'proposal',
        type: 'explainer_proposal',
        description: '大纲转分镜方案',
        checkpointRequired: false,
      },
      {
        name: 'script',
        type: 'explainer_script',
        description: '分镜转旁白文案',
        checkpointRequired: false,
      },
      {
        name: 'scenes',
        type: 'explainer_scenes',
        description: '文案拆分为视频场景',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'assets',
        type: 'explainer_generate_assets',
        description: '生成图片与旁白',
        checkpointRequired: false,
        options: {
          concurrency: 3,
          imageStyle: 'cinematic',
          imageProvider: null,
          imageModel: null,
          aspectRatio: '16:9',
        },
      },
      {
        name: 'editing',
        type: 'explainer_editing',
        description: '资源清单校验',
        checkpointRequired: false,
      },
      {
        name: 'compose',
        type: 'compose',
        description: '视频合成',
        checkpointRequired: false,
        inputFrom: 'assets',
        options: {
          transition: 'fade',
          imageEffect: 'zoom-in',
          subtitleEnabled: false,
          resolution: '1920x1080',
          fps: 30,
          format: 'mp4',
          defaultSceneDuration: 6,
          generateBase: true,
          generateMerged: true,
        },
      },
      {
        name: 'publish',
        type: 'publish',
        description: '发布（可选）',
        checkpointRequired: false,
        inputFrom: 'compose',
        options: {},
      },
    ],
  },
  {
    name: 'talking-head',
    description: '说话头像视频 - 上传视频 + 文案生成带字幕讲话视频',
    category: 'talking_head',
    stages: ['upload', 'transcribe', 'captions', 'render'],
    estimatedCost: 'low',
    // 真实编排：视频+文案 → 分句 → SRT 字幕 → FFmpeg 烧录（talkinghead-stages.js 注册）
    stageDefs: [
      {
        name: 'upload',
        type: 'talkinghead_upload',
        description: '视频与文案校验',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'transcribe',
        type: 'talkinghead_transcribe',
        description: '文案分句',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'captions',
        type: 'talkinghead_captions',
        description: '生成字幕',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'render',
        type: 'talkinghead_render',
        description: '字幕烧录渲染',
        checkpointRequired: false,
        options: {},
      },
    ],
  },
  {
    name: 'cinematic',
    description: '电影感短片 - 素材视频 → 电影感渲染',
    category: 'cinematic',
    stages: ['ingest', 'grade', 'compose', 'render'],
    estimatedCost: 'medium',
    // 真实编排：本地 FFmpeg 调色→淡入淡出+分辨率合成→渲染（cinematic-stages.js 注册）
    stageDefs: [
      {
        name: 'ingest',
        type: 'cinematic_ingest',
        description: '输入视频校验与探测',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'grade',
        type: 'cinematic_grade',
        description: '电影感调色',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'compose',
        type: 'cinematic_compose',
        description: '淡入淡出与分辨率合成',
        checkpointRequired: false,
        options: { resolution: '1920x1080' },
      },
      {
        name: 'render',
        type: 'cinematic_render',
        description: '渲染输出',
        checkpointRequired: false,
        options: {},
      },
    ],
  },
  {
    name: 'animation',
    description: '动画视频 - AI 生成动画序列',
    category: 'animation',
    stages: ['concept', 'storyboard', 'animate', 'render'],
    estimatedCost: 'high',
    // 真实编排：LLM 概念→分镜→视频生成 provider（未配置时 fail closed 引导设置）→FFmpeg 合成（videogen-stages.js 注册）
    stageDefs: [
      { name: 'concept', type: 'videogen_concept', description: '创意概念与角色设定', checkpointRequired: false, options: { kind: 'animation' } },
      { name: 'storyboard', type: 'videogen_storyboard', description: '分镜场景规划', checkpointRequired: false, options: { kind: 'animation' } },
      { name: 'animate', type: 'videogen_generate', description: '视频生成', checkpointRequired: false, options: {} },
      { name: 'render', type: 'videogen_merge', description: '拼接合成与产物校验', checkpointRequired: false, options: {} },
    ],
  },
  {
    name: 'avatar-spokesperson',
    description: '数字人 spokesperson 视频',
    category: 'talking_head',
    stages: ['avatar_select', 'script', 'generate', 'render'],
    estimatedCost: 'high',
    // 真实编排：数字人选择+LLM 口播文案→视频生成 provider→FFmpeg 合成（videogen-stages.js 注册）
    stageDefs: [
      { name: 'avatar_select', type: 'videogen_avatar', description: '数字人选择与口播文案', checkpointRequired: false, options: {} },
      { name: 'script', type: 'videogen_script', description: '口播文案', checkpointRequired: false, options: {} },
      { name: 'generate', type: 'videogen_generate', description: '数字人视频生成', checkpointRequired: false, options: {} },
      { name: 'render', type: 'videogen_merge', description: '拼接合成与产物校验', checkpointRequired: false, options: {} },
    ],
  },
  {
    name: 'character-animation',
    description: '角色动画 - AI 驱动角色表演',
    category: 'animation',
    stages: ['character_design', 'rigging', 'animate', 'render'],
    estimatedCost: 'high',
    // 真实编排：LLM 角色设计→概念校验→视频生成 provider→FFmpeg 合成（videogen-stages.js 注册）
    stageDefs: [
      { name: 'character_design', type: 'videogen_concept', description: '角色设计', checkpointRequired: false, options: { kind: 'character-animation' } },
      { name: 'rigging', type: 'videogen_storyboard', description: '角色动作分镜', checkpointRequired: false, options: { kind: 'character-animation' } },
      { name: 'animate', type: 'videogen_generate', description: '角色动画生成', checkpointRequired: false, options: {} },
      { name: 'render', type: 'videogen_merge', description: '拼接合成与产物校验', checkpointRequired: false, options: {} },
    ],
  },
  {
    name: 'clip-factory',
    description: '视频切片工厂 - 从长视频自动提取精彩片段',
    category: 'screen_recording',
    stages: ['analyze', 'extract', 'caption', 'export'],
    estimatedCost: 'low',
    // 真实编排：本地 FFmpeg 场景检测→逐段剪辑→标题→合并导出（clipfactory-stages.js 注册）
    stageDefs: [
      {
        name: 'analyze',
        type: 'clipfactory_analyze',
        description: '场景检测与时长分析',
        checkpointRequired: false,
        options: { sceneThreshold: 0.3, maxSegments: 8, minSegmentSeconds: 2, maxTotalSeconds: 60 },
      },
      {
        name: 'extract',
        type: 'clipfactory_extract',
        description: '逐段剪辑',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'caption',
        type: 'clipfactory_caption',
        description: '片段标题',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'export',
        type: 'clipfactory_export',
        description: '合并导出',
        checkpointRequired: false,
        options: {},
      },
    ],
  },
  {
    name: 'documentary-montage',
    description: '纪录蒙太奇 - 素材纪录片风格剪辑',
    category: 'cinematic',
    stages: ['research', 'ingest', 'edit', 'narrate', 'render'],
    estimatedCost: 'medium',
    // 真实编排：LLM 纪录片大纲→场景规划→图片+旁白→资源校验→FFmpeg 合成（documentary-stages.js 注册）
    stageDefs: [
      {
        name: 'research',
        type: 'documentary_research',
        description: '纪录片风格主题研究',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'ingest',
        type: 'documentary_ingest',
        description: '素材画面规划（场景数组）',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'edit',
        type: 'documentary_edit',
        description: '生成图片与旁白素材',
        checkpointRequired: false,
        options: {
          concurrency: 3,
          imageStyle: 'documentary',
          aspectRatio: '16:9',
        },
      },
      {
        name: 'narrate',
        type: 'documentary_narrate',
        description: '旁白与资源清单校验',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'render',
        type: 'compose',
        description: '视频合成',
        checkpointRequired: false,
        inputFrom: 'edit',
        options: {
          transition: 'fade',
          imageEffect: 'ken-burns',
          subtitleEnabled: false,
          resolution: '1920x1080',
          fps: 30,
          format: 'mp4',
          defaultSceneDuration: 6,
          generateBase: true,
          generateMerged: true,
        },
      },
    ],
  },
  {
    name: 'hybrid',
    description: '混合流水线 - AI 生成 + 实拍素材混合',
    category: 'hybrid',
    stages: ['plan', 'generate', 'merge', 'render'],
    estimatedCost: 'high',
    // 真实编排：LLM 方案→视频生成 provider→FFmpeg 拼接（videogen-stages.js 注册）
    stageDefs: [
      { name: 'plan', type: 'videogen_script', description: '混合方案与解说文案', checkpointRequired: false, options: {} },
      { name: 'generate', type: 'videogen_storyboard', description: '生成场景规划', checkpointRequired: false, options: { kind: 'hybrid' } },
      { name: 'merge', type: 'videogen_generate', description: '视频生成', checkpointRequired: false, options: {} },
      { name: 'render', type: 'videogen_merge', description: '拼接合成与产物校验', checkpointRequired: false, options: {} },
    ],
  },
  {
    name: 'localization-dub',
    description: '本地化配音 - 视频翻译 + 多语言配音',
    category: 'hybrid',
    stages: ['transcribe', 'translate', 'tts', 'sync'],
    estimatedCost: 'medium',
    // 真实编排：源视频+文案→分句时间段→LLM 翻译→TTS 配音→FFmpeg 替换音轨（localization-stages.js 注册）
    stageDefs: [
      {
        name: 'transcribe',
        type: 'localization_transcribe',
        description: '源视频与文案校验、时长探测',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'translate',
        type: 'localization_translate',
        description: '台词翻译为目标语言',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'tts',
        type: 'localization_tts',
        description: '逐段生成配音',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'sync',
        type: 'localization_sync',
        description: '拼接配音并替换原音轨',
        checkpointRequired: false,
        options: {},
      },
    ],
  },
  {
    name: 'podcast-repurpose',
    description: '播客转视频 - 音频 → 可视化视频',
    category: 'hybrid',
    stages: ['analyze', 'visualize', 'assemble', 'render'],
    estimatedCost: 'low',
    stageDefs: [
      {
        name: 'analyze',
        type: 'podcast_analyze',
        description: '音频时长探测 + 文案分句成时间段',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'visualize',
        type: 'podcast_visualize',
        description: '每段文案生成配图',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'assemble',
        type: 'podcast_assemble',
        description: '切分音频片段并组装场景',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'render',
        type: 'compose',
        description: '视频合成（图片 + 音频片段 + 转场）',
        checkpointRequired: false,
        inputFrom: 'assemble',
        options: {
          transition: 'fade',
          imageEffect: 'none',
          subtitleEnabled: false,
          resolution: '720x1280',
          fps: 30,
          format: 'mp4',
          defaultSceneDuration: 6,
          voiceVolume: 1,
        },
      },
    ],
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
    // 真实编排：验证工具链 → 生成冒烟测试视频与报告（smoketest-stages.js 注册）
    stageDefs: [
      {
        name: 'verify',
        type: 'smoketest_verify',
        description: '验证 FFmpeg/ffprobe 与流水线注册表',
        checkpointRequired: false,
        options: {},
      },
      {
        name: 'report',
        type: 'smoketest_report',
        description: '生成冒烟测试视频与报告',
        checkpointRequired: false,
        options: {},
      },
    ],
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
          language: 'auto',
          mode: 'balanced',
          max_sentence_length: 200,
          target_duration: 6,
          base_words_per_second: 3.3,
          speech_rate: 1,
          target_chars_per_scene: 20,
          min_words: 10,
          max_words: 50,
          enforce_sentence_boundary: true,
          overflow_to_next: true,
          subtitle_min_chars: 8,
          subtitle_max_chars: 15,
          subtitle_timing: 'proportional',
          fallback_to_local: true,
          require_scene_output: true,
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
        type: 'story2video_optimize', // 自定义类型：统一走 prompt-engine（8013）
        description: '图片提示词统一经 prompt-engine 优化（风格检测/改写/输出校验）',
        checkpointRequired: true,
        options: {
          platform: 'generic',
          style: 'realistic',
          creative_level: 5,
          max_length: 300,
          num_candidates: 1,
          auto_detect_style: true,
          negative_prompt: '',
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
          voiceId: 'default',
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
          sceneDurationMode: 'follow-audio',
          minSceneDuration: 6,
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
   * @param {object} [deps.aiGenerator] - 当前默认模型调用器
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
    this.aiGenerator = deps.aiGenerator || null;
    this.story2videoProjectService = deps.story2videoProjectService || null;
    this.runStateStore = deps.runStateStore || null;
    this.governor = deps.governor || null;
    // 后台并行运行上限（编排模式）：同机资源有限（ffmpeg 合成 CPU 密集、API 受 governor 限流）。
    // 优先级：deps.maxConcurrentRuns 显式注入（测试/调优）> STORY2VIDEO_MAX_CONCURRENT_RUNS 环境变量开关
    // （如设 2 即固定 2 条，1-8 合法，非法/空回退自适应）> 机器资源自适应（computeDefaultMaxConcurrentRuns，1-4 条）。
    const envLimit = Number(process.env.STORY2VIDEO_MAX_CONCURRENT_RUNS)
    this.maxConcurrentRuns = Number.isFinite(Number(deps.maxConcurrentRuns)) && Number(deps.maxConcurrentRuns) > 0
      ? Number(deps.maxConcurrentRuns)
      : (Number.isFinite(envLimit) && envLimit > 0 ? Math.min(8, Math.floor(envLimit)) : computeDefaultMaxConcurrentRuns());
    // 内存历史上限：_history 保留最近 N 条 run 快照，防止长期运行内存无限增长。
    // 断点恢复跨重启依赖 RunStateStore 持久快照，不受内存历史裁剪影响。
    this.maxHistoryEntries = Number.isFinite(Number(deps.maxHistoryEntries)) && Number(deps.maxHistoryEntries) > 0
      ? Number(deps.maxHistoryEntries)
      : 50;

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
    const prioritizedBuiltIn = [
      ...PIPELINES.filter((pipeline) => pipeline.name === STORY2VIDEO_PIPELINE),
      ...PIPELINES.filter((pipeline) => pipeline.name !== STORY2VIDEO_PIPELINE),
    ]
    const hasRealStages = (p) => Array.isArray(p.stageDefs) && p.stageDefs.length > 0
    const builtIn = prioritizedBuiltIn.map((p) => ({
      name: p.name,
      description: p.description,
      category: p.category,
      stageCount: p.stages.length,
      estimatedCost: p.estimatedCost,
      // 是否已实现真实执行引擎：有 stageDefs 即认为可真实运行
      available: hasRealStages(p),
    }));
    const custom = this._customPipelines
      ? Array.from(this._customPipelines.values()).map((p) => ({
          name: p.name,
          description: p.description,
          category: p.category,
          stageCount: p.stages.length,
          estimatedCost: p.estimatedCost,
          available: hasRealStages(p),
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
      // 已用时统计：各执行段实际耗时累计（毫秒），_executeStage 为唯一累计点；暂停/检查点等待/失败→恢复空闲不计入
      activeMs: 0,
      _activeSegmentStartedAt: null,
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
    // 已用时口径说明（W1 审查闭环）：cancel 为同步操作，若当前执行器在飞，本段耗时由 _executeStage 的
    // finally 在异步结算后累加进该 run 对象；终态 history/快照在 finalize 时浅拷贝 activeMs，因此取消瞬间
    // 的在飞半段不计入已取消记录的展示值（已取消任务不可断点恢复，仅影响取消记录的时长展示，可接受）。
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

  /**
   * 获取历史执行记录（含运行中未完成的编排流水线，便于历史页实时查看进度）。
   * 运行中 run 在前，终态历史在后；_runs 中 <runId> 与 _<pipelineName> 指向同一对象，需去重。
   */
  getHistory() {
    const seen = new Set();
    const seenIds = new Set();
    const active = [];
    for (const run of this._runs.values()) {
      if (seen.has(run)) continue;
      seen.add(run);
      if (run.id) seenIds.add(run.id);
      active.push(run);
    }
    for (const item of this._history) {
      if (item && item.id) seenIds.add(item.id);
    }
    // 合并持久化快照（runStateStore）：应用重启后，失败/取消任务仍显示在历史记录中；
    // 运行中断（强杀/退出兜底）的任务以 running 状态显示，可「从断点继续」。
    // 与内存 run/_history 按 runId 去重，避免同一条任务重复展示。
    const persisted = [];
    if (this.runStateStore) {
      const listers = []
      if (typeof this.runStateStore.listFailed === 'function') listers.push(() => this.runStateStore.listFailed())
      if (typeof this.runStateStore.listRunning === 'function') listers.push(() => this.runStateStore.listRunning())
      try {
        for (const lister of listers) {
        for (const snapshot of lister()) {
          const id = snapshot.runId
          if (!id || seenIds.has(id)) continue
          seenIds.add(id)
          persisted.push({
            id,
            pipeline: snapshot.pipeline,
            status: snapshot.status || 'failed',
            currentStage: Number.isInteger(snapshot.currentStage) ? snapshot.currentStage : 0,
            stages: Array.isArray(snapshot.stages) ? snapshot.stages.map((s) => ({ ...s })) : [],
            context: snapshot.context && typeof snapshot.context === 'object' ? snapshot.context : {},
            params: snapshot.params && typeof snapshot.params === 'object' ? snapshot.params : {},
            error: snapshot.error || null,
            orchestrationMode: snapshot.orchestrationMode || 'orchestrator',
            createdAt: snapshot.createdAt || snapshot.endedAt || null,
            updatedAt: snapshot.endedAt || snapshot.createdAt || null,
            completedAt: snapshot.endedAt || null,
            // 已用时：持久化快照携带 activeMs（旧快照无该字段时为 null，由前端回退链处理）
            activeMs: Number.isFinite(Number(snapshot.activeMs)) ? Number(snapshot.activeMs) : null,
          })
        }
        }
      } catch (_) { /* 快照读取失败不影响历史展示 */ }
    }
    return [...active, ...this._history, ...persisted];
  }

  /** 当前正在运行的编排流水线数量（去重 _<name> 索引）。 */
  _countActiveRuns() {
    const seen = new Set();
    let count = 0;
    for (const run of this._runs.values()) {
      if (seen.has(run)) continue;
      seen.add(run);
      if (run.orchestrationMode === 'orchestrator' && run.status === 'running') count += 1;
    }
    return count;
  }

  /** 是否存在运行中的编排流水线（去重 _<name> 索引；供窗口关闭→托盘决策）。 */
  hasRunningOrchestration() {
    const seen = new Set();
    for (const run of this._runs.values()) {
      if (seen.has(run)) continue;
      seen.add(run);
      if (run.orchestrationMode === 'orchestrator' && run.status === 'running') return true;
    }
    return false;
  }

  /**
   * 退出兜底：把所有运行中的编排流水线落盘为 running 快照。
   * 与阶段级 checkpoint（_saveRunningCheckpoint）互补，保证窗口关闭/退出瞬间
   * 的进行中任务在重启后仍可见并可「从断点继续」（2026-08-09 方案B）。
   * @returns {number} 成功落盘的任务数
   */
  saveRunningState() {
    if (!this.runStateStore || typeof this.runStateStore.saveRunning !== 'function') return 0;
    const seen = new Set();
    let saved = 0;
    for (const run of this._runs.values()) {
      if (seen.has(run)) continue;
      seen.add(run);
      if (run.orchestrationMode !== 'orchestrator' || run.status !== 'running') continue;
      try {
        if (this.runStateStore.saveRunning(run)) saved += 1;
      } catch (e) {
        this.log.warn('PipelineEngine', 'running state save failed: ' + (e && e.message ? e.message : String(e)));
      }
    }
    return saved;
  }

  /**
   * 阶段级 checkpoint：编排流水线进入某阶段执行前，把当前进度落盘为 running 快照。
   * 应用被强杀（taskkill /F）或异常退出时，仍能保留「该阶段未完成」的断点；
   * 恢复时从当前阶段重新执行（阶段级原子性：快照在 execute 之前写入）。
   */
  _saveRunningCheckpoint(run) {
    if (!run || run.orchestrationMode !== 'orchestrator' || !this.runStateStore) return;
    try {
      this.runStateStore.saveRunning(run);
    } catch (e) {
      this.log.warn('PipelineEngine', 'running checkpoint save failed: ' + (e && e.message ? e.message : String(e)));
    }
  }

  /** 后台并行上限检查：超过 maxConcurrentRuns 时拒绝启动/恢复。 */
  _assertConcurrencyBudget() {
    const activeCount = this._countActiveRuns();
    if (activeCount >= this.maxConcurrentRuns) {
      return {
        success: false,
        error: '当前已有 ' + activeCount + ' 条流水线正在运行，最多同时运行 ' + this.maxConcurrentRuns + ' 条，请等待其中一条完成后再启动。',
        errorCode: 'PIPELINE_CONCURRENCY_LIMIT',
        errorParams: { count: activeCount, max: this.maxConcurrentRuns },
      };
    }
    return null;
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
      // Backlot 事件：流水线完成（totalDuration 用步骤执行耗时累计口径，不用墙钟 createdAt→now）
      this._emit('pipeline:complete', { runId: run.id, pipelineType: run.pipeline, totalDuration: this._computeElapsedMs(run) });
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
   * @returns {Promise<{success: boolean, runId?: string, error?: string, errorCode?: string|null, errorParams?: { max?: number }|null, results?: any[], context?: object, paused?: boolean}>}
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
        // BGM 可复用（前端配置仍引用），归一化拒绝回滚清理同样跳过，避免重试时 BGM 丢失。
        try { cleanupImportedMediaPaths(params, { skipBgm: true }); } catch (_) { /* 拒绝非法模式时尽力清理已导入媒体。 */ }
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          errorCode: error?.code || null,
          errorParams: error?.params || null,
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

    // 后台并行上限：超过 maxConcurrentRuns 拒绝启动（资源保护）。
    const concurrencyBlock = this._assertConcurrencyBudget();
    if (concurrencyBlock) return concurrencyBlock;
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

    // 阶段级 checkpoint：启动即落盘 running 快照，应用退出/强杀后任务不丢失。
    this._saveRunningCheckpoint(run);

    if (params.autoAdvance) {
      if (params.background === true) {
        // 后台自动推进：立即返回 runId，renderer 通过 getRunSnapshot 轮询阶段进度。
        // 若同步等待整个流水线完成，IPC 会阻塞数十秒到数分钟，前端启动后无任何交互反馈。
        const promise = this._autoAdvanceRun(runId);
        promise.catch((err) => {
          this.log.warn('PipelineEngine', 'background autoAdvance failed: ' + (err && err.message ? err.message : String(err)));
        });
        return { success: true, runId };
      }
      return await this._autoAdvanceRun(runId);
    }

    return { success: true, runId };
  }

  /**
   * 从失败/中断断点恢复编排流水线（断点续跑）。
   * 数据源：本次会话内存 history，或 RunStateStore 持久化快照（跨应用重启仍可恢复）。
   * - 失败快照：从失败阶段重新执行；
   * - 运行中快照（应用退出/强杀兜底落盘）：从中断阶段重新执行（阶段级原子性）。
   * 前序阶段输出（context）与已完成的资源直接复用。
   * 内容政策失败（needs_user_input）不允许恢复，必须修改文案后重新启动。
   * @param {string} runId
   * @returns {Promise<{success: boolean, runId?: string, alreadyRunning?: boolean, error?: string, errorCode?: string}>}
   */
  async resumeOrchestration(runId) {
    if (typeof runId !== 'string' || !runId.trim()) {
      return { success: false, error: '缺少或非法 runId' };
    }
    // 同会话幂等：内存中已是 running 的编排 run 直接返回，避免重复创建运行
    // （renderer 重载/重复点击「继续」时，主进程仍在后台执行该任务）。
    const activeRun = this._runs.get(runId);
    if (activeRun && activeRun.orchestrationMode === 'orchestrator' && activeRun.status === 'running') {
      return { success: true, runId: activeRun.id, alreadyRunning: true };
    }
    const historyRun = this._history.find((item) => item.id === runId);
    let snapshot = historyRun || null;
    if (!snapshot && this.runStateStore) {
      try { snapshot = await this.runStateStore.load(runId); } catch (_) { snapshot = null; }
    }
    if (!snapshot) return { success: false, error: '未找到可恢复的运行快照', errorCode: 'RUN_SNAPSHOT_NOT_FOUND' };
    if (snapshot.status === 'failed') {
      // 失败快照必须携带 error 才可恢复（无 error 的 failed 属于异常数据）
      if (!snapshot.error) {
        return { success: false, error: '只有失败或中断状态的运行可以恢复', errorCode: 'RUN_NOT_FAILED' };
      }
    } else if (snapshot.status !== 'running') {
      return { success: false, error: '只有失败或中断状态的运行可以恢复', errorCode: 'RUN_NOT_FAILED' };
    }
    if ((snapshot.orchestrationMode || 'state_machine') !== 'orchestrator') {
      return { success: false, error: '该运行不支持断点恢复', errorCode: 'RUN_NOT_ORCHESTRATOR' };
    }
    if (/needs_user_input|content[_\s-]?policy|CONTENT_POLICY/i.test(String(snapshot.error || ''))) {
      return { success: false, error: '该失败需要人工处理（内容政策），请修改文案后重新启动', errorCode: 'PIPELINE_USER_INPUT_REQUIRED' };
    }
    const failedStageIndex = (Number.isInteger(snapshot.currentStage) && snapshot.currentStage >= 0)
      ? snapshot.currentStage
      : (Array.isArray(snapshot.stages) ? snapshot.stages.findIndex((s) => s.status === 'failed') : -1);
    if (failedStageIndex < 0) {
      return { success: false, error: '未定位到失败阶段', errorCode: 'STAGE_NOT_FOUND' };
    }

    const pl = this.getPipeline(snapshot.pipeline);
    const stages = (Array.isArray(snapshot.stages) && snapshot.stages.length > 0)
      ? snapshot.stages
      : ((pl && Array.isArray(pl.stages)) ? pl.stages.map((name) => ({ name })) : []);
    if (stages.length === 0) return { success: false, error: '失败快照缺少阶段定义', errorCode: 'STAGE_NOT_FOUND' };
    // 后台并行上限：恢复也算占用运行槽位。
    const concurrencyBlock = this._assertConcurrencyBudget();
    if (concurrencyBlock) return concurrencyBlock;

    // 内存 history 条目使用 id，RunStateStore 快照使用 runId
    const runIdentifier = String(snapshot.runId || snapshot.id || '')
    if (!runIdentifier) return { success: false, error: '失败快照缺少 runId', errorCode: 'RUN_SNAPSHOT_NOT_FOUND' }

    const now = new Date().toISOString();
    const restored = {
      id: runIdentifier,
      pipeline: snapshot.pipeline,
      status: 'running',
      currentStage: failedStageIndex,
      stages: stages.map((s, i) => {
        const base = { ...s };
        delete base.error;
        if (i < failedStageIndex) {
          return { ...base, status: 'completed', startedAt: base.startedAt || now, completedAt: base.completedAt || now };
        }
        if (i === failedStageIndex) {
          return { ...base, status: 'running', startedAt: now, completedAt: null };
        }
        return { ...base, status: 'pending', startedAt: null, completedAt: null };
      }),
      params: snapshot.params || {},
      progress: 0,
      checkpoint: null,
      createdAt: snapshot.createdAt || now,
      endedAt: null,
      // 断点恢复继承历史累计执行耗时；在飞段从恢复时刻重新起算（不落盘，防停机时间膨胀）
      activeMs: Number.isFinite(Number(snapshot.activeMs)) ? Number(snapshot.activeMs) : 0,
      _activeSegmentStartedAt: null,
      orchestrationMode: 'orchestrator',
      context: JSON.parse(JSON.stringify(snapshot.context || {})),
      stageResults: [],
      resumedFrom: runId,
      error: null,
    };
    this._runs.set(restored.id, restored);
    this._runs.set('_' + restored.pipeline, restored);
    this._currentPipeline = restored.pipeline;
    if (this.runStateStore) {
      try { this.runStateStore.remove(runId); } catch (_) { /* 快照清理失败不影响恢复 */ }
    }

    const promise = this._autoAdvanceRun(restored.id);
    promise.catch((err) => {
      this.log.warn('PipelineEngine', 'background resume autoAdvance failed: ' + (err && err.message ? err.message : String(err)));
    });
    return { success: true, runId: restored.id };
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
      return { ...result, completed: true, context: run.context, activeMs: this._computeElapsedMs(run) };
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
      const checkpoint = run.checkpoint || {};
      if (checkpoint.type === 'needs_user_input' || checkpoint.reason === 'content_policy') {
        return {
          success: false,
          runId,
          paused: true,
          needsUserInput: true,
          checkpoint,
          error: 'Checkpoint requires user input before the pipeline can continue',
          errorCode: 'PIPELINE_USER_INPUT_REQUIRED',
        };
      }
      // 检查点阶段已经执行完毕，确认操作应先完成该阶段，再执行后续阶段。
      const advanced = this._advanceRun(run);
      if (!advanced.success) return advanced;
      if (advanced.message === 'Pipeline completed') {
        return { success: true, runId, context: run.context, completed: true, results: [], activeMs: this._computeElapsedMs(run) };
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
    const run = this._runs.get(runId) || this._history.find((item) => item.id === runId);
    if (!run) return null;
    // 已用时（步骤执行耗时累计口径）：activeMs 为已结算累计，elapsedActiveMs 额外包含运行中在飞段增量
    // （统一走 _computeElapsedMs，避免公式漂移）。
    const activeMs = Number.isFinite(Number(run.activeMs)) ? Number(run.activeMs) : null;
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
      endedAt: run.endedAt || null,
      error: run.error || null,
      projectId: run.projectId || null,
      outputSizeBytes: this._runOutputSizeBytes(run) || null,
      activeMs,
      activeSegmentStartedAt: Number.isFinite(run._activeSegmentStartedAt) ? new Date(run._activeSegmentStartedAt).toISOString() : null,
      elapsedActiveMs: activeMs !== null ? this._computeElapsedMs(run) : null,
    };
  }

  /**
   * 计算运行已用时长（步骤执行耗时累计口径）：
   * - 编排模式：run.activeMs（各执行段之和）+ 运行中在飞段增量；
   * - state_machine / 旧数据：无 activeMs 时回退 0（不参与编排「已用时」展示，由前端回退链处理）。
   * 暂停/检查点等待/失败→恢复的空闲时间不累计；唯一累计点 _executeStage。
   */
  _computeElapsedMs(run) {
    if (!run) return 0;
    const activeMs = Number.isFinite(Number(run.activeMs)) ? Number(run.activeMs) : 0;
    if (run.status === 'running' && Number.isFinite(run._activeSegmentStartedAt)) {
      return activeMs + Math.max(0, Date.now() - run._activeSegmentStartedAt);
    }
    return activeMs;
  }

  /** 已完成运行的成片文件大小（供「完成汇总」展示），非完成/无成片时返回 null。 */
  _runOutputSizeBytes(run) {
    if (!run || run.status !== 'completed') return null
    const context = run.context || {}
    const composeRaw = context.compose?.data || context.compose
    const exportRaw = context.export?.data || context.export
    const reportRaw = context.report?.data || context.report
    const videoPath = (composeRaw && (composeRaw.videoPath || composeRaw.path)) ||
      (exportRaw && (exportRaw.videoPath || exportRaw.path)) ||
      (reportRaw && (reportRaw.videoPath || reportRaw.path))
    if (typeof videoPath !== 'string' || !videoPath) return null
    try {
      const stat = require('fs').statSync(videoPath)
      return Number.isFinite(stat.size) ? stat.size : null
    } catch {
      return null
    }
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
    // 执行日志：运行终态（完成/失败/取消）+ 总耗时 + 错误摘要（截断，不含敏感原文）
    const finalizeDurationMs = run.startedAt ? Date.now() - new Date(run.startedAt).getTime() : null;
    const finalizeDurationText = Number.isFinite(finalizeDurationMs) ? 'duration_ms=' + finalizeDurationMs : 'duration_ms=null';
    const finalizeErrorText = error ? ' error=' + String(error).slice(0, 500) : '';
    if (status === 'failed' || status === 'cancelled') {
      this.log.warn('PipelineEngine', '[run] finalize run=' + run.id + ' pipeline=' + run.pipeline + ' status=' + status + ' ' + finalizeDurationText + finalizeErrorText);
    } else {
      this.log.info('PipelineEngine', '[run] finalize run=' + run.id + ' pipeline=' + run.pipeline + ' status=' + status + ' ' + finalizeDurationText);
    }
    // 编排模式终态（失败/取消）：持久化断点快照。失败供 pipeline:resumeOrchestration 从断点继续；
    // 取消也落盘，避免「断点续跑后任务从历史记录消失」——恢复时会删除旧快照，若续跑后再次取消，
    // 必须保留新的终态快照，否则应用重启后该任务在历史中丢失。
    if ((status === 'failed' || status === 'cancelled') && run.orchestrationMode === 'orchestrator' && this.runStateStore) {
      try {
        this.runStateStore.saveFailed(run);
      } catch (saveError) {
        this.log.warn('PipelineEngine', 'run-state snapshot save failed: ' + (saveError && saveError.message ? saveError.message : String(saveError)));
      }
    }
    // 运行中 checkpoint 清理：完成态不留 running 快照，否则重启后已完成任务会
    // 以「运行中」状态重新出现在历史（失败/取消已由上方 saveFailed 覆盖同文件）。
    if (status === 'completed' && run.orchestrationMode === 'orchestrator' && this.runStateStore) {
      try {
        this.runStateStore.remove(run.id);
      } catch (removeError) {
        this.log.warn('PipelineEngine', 'completed run-state snapshot remove failed: ' + (removeError && removeError.message ? removeError.message : String(removeError)));
      }
    }
    if (['story2video-compose', 'animated-explainer', 'clip-factory', 'cinematic', 'framework-smoke', 'talking-head', 'documentary-montage', 'localization-dub', 'animation', 'avatar-spokesperson', 'character-animation', 'hybrid'].includes(run.pipeline) && status === 'completed' && this.story2videoProjectService) {
      try {
        const project = this.story2videoProjectService.saveRun(run);
        if (project) {
          run.projectId = project.projectId;
          run.context = run.context || {};
          run.context.story2videoProject = project;
        }
      } catch (persistError) {
        run.status = 'failed';
        run.error = 'Story2Video 项目保存失败: ' + persistError.message;        this.log.error('PipelineEngine', run.error);
      }
    }
    const historyEntry = {
      ...run,
      stages: Array.isArray(run.stages) ? run.stages.map(stage => ({ ...stage })) : [],
      context: run.context || {},
    };
    // 同 runId 只保留最新一条终态记录：断点续跑复用同一 id，避免新旧终态重复展示。
    const existingIndex = this._history.findIndex(item => item && item.id === run.id);
    if (existingIndex >= 0) this._history[existingIndex] = historyEntry;
    else this._history.push(historyEntry);
    // 裁剪最旧快照，控制内存占用（RunStateStore 是跨重启恢复的权威源）
    if (this._history.length > this.maxHistoryEntries) {
      this._history.splice(0, this._history.length - this.maxHistoryEntries);
    }
    this._runs.delete(run.id);
    if (this._runs.get('_' + run.pipeline) === run) {
      this._runs.delete('_' + run.pipeline);
      if (this._currentPipeline === run.pipeline) this._currentPipeline = null;
    }
    if (run.pipeline === 'story2video-compose') {
      try {
        cleanupRunInputDir(run.id);
        // BGM 为可复用导入（前端配置仍引用该路径），收尾清理必须跳过，
        // 避免重试/断点续跑时 compose 因 BGM 文件被删而失败（2026-08-09 排查）。
        cleanupImportedMediaPaths(run.params, { skipBgm: true });
      } catch (cleanupError) {
        this.log.warn('PipelineEngine', 'Story2Video input cleanup failed: ' + cleanupError.message);
      }
    }
    // W2 技术债务闭环：run 结束（完成/失败/取消）时统一回收 governor 中已过期的排队 waiter，
    // 避免因该 key 无后续释放导致排队请求悬挂到任务链结束。
    if (this.governor && typeof this.governor.sweepAll === 'function') {
      try { this.governor.sweepAll(); } catch (sweepError) {
        this.log.warn('PipelineEngine', 'governor sweepAll failed: ' + (sweepError && sweepError.message ? sweepError.message : String(sweepError)));
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

    const stageStartMs = Date.now();
    const stageIndex = run.currentStage;
    this.log.info('PipelineEngine', '[exec] stage start run=' + runId + ' pipeline=' + run.pipeline + ' stage=' + stage.name + ' (' + (stageIndex + 1) + '/' + run.stages.length + ')');
    // 阶段级 checkpoint：执行前落盘 running 快照（阶段级原子性——中断后从当前阶段重新执行）。
    this._saveRunningCheckpoint(run);
    // 已用时统计（唯一权威源）：以执行器真实运行窗口为段，成功/失败/取消/异常都累计进 run.activeMs；
    // 暂停/检查点等待/失败→恢复空闲期间执行器未运行，自然不计入；在飞段不落盘（防停机时间膨胀）。
    const execStartedAt = Date.now();
    run._activeSegmentStartedAt = execStartedAt;
    let execResult;
    try {
      execResult = await this.stageExecutor.execute({
        runId,
        stage: fullStage,
        params: run.params,
        context: run.context || {},
      });
    } finally {
      run.activeMs = (Number.isFinite(run.activeMs) ? run.activeMs : 0) + Math.max(0, Date.now() - execStartedAt);
      run._activeSegmentStartedAt = null;
    }
    if (run.cancelled || this._runs.get(runId) !== run) {
      this.log.warn('PipelineEngine', '[exec] stage cancelled run=' + runId + ' stage=' + stage.name);
      return { success: false, cancelled: true, error: 'Run cancelled' };
    }
    const result = execResult;

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

    this.log.info('PipelineEngine', '[exec] stage end run=' + runId + ' pipeline=' + run.pipeline + ' stage=' + stage.name + ' success=' + normalizedResult.success + ' duration_ms=' + (Date.now() - stageStartMs) + (normalizedResult.error ? ' error=' + String(normalizedResult.error).slice(0, 500) : ''));
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
    set('creative_level', input.creativeLevel);
    set('negative_prompt', input.negativePrompt);
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
    set('sceneDurationMode', input.sceneDurationMode);
    set('minSceneDuration', input.minSceneDuration);
  } else if (stageName === 'publish') {
    set('platforms', input.platforms);
    set('title', input.title || input.output?.title);
    set('content', input.content || input.text);
    set('tags', input.tags);
    set('publishEnabled', input.publishEnabled);
  }

  return result;
}

module.exports = { PipelineEngine, STAGE_TYPES, computeDefaultMaxConcurrentRuns };
