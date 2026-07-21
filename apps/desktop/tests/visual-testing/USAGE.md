# 视觉测试框架使用说明

> 本文档面向**其他 AI 工具**使用本视觉测试框架时的标准化说明。
> 框架位置：`apps/desktop/tests/visual-testing/`

---

## 一句话介绍

本项目使用**像素对比 + OCR + Agent 视觉判断**三层视觉回归测试框架。
跑测试**无需启动 dev server**,直接基于 baseline 截图对比;**无需任何外部 AI API Key**。

---

## 框架结构

```
apps/desktop/tests/visual-testing/
├── views/              # 单视图快照测试 (43 个用例：23 核心 + 20 补充)
├── workflows/          # 多步工作流测试 (50 个用例：32 核心 + 18 补充)
├── providers/          # 检测器（全部本地运行）
│   ├── pixel-diff.js   # Resemble.js 像素对比（默认）
│   └── ocr.js          # Tesseract.js OCR 文字提取
├── base-screenshots/   # 基准图（8 张核心视图，人工审核）
├── screenshots/        # 当前测试截图（运行时生成）
├── reports/            # 测试报告（diff 图 + judge-report.md + JSON）
├── scripts/            # 启动/执行脚本
└── test-runner.js      # 主入口
```

---

## 三种检测能力

| 能力 | 依赖 | 是否需 API Key | 适用场景 |
|------|------|---------------|---------|
| **像素对比** | Resemble.js（本地） | ❌ | 日常开发、PR 合入（默认） |
| **OCR 提取** | Tesseract.js（本地） | ❌ | 文字内容校验 |
| **Agent 视觉判断** | Agent 自己（read + view_image） | ❌ | 像素失败后做最终判断 |

**全部本地运行**,无任何外部 AI 依赖。

---

## 常用命令

> ⚠️ 所有命令必须在 `apps/desktop/` 目录下执行（`cd apps/desktop`）。

### 1. 单视图快速自测（改完 UI 后）

```bash
node tests/visual-testing/views/all-views.visual.test.js --single <view-name>
```

示例:
```bash
node tests/visual-testing/views/all-views.visual.test.js --single home-default
```

### 2. PR 合入前必跑：像素对比所有核心视图

```bash
npm run test:visual:pixel
```

> **门禁**：`test:visual:pixel` 返回非零退出码 → **禁止合入 PR**

### 3. 像素失败后生成 Agent 判断报告

```bash
npm run test:visual:agent
# 输出:
#   reports/judge-report.md          ← Agent 读这个
#   reports/agent-judge-results.json ← 给其他工具消费
```

Agent 在会话中读 `judge-report.md` + 用 `view_image` 加载截图,自己判断每项是否预期变化。

### 4. 发版前必跑：全量回归（93 用例 = 43 视图 + 50 工作流）

```bash
npm run test:all:visual
```

### 5. CI 流水线（GitHub Actions）

```bash
npm run test:visual:ci
```

CI 自动完成:装 Playwright → 启 Vite → 跑像素对比 → 生成 Agent 报告 → 上传 artifact。

---

## 关键规则（MUST）

1. **pre-commit 不集成视觉测试**（触发频率过高,且需要 dev server）
2. **修改 UI 后必须跑 `--single`** 自测通过
3. **PR 合入前必须通过 `test:visual:pixel`**,非零退出码禁止合入
4. **发版前必须通过 `test:all:visual`**
5. **baseline 截图**统一存在 `base-screenshots/`,更新需人工审核 diff 图

---

## 标准操作流程

### 步骤 1:确认场景

| 场景 | 用哪个命令 |
|------|----------|
| 我只是改了一个 UI,想快速验证 | `--single <view-name>` |
| 我要合入 PR | `npm run test:visual:pixel` |
| 像素测试失败,需要 Agent 判断 | `npm run test:visual:agent` |
| 我要发版 | `npm run test:all:visual` |
| 我在 CI 流水线 | `npm run test:visual:ci` |

### 步骤 2:执行命令

所有命令必须 `cd apps/desktop` 后执行。

### 步骤 3:解读报告

- **通过**(退出码 0):可直接进入下一步
- **失败**(退出码 ≠ 0):查看 `reports/pixel-diff/*.png` 看 diff 图
  - 是预期变化 → 更新 baseline(见步骤 4)
  - 不是预期变化 → 修复 UI 后重跑
- **Agent 视觉判断**:读 `reports/judge-report.md`,用 `view_image` 看截图,勾选清单

### 步骤 4:更新 baseline(仅在确认是预期变化时)

```bash
# 把当前截图提升为新基准
cp tests/visual-testing/screenshots/<view-name>-current.png \
   tests/visual-testing/base-screenshots/<view-name>.png
```

---

## 依赖(package.json 已包含)

- `playwright` — 浏览器自动化
- `resemblejs` — 像素对比
- `tesseract.js` — OCR 识别

**无任何外部 AI 依赖**(openai / @anthropic-ai/sdk 已从项目中移除)。

---

## 给执行型 AI 的精简指令

> 本项目视觉测试框架位于 `apps/desktop/tests/visual-testing/`。
>
> **使用规则**:
> 1. 改完 UI 后:`cd apps/desktop && node tests/visual-testing/views/all-views.visual.test.js --single <view-name>`
> 2. PR 合入前:`cd apps/desktop && npm run test:visual:pixel`(必须通过)
> 3. 像素失败后:`cd apps/desktop && npm run test:visual:agent` 生成报告,然后读 `reports/judge-report.md` + 用 `view_image` 看图判断
> 4. 发版前:`cd apps/desktop && npm run test:all:visual`(必须通过)
> 5. CI 环境:`cd apps/desktop && npm run test:visual:ci`
>
> 所有命令必须 `cd` 到 `apps/desktop/` 下执行。
> 无需启动 dev server,框架直接基于 `base-screenshots/` 下的基准图做对比。
> 失败时查看 `reports/pixel-diff/*.png` 判断是否为预期变化。

---

## 给 IDE AI(Cursor / Copilot)的配置建议

把「常用命令」+「关键规则」+「精简指令」放入 `.cursorrules` 或 `AGENTS.md` 的「视觉测试」小节。

## 给 CLI AI(Claude Code / Cline)的配置建议

把「精简指令」作为 system prompt 注入,让对方 AI 在执行视觉测试前先读这段说明。
