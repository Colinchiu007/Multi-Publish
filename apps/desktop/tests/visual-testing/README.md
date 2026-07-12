# 视觉测试框架

基于 Playwright 的自动化 UI 测试系统，支持像素对比、OCR 和 AI 视觉三种模式。

## 测试模式

| 模式 | 依赖 | 适用场景 |
|------|------|----------|
| **像素对比** | Resemble.js | 本地开发 ✅ 默认 |
| **OCR 文字提取** | Tesseract.js | 本地开发 ✅ 默认 |
| **AI 视觉** | OpenAI / Claude | 仅 CI 流水线（可选） |
| **Agent 视觉** | Agent 自己（无需 Key） | Agent 迭代时自动判断截图 |

> 💡 **本地开发和 Agent 内运行无需任何 API Key**——像素对比 + OCR 默认足够。
> 🔑 **AI 视觉只在 CI 无人值守场景才需要**——可选，repository secrets 注入才启用，本地 / Agent / CI 默认都不需要。
> 📖 详细说明见文末「[三种调用方式](#三种调用方式-本地--agent--ci)」章节。

## 目录结构

```
visual-testing/
├── providers/              # 测试提供者
│   ├── ai-vision.js        # AI 视觉（仅 CI 可选）
│   ├── ocr.js              # Tesseract OCR
│   └── pixel-diff.js       # Resemble.js 像素对比
├── views/                  # 视图测试
│   └── all-views.visual.test.js  # 45个核心视图
├── workflows/              # 工作流测试
│   └── all-workflows.visual.test.js  # 32个工作流
├── scripts/                # 运行脚本
│   ├── setup.js            # 环境设置
│   ├── visual-ci.js       # CI 集成
│   ├── run-pixel-tests.js  # 像素对比测试
│   └── run-ai-tests.js     # AI 视觉测试（CI 专用）
├── reports/                # 测试报告输出
├── screenshots/            # 截图输出
└── base-screenshots/       # 基线截图
```

## 快速开始

### 1. 环境设置（无需任何 Key）

```bash
cd apps/desktop
node tests/visual-testing/scripts/setup.js
```

setup.js 会：
- 检查依赖（Playwright、Tesseract.js、Resemble.js 都是必装；openai / @anthropic-ai/sdk 是可选）
- 创建必要的目录
- 确认 `tests/visual-testing/.env.example` 已就位（**不再自动创建 .env**——按需手动 cp）

### 2. 启动开发服务器

```bash
npm run dev
```

### 3. 运行测试

| 命令 | 说明 |
|------|------|
| `npm run test:visual` | 视图视觉测试（Vitest，45个视图） |
| `npm run test:workflow` | 工作流视觉测试（Vitest，32个工作流） |
| `npm run test:all:visual` | 全部视觉测试 |
| `npm run test:visual:pixel` | 像素对比测试（无需 API Key）✅ |
| `npm run test:visual:ai` | AI 视觉测试（仅 CI 需要，未配置 Key 时跳过） |
| `npm run test:visual:ci` | CI 模式（生成 ci-report.json） |
| `npm run test:visual:agent` | Agent 视觉判断报告（无需 Key）✅ |
| `npm run test:visual:quick` | 快速测试（首页视图） |

### 4. 单个测试

```bash
# 列出所有视图测试
node tests/visual-testing/views/all-views.visual.test.js --list

# 测试单个视图
node tests/visual-testing/views/all-views.visual.test.js --single home-default

# 列出所有工作流测试
node tests/visual-testing/workflows/all-workflows.visual.test.js --list

# 测试单个工作流
node tests/visual-testing/workflows/all-workflows.visual.test.js --single account-add-flow
```

## AI 视觉模式（仅 CI 需要）

如需在 CI 流水线中启用 AI 视觉（自动判断截图正确性），在 `.env` 中取消注释对应行：

```bash
# tests/visual-testing/.env
OPENAI_API_KEY=sk-your-openai-key
# 或
ANTHROPIC_API_KEY=sk-ant-your-key
```

**本地开发不需要这个模式**——直接看截图 + 像素差异图即可。

> ⚠️ `.env` 文件已在 `.gitignore` 中，不会被提交到仓库。

## 测试覆盖

### 视图测试 (45个)

| 分类 | 数量 | 测试内容 |
|------|------|----------|
| 首页 | 5 | 默认状态、空状态、文章列表、加载、错误 |
| 账号管理 | 5 | 列表、添加、编辑、微博登录、抖音登录 |
| 发布管理 | 5 | 表单、定时、草稿、历史、预览 |
| 批量操作 | 4 | 列表、编辑、排期、复制 |
| 创作中心 | 4 | 编辑器、模板、媒体库、AI辅助 |
| 监控面板 | 4 | 仪表盘、双屏、三屏、全屏 |
| 数据统计 | 4 | 概览、平台对比、文章数据、导出 |
| 设置页面 | 4 | 通用、通知、快捷键、关于 |
| 登录页面 | 3 | 默认、二维码、错误状态 |
| 智能助手 | 3 | 关键词、趋势、推荐 |
| 评论管理 | 2 | 列表、回复 |
| 收藏管理 | 2 | 列表、详情 |

### 工作流测试 (32个)

| 分类 | 数量 | 测试内容 |
|------|------|----------|
| 账号操作 | 8 | 添加、删除、编辑、筛选、刷新、二维码、导入、导出 |
| 发布操作 | 8 | 快速发布、定时、草稿保存、预览、媒体上传、模板、历史、重试 |
| 批量操作 | 6 | 全选、平台编辑、排期创建、复制、删除、状态筛选 |
| 创作操作 | 6 | 文字格式化、媒体上传、模板选择、AI生成、版本保存、媒体发布 |
| 监控操作 | 5 | 布局切换、全屏、刷新、缩放、音频开关 |

## API 使用

### 像素对比

```javascript
const { PixelDiffProvider } = require('./providers/pixel-diff');

const diff = new PixelDiffProvider();

// 对比图片
const result = await diff.compare('baseline.png', 'current.png', 'test-name');

console.log(`差异: ${result.misMatchPercentage}%`);
if (!result.passed) {
  console.log(`差异图: ${result.diffImagePath}`);
}
```

### OCR 文字识别

```javascript
const { OCRProvider } = require('./providers/ocr');

const ocr = new OCRProvider();

// 提取文字
const text = await ocr.extractText('screenshot.png');

// 检查文字
const hasText = await ocr.contains('screenshot.png', '错误提示');
```

### AI 视觉识别（仅 CI）

```javascript
const { VisionProvider } = require('./providers/ai-vision');

const ai = new VisionProvider({ provider: 'openai' }); // 或 'claude'

// 分析图片
const result = await ai.analyzeImage('screenshot.png', '检查是否有登录按钮');

// 检查元素是否存在
const exists = await ai.elementExists('screenshot.png', '提交按钮');
```

### 测试运行器

```javascript
const { VisualTestRunner } = require('./test-runner');

const runner = new VisualTestRunner();
await runner.launch();

// 像素对比测试（默认，无需配置）
await runner.pixelRegressionTest('home-page', '/', { waitMs: 1000 });

// AI视觉测试（仅 CI 需要）
await runner.aiVisionTest('login-page', '/login', [
  { name: '表单', prompt: '是否存在登录表单？' },
  { name: '按钮', prompt: '是否存在登录按钮？' }
]);

await runner.close(); // 生成报告
```

## 三种调用方式（本地 / Agent / CI）

### 本地开发

```bash
cd apps/desktop
node tests/visual-testing/scripts/setup.js   # 检查依赖 + 目录，首次运行

npm run dev                                  # 启动 dev server（http://localhost:5174）

# 跑像素对比（默认，无需任何 Key）
npm run test:visual:pixel

# 跑全量（像素 + OCR）
npm run test:all:visual
```

### Agent / 自动化脚本

```bash
# 同本地命令；本仓库的 run-*.js 脚本默认无 Key 时安全退出
# npm run test:visual:ai 没 Key 不会报错，agent 可以放心迭代
```

### CI 流水线（GitHub Actions）

工作流文件：.github/workflows/visual-test.yml

- **触发**：pull_request / push main / workflow_dispatch
- **默认行为**：仅跑像素对比，**无需任何 API Key**
- **AI 视觉升级**：在仓库 Settings → Secrets 配置 OPENAI_API_KEY 或 ANTHROPIC_API_KEY，CI 自动启用 AI 判断
- **失败语义**：
  - 像素对比 fail → 强制 PR 红
  - AI 视觉 fail → continue-on-error: true 不阻塞（避免 API 配额抖动影响 PR 合入）

**重要**：本节是仓库真实状态。如果你看到其它示例说「必须 OPENAI_API_KEY」，那是过期文档。

## 更新基线截图

当 UI 发生预期变更时，更新基线截图：

```bash
npm run test:visual:update-baseline
```

## 报告输出

测试报告位于 `tests/visual-testing/reports/` 目录：

- `report-{timestamp}.json` - JSON 格式详细报告
- `pixel-diff/` - 差异截图
- `ci-report.json` - CI 模式汇总报告

## 依赖

- `playwright` - 浏览器自动化
- `resemblejs` - 像素对比
- `tesseract.js` - OCR 识别
- `openai` - OpenAI API（可选，AI 视觉模式）
- `@anthropic-ai/sdk` - Anthropic API（可选，AI 视觉模式）

## License

MIT
