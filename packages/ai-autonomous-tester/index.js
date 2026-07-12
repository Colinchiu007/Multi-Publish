/**
 * @multi-publish/ai-autonomous-tester
 * 
 * AI 全自动前端测试框架
 * 
 * 使用方式:
 *   const { 
 *     VisualTestRunner, 
 *     PixelDiffProvider, 
 *     OCRProvider,
 *     TestOrchestrator,
 *     AIAnalyzer,
 *     FixEngine 
 *   } = require('@multi-publish/ai-autonomous-tester');
 */

const { PixelDiffProvider } = require('./src/providers/pixel-diff');
const { OCRProvider } = require('./src/providers/ocr');
const { VisualTestRunner } = require('./src/test-runner');
const { TestOrchestrator } = require('./src/orchestrator');
const { AIAnalyzer } = require('./src/ai-analyzer');
const { FixEngine } = require('./src/fix-engine');
const { findProjectRoot } = require('./src/utils/path-resolver');

module.exports = {
  // Providers
  PixelDiffProvider,
  OCRProvider,
  
  // Runners
  VisualTestRunner,
  
  // AI Loop
  TestOrchestrator,
  AIAnalyzer,
  FixEngine,
  
  // Utils
  findProjectRoot,
};
