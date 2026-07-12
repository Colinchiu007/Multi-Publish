# @visual-test-runner/core

跨项目视觉测试运行器。像素对比+OCR+Agent视觉判断，无需任何外部API Key。

## 安装

```bash
npm install @visual-test-runner/core
```

或复制本包到目标项目中，直接使用。

## 快速开始

### 1. 配置测试路由

复制 scripts/run-pixel-tests.template.js 为 scripts/run-pixel-tests.js，修改 pixelTests 数组。

### 2. 设置环境变量

```bash
export TEST_URL=http://localhost:3000
```

### 3. 运行测试

```bash
node scripts/run-pixel-tests.js
npm run test:pixel
```

## Agent 视觉判断

```bash
npm run test:agent
node scripts/agent-visual-judge.js
```

Agent读取reports/judge-report.md，用view_image工具看截图，自己判断是否真的有问题。

## API

```javascript
const { VisualTestRunner } = require("@visual-test-runner/core");
const runner = new VisualTestRunner({ url: "http://localhost:3000" });
await runner.launch();
await runner.pixelRegressionTest("home", "/", { waitMs: 1000 });
await runner.close();
```

## 单独使用Provider

```javascript
const { PixelDiffProvider, OCRProvider } = require("@visual-test-runner/core");
const diff = new PixelDiffProvider();
const result = await diff.compare("baseline.png", "current.png", "test");
const ocr = new OCRProvider();
const text = await ocr.extractText("screenshot.png");
```

## License

MIT
