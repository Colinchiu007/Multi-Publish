/**
 * @multi-publish/shared-utils — 入口
 */
const TaskQueue = require('./task-queue')
const AggregatorBridge = require('./aggregator-bridge')

const formatAdapter = require('./format-adapter/index')
const coverProcessor = require('./cover-processor/index')
const coverGenerator = require('./cover-processor/cover-generator')

const PlatformConfig = require('./platform-config')
const SensitiveFilter = require('./sensitive-filter')
const mdConverter = require('./md-converter')

const ChunkedUploader = require('./chunked-uploader')
const ProxyPool = require('./proxy-pool')
const AnalyticsService = require('./analytics-service')

const DataSyncService = require('./data-sync')
const ContentQualityGate = require('./content-quality-gate')
const PublishIntervalGuard = require('./publish-interval-guard')

module.exports = {
  TaskQueue,
  AggregatorBridge,
  formatAdapter,
  coverProcessor,
  coverGenerator,
  PlatformConfig,
  SensitiveFilter,
  mdConverter,
  ChunkedUploader,
  ProxyPool,
  AnalyticsService,
  DataSyncService,
  ContentQualityGate,
  PublishIntervalGuard,
}
