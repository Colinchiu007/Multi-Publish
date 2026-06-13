/**
 * @multi-publish/shared-utils — 入口
 */
const TaskQueue = require('./task-queue')
const AggregatorBridge = require('./aggregator-bridge')

const formatAdapter = require('./format-adapter/index')

module.exports = {
  TaskQueue,
  AggregatorBridge,
  formatAdapter,
}
