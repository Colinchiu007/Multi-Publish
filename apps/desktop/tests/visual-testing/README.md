# 视觉测试系统（Visual Testing）

基于 Playwright 的自动化 UI 测试系统，支持**像素对比 + OCR 文字提取 + Agent 视觉判断**三种方式，**无需任何外部 AI API Key**。

> 💡 **完全本地运行**——像素对比和 OCR 都用本地库实现，Agent 视觉判断由 Agent 自己读截图完成。

## 核心特性

| 特性 | 实现方式 | 适用场景 |
|------|---------|---------|
| **像素对比** | Resemble.js | 日常开发、PR 合入（默认） |
| **OCR 提取** | Tesseract.js | 文字内容校验 |
| **Agent 视觉判断** | Agent 主动 view_image | Agent 迭代时判断截图差异 |

> 📖 完整使用说明：[USAGE.md](./USAGE.md)

## 目录结构

```
tests/visual-testing/
├── views/                # 单视图快照测试 (45 用例)
├── workflows/            # 多步工作流测试 (32 用例)
├── providers/            # 检测器
│   ├── pixel-diff.js     # 像素对比（默认）
│   └── ocr.js            # OCR 文字提取
├── base-screenshots/     # 基准图（人工审核）
├── screenshots/          # 当前测试截图（运行时）
├── reports/              # 报告（diff 图 + judge-report.md + JSON）
├── scripts/              # 运行脚本
│   ├── run-pixel-tests.js       # 像素对比入口
│   ├── agent-visual-judge.js    # Agent 视觉判断报告生成器
│   ├── visual-ci.js             # CI 主入口
│   └── setup.js                 # 环境准备
├── views/all-views.visual.test.js
└── workflows/all-workflows.visual.test.js
```

## 依赖

所有依赖已在 `apps/desktop/package.json` 中：

- `playwright` — 浏览器自动化
- `resemblejs` — 像素对比
- `tesseract.js` — OCR 识别

无需任何外部 AI 依赖。

## 常用命令

> 所有命令必须在 `apps/desktop/` 目录下执行（`cd apps/desktop`）。

| 命令 | 说明 |
|------|------|
| `npm run test:visual:pixel` | 像素对比测试（无需 API Key）✅ |
| `npm run test:visual:agent` | 生成 Agent 视觉判断报告（无需 Key）✅ |
| `npm run test:visual:update-baseline` | 更新基线截图 |
| `npm run test:all:visual` | 全量回归（77 用例） |

## 强制规则（MUST）

1. **pre-commit 不集成视觉测试**（触发频率过高，且需要 dev server）
2. **PR 合入前必须通过** `npm run test:visual:pixel`，非零退出码禁止合入
3. **发版前必须通过** `npm run test:all:visual`
4. **baseline 更新需人工审核** diff 图，确认是预期变化后再覆盖
5. **改完 UI 必须跑 `--single` 自测** + 看 `screenshots/*-current.png` 确认

## Agent 工作流

像素对比失败后，Agent 通过 `agent-visual-judge.js` 生成的报告自行判断：

```bash
# 1. 跑像素对比（可能失败）
npm run test:visual:pixel

# 2. 生成判断报告（无需 Key）
npm run test:visual:agent
# 输出:
#   reports/judge-report.md          ← Agent 读这个
#   reports/agent-judge-results.json ← 给其他工具消费

# 3. Agent 在会话中：
#    - 读 judge-report.md
#    - 用 view_image 工具加载报告里列出的截图
#    - 勾选每项的判断（通过 / 失败 / 需更新基线）
```

### baseline 更新流程

只有确认是预期变化时才更新：

```bash
cp tests/visual-testing/screenshots/<view>-current.png \
   tests/visual-testing/base-screenshots/<view>.png
```

## CI 集成

`.github/workflows/visual-test.yml` 自动跑：

1. 像素对比测试
2. 生成 Agent 视觉判断报告
3. 上传截图 + 报告作为 artifact

CI 流程完全本地运行，**无需任何 GitHub Secrets**。

## 开发者 API

### 像素对比

```javascript
const { PixelDiffProvider } = require('./providers/pixel-diff');
const diff = new PixelDiffProvider();

const result = await diff.compare('baseline.png', 'current.png', 'test-name');
console.log(result.misMatchPercentage); // 差异百分比
console.log(result.passed);             // true / false
```

### OCR 文字提取

```javascript
const { OCRProvider } = require('./providers/ocr');
const ocr = new OCRProvider();

const text = await ocr.extractText('screenshot.png');
const hasText = await ocr.contains('screenshot.png', '错误提示');
```

### Visual Test Runner

```javascript
const { VisualTestRunner } = require('./test-runner');

await runner.launch();
await runner.pixelRegressionTest('home-page', '/', { waitMs: 1000 });
await runner.close();
```

## 常见问题

**Q: 像素对比失败了怎么办？**
A: 看 `reports/pixel-diff/*.png` 差异图，自己判断：
- 是预期变化 → 更新 baseline
- 不是预期变化 → 修复 UI 后重跑

**Q: CI 失败但本地通过？**
A: 通常是字体/截图分辨率差异。检查 CI 的 `xvfb` + `libvips` 是否装好。

**Q: baseline 图太大，git 提交卡？**
A: baseline 图通常 < 200KB / 张，可放心提交。如需优化可用 `npx playwright install-deps`。