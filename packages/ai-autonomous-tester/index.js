/**
 * @multi-publish/ai-autonomous-tester
 *
 * AI 全自动前端测试框架
 *
 * 使用方式:
 *   const {
 *     // Providers
 *     PixelDiffProvider, OCRProvider,
 *     // Runners
 *     VisualTestRunner, FunctionalTestRunner, RequirementsTestRunner, AutonomousTestRunner,
 *     // AI Loop
 *     TestOrchestrator, AIAnalyzer, FixEngine, AgentJudge,
 *     // Requirements
 *     PRDParser,
  MultiDocParser, FeatureDetector, RequirementsVerifier,
 *     // Utils
 *     findProjectRoot,
 *   } = require("@multi-publish/ai-autonomous-tester");
 */

const { PixelDiffProvider } = require("./src/providers/pixel-diff");
const { OCRProvider } = require("./src/providers/ocr");
const { VisualTestRunner } = require("./src/runners/visual-runner");
const { FunctionalTestRunner } = require("./src/runners/functional-runner");
const { RequirementsTestRunner } = require("./src/runners/requirements-runner");
const { AutonomousTestRunner } = require("./src/runners/autonomous-runner");
const { TestOrchestrator } = require("./src/orchestrator");
const { AIAnalyzer } = require("./src/ai-analyzer");
const { FixEngine } = require("./src/fix-engine");
const { PRDParser } = require("./src/parsers/prd-parser");
const { FeatureDetector } = require("./src/detectors/feature-detector");
const { RequirementsVerifier } = require("./src/verifier/requirements-verifier");
const { AgentJudge } = require("./src/agent/agent-judge");
const { MultiDocParser } = require("./src/parsers/multi-doc-parser");
const { findProjectRoot } = require("./src/utils/path-resolver");

module.exports = {
  // Providers
  PixelDiffProvider,
  OCRProvider,

  // Runners
  VisualTestRunner,
  FunctionalTestRunner,
  RequirementsTestRunner,
  AutonomousTestRunner,

  // AI Loop
  TestOrchestrator,
  AIAnalyzer,
  FixEngine,
  AgentJudge,

  // Requirements Verification
  PRDParser,
  MultiDocParser,
  FeatureDetector,
  RequirementsVerifier,

  // Utils
  findProjectRoot,
};