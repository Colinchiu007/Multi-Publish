/**
 * @multi-publish/shared-utils — 入口
 */
const TaskQueue = require('./task-queue')
const AggregatorBridge = require('./aggregator-bridge')

const formatAdapter = require('./format-adapter/index')
const coverProcessor = require('./cover-processor/index')

const PlatformConfig = require('./platform-config')
const SensitiveFilter = require('./sensitive-filter')

module.exports = {
  TaskQueue,
  AggregatorBridge,
  formatAdapter,
  coverProcessor,
  PlatformConfig,
  SensitiveFilter,
}
