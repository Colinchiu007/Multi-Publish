// @ts-check
/**
 * Container setup — 集中注册所有 Electron 主进程服务
 * 可作为逐步替换 main.js 直接 new 的中间步骤
 */
'use strict';

// Container DI 容器（JS 版本，与 container.test.ts 测试一致）
const Container = require("./container");

// 输出分辨率能力开关（运营后台）：环境变量 → 运营功能开关（phase1 注入）→ store 设置 → 默认 1080p（禁止 4K）。
// 运营配置键 videoCreation.maxOutputResolution：'1080p' | '4k'；未知值一律按 1080p（fail-closed）。
function resolveMaxOutputResolution (store, getFeatureFlag) {
  const env = process.env.MAX_OUTPUT_RESOLUTION;
  if (env === '4k' || env === '1080p') return env;
  if (typeof getFeatureFlag === 'function') {
    try {
      const flag = getFeatureFlag('videoCreation.maxOutputResolution');
      if (flag === '4k' || flag === '1080p') return flag;
    } catch (_) { /* 功能开关读取失败走下一级 */ }
  }
  try {
    const stored = store && typeof store.getSetting === 'function'
      ? store.getSetting('videoCreation.maxOutputResolution')
      : null;
    if (stored === '4k' || stored === '1080p') return stored;
  } catch (_) { /* store 未就绪时走默认 */ }
  return '1080p';
}

// 运营功能开关提供者（phase1 注入 opsCenterSync.getFeatureFlag；引擎惰性读取当前值）
let _featureFlagProvider = null;
function setFeatureFlagProvider (fn) {
  _featureFlagProvider = typeof fn === 'function' ? fn : null;
}
function getFeatureFlagProvider (key) {
  return _featureFlagProvider ? _featureFlagProvider(key) : undefined;
}

// -- 本模块加载的依赖（最终目标是到 container 中获取） --
const RenderEngine = require('../services/render-engine');
const { CompositionManager } = require('../services/composition-manager');
const { AIGenerator } = require('../services/ai-generator');
const { VideoEngine } = require('../services/video-engine');
const { PipelineEngine } = require('../services/pipeline-engine');
const AuthViewManager = require('../services/auth-view-manager');
const RpaViewManager = require('../services/rpa-view-manager');
const WebviewManager = require('../services/webview-manager');
const CallbackServer = require('../services/callback-server');
const QrCodeLogin = require('../services/qrcode-login');
const Store = require("../services/store");
const ContentIntelligence = require('../services/content-intelligence');
const PublishImpactTracker = require('../services/publish-impact-tracker');
const KeywordMonitor = require('../services/keyword-monitor');
const OAuthManager = require('../services/oauth-manager');
const BatchManager = require('../services/batch-manager');
const UrlCollector = require('../services/url-collector');
const ViralEngine = require('../services/viral-engine');
const CommentManager = require('../services/comment-manager');
const ProviderManager = require('../services/provider-manager');
const { TaskQueue, AggregatorBridge, ChunkedUploader, ProxyPool, AnalyticsService } = require("@multi-publish/shared-utils");
const PublishIntervalGuard = require("@multi-publish/shared-utils/src/publish-interval-guard");
const TemplateManager = require('../services/template-manager');
const AiWriter = require('../services/ai-writer');
const { PublisherRouter } = require('../services/publisher-router');
const UsageTracker = require('../services/usage-tracker');
const DataSyncService = require("@multi-publish/shared-utils/src/data-sync");
// Backlot 项目库服务
const { ProjectService } = require('../services/project-service');
const { BoardService } = require('../services/board-service');
const { ContactSheetService } = require('../services/contact-sheet-service');
const { ApprovalGateService } = require('../services/approval-gate-service');
// Backlot 生产回放录制服务
const { ExecutionRecorder } = require('../services/execution-recorder');
// -- 基础设施 & 横切服务 --
const logger = require('../services/logger');
const pythonBridge = require('../services/python-bridge');
const SplitterBridge = require('../services/splitter-bridge');
const PromptBridge = require('../services/prompt-bridge');
const ServiceBus = require('../services/service-bus');
const PluginRegistry = require('../services/plugin-registry');
const { registerStory2VideoStages } = require('../services/story2video-stages');
const { ApiUsageGovernor } = require('../services/api-usage-governor');
const { PROVIDER_LIMITS } = require('../services/governor-provider-limits');
const { RunStateStore } = require('../services/run-state-store');
const { registerExplainerStages } = require('../services/explainer-stages');
const { registerClipFactoryStages } = require('../services/clipfactory-stages');
const { registerCinematicStages } = require('../services/cinematic-stages');
const { registerSmokeTestStages } = require('../services/smoketest-stages');
const { registerTalkingHeadStages } = require('../services/talkinghead-stages');
const { registerDocumentaryStages } = require('../services/documentary-stages');
const { registerLocalizationStages } = require('../services/localization-stages');
const { registerVideoGenStages } = require('../services/videogen-stages');
const { registerPodcastRepurposeStages } = require('../services/podcast-repurpose-stages');

