/** 
 * AiWriter — AI 辅助写作模块
 *
 * 此为 @multi-publish/ai-writer 包的桥接层，
 * 从独立包导出以维持向后兼容。
 *
 * 独立包路径: packages/ai-writer/
 * CLI: ai-writer <command> [options]
 */

var path = require('path')
var AiWriter = require('../../../packages/ai-writer/src/index')
var log = require('./logger')

// 包装器 — 添加 Electron 日志
var WrappedAiWriter = function(opts) {
  AiWriter.call(this, opts)
}
WrappedAiWriter.prototype = Object.create(AiWriter.prototype)
WrappedAiWriter.prototype.constructor = WrappedAiWriter

var origGenerateTitles = AiWriter.prototype.generateTitles
var origGenerateSummary = AiWriter.prototype.generateSummary
var origEnhanceContent = AiWriter.prototype.enhanceContent

WrappedAiWriter.prototype.generateTitles = async function(topic, count) {
  log.info('AiWriter', 'Generating titles for: ' + (topic || '').slice(0, 50))
  return origGenerateTitles.call(this, topic, count)
}

WrappedAiWriter.prototype.generateSummary = async function(content) {
  log.info('AiWriter', 'Generating summary for ' + (content || '').length + ' chars')
  return origGenerateSummary.call(this, content)
}

WrappedAiWriter.prototype.enhanceContent = async function(content, style) {
  log.info('AiWriter', 'Enhancing content (' + (content || '').length + ' chars, style=' + style + ')')
  return origEnhanceContent.call(this, content, style)
}

module.exports = WrappedAiWriter
