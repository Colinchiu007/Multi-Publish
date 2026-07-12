# @visual-test-runner/core

跨项目测试运行器。像素对比 + OCR + 可访问性(Axe) + API 功能测试，**无需任何外部 API Key**。

## 安装

`ash
npm install @visual-test-runner/core
`

## 四种测试模式

| 模式 | 工具 | 适用场景 | 需 Key |
|------|------|----------|--------|
| 像素对比 | Resemble.js | UI 回归 | 否 |
| OCR 文字 | Tesseract.js | 文字内容验证 | 否 |
| 可访问性 | axe-core | WCAG 合规 | 否 |
| API 功能 | Node.js http | 接口正确性 | 否 |
| Agent 视觉 | Agent 自己 | AI 判断截图 | 否 |

## 快速开始

### 1. 配置测试路由

复制 scripts/run-pixel-tests.template.js 为 scripts/run-pixel-tests.js，修改 pixelTests 数组：

`javascript
const pixelTests = [
  { name: 'home', route: '/' },
  { name: 'login', route: '/login' },
  { name: 'dashboard', route: '/dashboard' },
];
`

### 2. 设置环境变量

`ash
export TEST_URL=http://localhost:3000
`

### 3. 运行测试

`ash
# 像素对比
node scripts/run-pixel-tests.js

# 可访问性测试
npm install --save-dev axe-core
node scripts/run-a11y-tests.js

# API 功能测试
node scripts/run-api-tests.js

# Agent 视觉判断（无需 Key）
node scripts/agent-visual-judge.js
`

## API 用法

`javascript
const { VisualTestRunner } = require('@visual-test-runner/core');

const runner = new VisualTestRunner({ url: 'http://localhost:3000' });
await runner.launch();

// 像素对比测试
await runner.pixelRegressionTest('home', '/', { waitMs: 1000 });

// 可访问性测试
await runner.a11yTest('login', '/login');

await runner.close();
`

## 单独使用 Provider

`javascript
const { PixelDiffProvider, OCRProvider, A11yProvider } = require('@visual-test-runner/core');

// 像素对比
const diff = new PixelDiffProvider();
const result = await diff.compare('baseline.png', 'current.png', 'home');

// OCR
const ocr = new OCRProvider();
const text = await ocr.extractText('screenshot.png');

// 可访问性
const a11y = new A11yProvider();
await a11y.inject(page); // inject axe-core
const r = await a11y.run(page);
console.log(r.summary);
`

## 目录结构

`
visual-test-runner/
├── index.js
├── src/
│   ├── test-runner.js           # 核心类
│   └── providers/
│       ├── pixel-diff.js        # 像素对比
│       ├── ocr.js              # OCR
│       └── a11y.js             # 可访问性(axe-core)
├── scripts/
│   ├── run-pixel-tests.template.js
│   ├── run-a11y-tests.js
│   ├── run-api-tests.js
│   └── agent-visual-judge.js
└── README.md
`

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| TEST_URL | http://localhost:5173 | 测试目标 URL |
| TEST_HEADLESS | 	rue | 无头模式 |
| TEST_SCREENSHOT_DIR | screenshots | 截图目录 |
| TEST_BASELINE_DIR | ase-screenshots | 基线目录 |
| TEST_REPORT_DIR | eports | 报告目录 |
| API_BASE_URL | http://localhost:3000 | API 测试目标 |

## License

MIT