function createContainer(options) {
  const container = new Container();
  options = options || {};

  // ---- 无依赖服务 ----
  container.register("authViewManager", function() { return new AuthViewManager(); });
  container.register("rpaViewManager", function() { return new RpaViewManager(); });
  container.register("webviewManager", function() { return new WebviewManager(); });
  container.register("callbackServer", function() { return new CallbackServer(); });
  container.register("qrCodeLogin", function() { return new QrCodeLogin(); });
  container.register("renderEngine", function() { return new RenderEngine(); });
  container.register("compositionManager", function() { return new CompositionManager(); });
  container.register("aiGenerator", function() { return new AIGenerator(); });
  container.register("apiUsageGovernor", function(c) { return new ApiUsageGovernor({ log: c.get("logger"), providerLimits: PROVIDER_LIMITS }); });
  container.register("runStateStore", function(c) { return new RunStateStore({ log: c.get("logger") }); });
  container.register("videoEngine", function() { return new VideoEngine(); });
  // PipelineEngine 注入 serviceBus + container（用于编排模式）
  // 注意：需要懒加载 serviceBus（避免循环依赖），通过工厂函数延迟到首次 get 时解析
  container.register("pipelineEngine", function(c) {
    const engine = new PipelineEngine({
      serviceBus: c.get("serviceBus"),
      container: c,
      log: c.get("logger"),
      aiGenerator: c.get("aiGenerator"),
      story2videoProjectService: c.get("story2videoProjectService"),
      runStateStore: c.get("runStateStore"),
      governor: c.get("apiUsageGovernor"),
    });
    // 注册 story2video-compose 流水线的自定义阶段执行器
    if (engine.stageExecutor) {
      try {
        registerStory2VideoStages(engine);
        registerExplainerStages(engine);
        registerClipFactoryStages(engine);
        registerCinematicStages(engine);
        registerSmokeTestStages(engine);
        registerTalkingHeadStages(engine);
        registerDocumentaryStages(engine);
        registerLocalizationStages(engine);
        registerVideoGenStages(engine);
        registerPodcastRepurposeStages(engine);
      } catch (e) {
        c.get("logger").warn("container",
          "registerStory2VideoStages failed: " + (e instanceof Error ? e.message : String(e)));
      }
    }
    return engine;
  });
  container.register("urlCollector", function() { return new UrlCollector(); });
  container.register("viralEngine", function() { return new ViralEngine(); });
  container.register("commentManager", function() { return new CommentManager(); });
  container.register("providerManager", function() { return new ProviderManager(); });
  container.register("proxyPool", function() { return new ProxyPool(); });
  container.register("analyticsService", function() { return new AnalyticsService(); });
  container.register("templateManager", function() { return new TemplateManager(); });
  container.register("aiWriter", function() { return new AiWriter(); });
  container.register("usageTracker", function() { return new UsageTracker(); });
  container.register("chunkedUploader", function() { return new ChunkedUploader(); });

  // ---- Backlot 项目库服务 ----
  container.register("projectService", function(c) { return new ProjectService(c.get("store")); });
  container.register("boardService", function(c) {
    const bs = new BoardService({
      pipelineEngine: c.get("pipelineEngine"),
      projectService: c.get("projectService"),
      getMainWindow: null, // 将在 extractContext 中接线
    });
    bs.startListening();
    return bs;
  });
  // ContactSheet 审批服务（依赖 pipelineEngine + boardService）
  container.register("contactSheetService", function(c) {
    const cs = new ContactSheetService({
      pipelineEngine: c.get("pipelineEngine"),
      boardService: c.get("boardService"),
      getMainWindow: null, // 将在 extractContext 中接线
    });
    cs.startListening();
    return cs;
  });
  // ApprovalGate 审批门服务（依赖 pipelineEngine + boardService）
  container.register("approvalGateService", function(c) {
    const ag = new ApprovalGateService({
      pipelineEngine: c.get("pipelineEngine"),
      boardService: c.get("boardService"),
      getMainWindow: null, // 将在 extractContext 中接线
    });
    ag.startListening();
    return ag;
  });
  // ExecutionRecorder 生产回放录制服务（依赖 projectService + pipelineEngine + boardService）
  container.register("executionRecorder", function(c) {
    const er = new ExecutionRecorder({
      projectService: c.get("projectService"),
      pipelineEngine: c.get("pipelineEngine"),
      boardService: c.get("boardService"),
    });
    er.startListening();
    return er;
  });

  // ---- 有依赖的服务 ----
  container.register("store", function() { return new Store(); });
  container.register("contentIntelligence", function(c) { return new ContentIntelligence(c.get("store")); });
  container.register("publishImpactTracker", function(c) { return new PublishImpactTracker(c.get("contentIntelligence")); });
  container.register("keywordMonitor", function(c) { return new KeywordMonitor(c.get("contentIntelligence"), c.get("store")); });
  container.register("oauthManager", function(c) { return new OAuthManager(c.get("store")); });
  container.register("batchManager", function(c) { return new BatchManager(c.get("store")); });
  container.register("dataSync", function(c) { return new DataSyncService(c.get("store")); });
  container.register("taskQueue", function() { return new TaskQueue(options.taskQueue || { maxConcurrent: 3 }); });
  container.register("aggregatorBridge", function(c) { return new AggregatorBridge(c.get("taskQueue")); });
  container.register("publisherRouter", function() { return new PublisherRouter(); });
  container.register("publishIntervalGuard", function(c) {
    const s = c.get("store");
    return new PublishIntervalGuard({
      store: {
        get: (key) => s.getPublishTimeline(key),
        set: (key, value) => s.setPublishTimeline(key, value),
      }
    });
  });

  // ---- 基础设施 & 横切服务 ----
  // logger/pythonBridge 模块级单例（非类），直接注册实例
  container.register("logger", function() { return logger; });
  container.register("pythonBridge", function() { return pythonBridge; });
  // SplitterBridge/PromptBridge 为类，构造函数接收 { log }
  container.register("splitterBridge", function(c) { return new SplitterBridge({ log: c.get("logger") }); });
  container.register("promptBridge", function(c) { return new PromptBridge({ log: c.get("logger") }); });
  // Story2Video 合成引擎（基于 ffmpeg，替代占位 null）
  container.register("story2videoEngine", function(c) {
    const { Story2VideoComposeEngine } = require('../services/story2video-compose-engine');
    const store = c.get("store");
    return new Story2VideoComposeEngine({
      log: c.get("logger"),
      maxOutputResolution: resolveMaxOutputResolution(store, getFeatureFlagProvider),
      getMaxOutputResolution: () => resolveMaxOutputResolution(store, getFeatureFlagProvider),
    });
  });
  container.register("story2videoProjectService", function(c) {
    const { Story2VideoProjectService } = require('../services/story2video-project-service');
    return new Story2VideoProjectService({
      store: c.get("store"),
      composeEngine: c.get("story2videoEngine"),
      assetGenerator: c.get("assetGenerator"),
      aiGenerator: c.get("aiGenerator"),
      log: c.get("logger"),
    });
  });
  // AssetGenerator - 资源生成（图片 + TTS），供 generate_assets 阶段使用
  container.register("assetGenerator", function(c) {
    const { AssetGenerator } = require('../services/asset-generator');
    return new AssetGenerator({ log: c.get("logger"), aiGenerator: c.get("aiGenerator") });
  });
  // ServiceBus 统一聚合所有 Bridge
  container.register("serviceBus", function(c) {
    const bus = new ServiceBus({
      pythonBridge: c.get("pythonBridge"),
      splitterBridge: c.get("splitterBridge"),
      promptBridge: c.get("promptBridge"),
      story2videoEngine: c.get("story2videoEngine"),
      log: c.get("logger"),
    });
    // 注入 assetGenerator 供 story2video-stages.js 使用
    bus._assetGenerator = c.get("assetGenerator");
    return bus;
  });
  // PluginRegistry 插件注册中心
  container.register("pluginRegistry", function(c) {
    return new PluginRegistry({
      serviceBus: c.get("serviceBus"),
      container: c,
      log: c.get("logger"),
    });
  });

  container.assertRequired([
    "store", "authViewManager", "rpaViewManager", "webviewManager",
    "callbackServer", "qrCodeLogin", "renderEngine",
    "contentIntelligence", "publishImpactTracker", "keywordMonitor",
    "oauthManager", "batchManager", "taskQueue", "publisherRouter"
  ]);

  return container;
}

module.exports = { createContainer, setFeatureFlagProvider };
