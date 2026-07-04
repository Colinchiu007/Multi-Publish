/**
 * Container setup — 集中注册所有 Electron 主进程服务
 * TS 迁移版
 */
import Container from './container';
import RenderEngine from '../services/render-engine';
import AuthViewManager from '../services/auth-view-manager';
import RpaViewManager from '../services/rpa-view-manager';
import WebviewManager from '../services/webview-manager';
import CallbackServer from '../services/callback-server';
import QrCodeLogin from '../services/qrcode-login';
import Store from '../services/store';
import ContentIntelligence from '../services/content-intelligence';
import PublishImpactTracker from '../services/publish-impact-tracker';
import KeywordMonitor from '../services/keyword-monitor';
import OAuthManager from '../services/oauth-manager';
import BatchManager from '../services/batch-manager';
import UrlCollector from '../services/url-collector';
import ViralEngine from '../services/viral-engine';
import ProviderManager from '../services/provider-manager';
import { TaskQueue, AggregatorBridge, ChunkedUploader, ProxyPool, AnalyticsService } from '@multi-publish/shared-utils';
import PublishIntervalGuard from '@multi-publish/shared-utils/src/publish-interval-guard';
import TemplateManager from '../services/template-manager';
import AiWriter from '../services/ai-writer';
import PublisherRouter from '../services/publisher-router';
import UsageTracker from '../services/usage-tracker';
import DataSyncService from '@multi-publish/shared-utils/src/data-sync';

export interface CreateContainerOptions {
  taskQueue?: { maxConcurrent?: number };
}

export function createContainer(options?: CreateContainerOptions): Container {
  var container = new Container();
  var opts = options || {};

  // no-dependency services
  container.register('authViewManager', function() { return new AuthViewManager(); });
  container.register('rpaViewManager', function() { return new RpaViewManager(); });
  container.register('webviewManager', function() { return new WebviewManager(); });
  container.register('callbackServer', function() { return new CallbackServer(); });
  container.register('qrCodeLogin', function() { return new QrCodeLogin(); });
  container.register('renderEngine', function() { return new RenderEngine(); });
  container.register('urlCollector', function() { return new UrlCollector(); });
  container.register('viralEngine', function() { return new ViralEngine(); });
  container.register('providerManager', function() { return new ProviderManager(); });
  container.register('proxyPool', function() { return new ProxyPool(); });
  container.register('analyticsService', function() { return new AnalyticsService(); });
  container.register('templateManager', function() { return new TemplateManager(); });
  container.register('aiWriter', function() { return new AiWriter(); });
  container.register('usageTracker', function() { return new UsageTracker(); });
  container.register('chunkedUploader', function() { return new ChunkedUploader(); });

  // services with dependencies
  container.register('store', function() { return new Store(); });
  container.register('contentIntelligence', function(c) { return new ContentIntelligence(c.get('store')); });
  container.register('publishImpactTracker', function(c) { return new PublishImpactTracker(c.get('contentIntelligence')); });
  container.register('keywordMonitor', function(c) { return new KeywordMonitor(c.get('contentIntelligence'), c.get('store')); });
  container.register('oauthManager', function(c) { return new OAuthManager(c.get('store')); });
  container.register('batchManager', function(c) { return new BatchManager(c.get('store')); });
  container.register('dataSync', function(c) { return new DataSyncService(c.get('store')); });
  container.register('taskQueue', function() { return new TaskQueue(opts.taskQueue || { maxConcurrent: 3 }); });
  container.register('aggregatorBridge', function(c) { return new AggregatorBridge(c.get('taskQueue')); });
  container.register('publisherRouter', function() { return new PublisherRouter(); });
  container.register('publishIntervalGuard', function(c) { return new PublishIntervalGuard({ store: c.get('store') }); });

  container.assertRequired([
    'store', 'authViewManager', 'rpaViewManager', 'webviewManager',
    'callbackServer', 'qrCodeLogin', 'renderEngine',
    'contentIntelligence', 'publishImpactTracker', 'keywordMonitor',
    'oauthManager', 'batchManager', 'taskQueue', 'publisherRouter',
  ]);

  return container;
}
