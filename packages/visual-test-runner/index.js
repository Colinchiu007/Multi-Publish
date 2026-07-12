/**
 * @visual-test-runner/core - 跨项目视觉测试运行器
 * 用法: const { VisualTestRunner } = require("@visual-test-runner/core");
 */
const { VisualTestRunner } = require("./src/test-runner");
const { PixelDiffProvider } = require("./src/providers/pixel-diff");
const { OCRProvider } = require("./src/providers/ocr");
module.exports = { VisualTestRunner, PixelDiffProvider, OCRProvider };