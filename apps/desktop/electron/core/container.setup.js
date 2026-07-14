// @ts-check
/**
 * Container setup — 集中注册所有 Electron 主进程服务
 * 可作为逐步替换 main.js 直接 new 的中间步骤
 */
'use strict';

// Container DI 容器（JS 版本，与 container.test.ts 测试一致）
const Container = require("./container");

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
// -- 基础设施 & 横切服务 --
const logger = require('../services/logger');
const pythonBridge = require('../services/python-bridge');
const SplitterBridge = require('../services/splitter-bridge');
const PromptBridge = require('../services/prompt-bridge');
const ServiceBus = require('../services/service-bus');
const PluginRegistry = require('../services/plugin-registry');
const { registerStory2VideoStages } = require('../services/story2video-stages');

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
  container.register("videoEngine", function() { return new VideoEngine(); });
  // PipelineEngine 注入 serviceBus + container（用于编排模式）
  // 注意：需要懒加载 serviceBus（避免循环依赖），通过工厂函数延迟到首次 get 时解析
  container.register("pipelineEngine", function(c) {
    const engine = new PipelineEngine({
      serviceBus: c.get("serviceBus"),
      container: c,
      log: c.get("logger"),
    });
    // 注册 story2video-compose 管线的自定义阶段执行器
    if (engine.stageExecutor) {
      try {
        registerStory2VideoStages(engine);
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
    return new Story2VideoComposeEngine({ log: c.get("logger") });
  });
  // ServiceBus 统一聚合所有 Bridge
  container.register("serviceBus", function(c) {
    return new ServiceBus({
      pythonBridge: c.get("pythonBridge"),
      splitterBridge: c.get("splitterBridge"),
      promptBridge: c.get("promptBridge"),
      story2videoEngine: c.get("story2videoEngine"),
      log: c.get("logger"),
    });
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

module.exports = { createContainer };
