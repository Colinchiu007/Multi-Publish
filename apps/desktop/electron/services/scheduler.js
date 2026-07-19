// @ts-check
/**
 * 桌面端 Scheduler 兼容入口。
 * 业务逻辑位于 @multi-publish/shared-utils，当前文件只注入 Electron 运行环境。
 */
const { app } = require('electron')
const logger = require('./logger')
const { createScheduler } = require('@multi-publish/shared-utils')

module.exports = createScheduler({ app, logger })
