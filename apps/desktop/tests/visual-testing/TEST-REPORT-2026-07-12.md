# 视觉测试框架验证报告 (2026-07-12)

按质量节拍流程,用合成的 PNG 数据对视觉测试框架做端到端验证。

## 测试目标

验证 `agent-visual-judge.js` 在**像素对比失败后**能否:
1. 正确扫描 screenshots/ 和 reports/pixel-diff/ 目录
2. 正确匹配测试名(testName 匹配)
3. 生成结构化的 Markdown 报告供 Agent view_image 判断
4. 生成 JSON 报告供其他工具消费

## 测试方法

合成两张真实合法 PNG(800x600):

- `base-screenshots/login-page.png`:浅灰背景纯色图
- `screenshots/login-page-current.png`:同样的浅灰背景,但在 200-400 x 300-400 y 区域画了红色色块(模拟 UI 改了按钮颜色)
- `reports/pixel-diff/login-page-1234567890.png`:纯红色 diff 蒙版

通过真实存在但不相关的旧 baseline(8 张占位 PNG)+ 旧 diff(9 张历史 diff 图)测试**匹配逻辑是否准确**。

## 验证结果

### ✅ 报告生成成功

```
开始 Agent 视觉判断报告生成
[INFO] 找到 10 张像素差异图
[INFO] 找到 19 张当前截图
[FOUND] 9 个测试像素对比失败，已生成报告供 Agent 审查
[DONE] 报告已生成
```

### ✅ Markdown 报告内容正确

- 标题、生成时间、统计数字 ✓
- 9 个测试用例的清单,每个含:测试名、路由、像素对比结果、当前截图路径、差异图路径、阈值 ✓
- Agent 判断清单 3 个 checkbox(通过 / 失败 / 需更新基线) ✓
- 汇总表 ✓
- file:// URL 格式正确(可在 Codex 中点击打开) ✓

### ✅ Agent 视觉判断可执行

通过 view_image 工具加载:
- `base-screenshots/login-page.png` → 浅灰纯色
- `screenshots/login-page-current.png` → 浅灰 + 红色按钮色块

可以明确判断:"按钮颜色变了"是预期变化,可更新基线。

## 发现的问题

### 🔴 严重(本次已修)

#### 1. `agent-visual-judge.js` 路径解析错误

**位置**: 第 21 行

**原代码**:
```js
const ROOT = path.resolve(__dirname, '..', '..', '..');
```

**问题**:
- `__dirname` = `apps/desktop/tests/visual-testing/scripts/`
- 向上 3 层 = `apps/desktop/`(不是仓库根)
- 实际 ROOT = `apps/desktop/`
- 实际 SCREENSHOT_DIR = `apps/desktop/apps/desktop/tests/visual-testing/screenshots`(重复两层)
- `mkdirSync` 静默把这个错误路径创建出来
- `existsSync` 因为错路径被创建返回 true
- **结果**:脚本"成功"退出,但读不到任何截图,生成空报告

**修复**:改为根据 `.git` / `AGENTS.md` 向上查找项目根:
```js
function findProjectRoot(startDir) {
  let dir = startDir;
  let lastPkg = null;
  for (let i = 0; i < 10; i++) {
    const hasGit = fs.existsSync(path.join(dir, '.git'));
    const hasAgents = fs.existsSync(path.join(dir, 'AGENTS.md'));
    if (hasGit || hasAgents) return dir;
    if (fs.existsSync(path.join(dir, 'package.json'))) lastPkg = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return lastPkg ? path.dirname(lastPkg) : path.resolve(startDir, '..', '..', '..', '..', '..');
}
```

**验证**: 修复后 ROOT = `Multi-Publish/`,SCREENSHOT_DIR 正确,找到 19 张截图。

#### 2. Markdown 报告泄漏 ANSI 颜色码

**位置**: `generateMarkdownReport()` 函数

**原代码**:
```js
md += `- **像素对比**: ${hasPixelDiff ? `${C.red}失败${C.reset}` : `${C.green}通过${C.reset`}\n`;
```

**问题**: ANSI 颜色码(例如 `\x1b[31m` 和 `\x1b[0m`)写入了 .md 文件,导致 Markdown 渲染异常(显示原始转义序列)。

**修复**: 移除 MD 中的 ANSI 颜色码,改用 Markdown 加粗语法:
```js
md += `- **像素对比**: ${hasPixelDiff ? '**失败**' : '**通过**'}\n`;
```

### 🟡 中等(本次未修)

#### 3. `route` 字段硬编码为 `/`

`agent-visual-judge.js` 第 209 行注释:`route: '/' // 简化处理:路由需从像素测试结果反查,这里固定为 /`

**问题**: 每个测试的 route 都是 `/`,报告里 9 个测试都说"路由 /",Agent 无法判断这是哪个页面的失败。

**建议修复**: 让 `pixelRegressionTest` 把 route 信息写入 `screenshots/<name>-meta.json`,judge 脚本读 meta 提取 route。

#### 4. `misMatchPercentage` 硬编码 50%

**位置**: `agent-visual-judge.js` 第 200 行

**问题**: 差异率永远显示 50%,不反映真实像素差异程度。

**建议修复**: 让 pixel 测试结果写入 `<name>-meta.json`,包含真实的 `misMatchPercentage`。

### 🟢 提示

#### 5. 历史 diff 图残留

`reports/pixel-diff/` 目录下有 9 张历史 diff 图(从 1783833546833 时间戳看是 7 月 9 日跑的)。如果想从干净状态开始测试,需要先清空这个目录(注意保留 `.gitignore`)。

## 框架改进建议(优先级排序)

### P0: 让框架真正能跑端到端

当前 `npm run test:visual:pixel` 在没有真实 dev server 的环境下完全跑不起来(playwright 没装、`/login` 路由不存在、baseline 是假 PNG)。建议:

1. **修复 baseline**:`base-screenshots/` 下 8 张 PNG 是同一张占位图(MD5 全是 `0E485FDC...`),需要重新生成
2. **安装 playwright**:`cd apps/desktop && npm install playwright`(目前 node_modules 没有)
3. **加测试路由**:在 `src/router/index.js` 加 `/login` 路由(目前不存在)
4. **写一个 mock 服务**:`vite dev` 起不来时可以 mock 静态 HTML,让视觉测试能跑通

### P1: 让 agent-visual-judge 更可靠

- 修复 `route` 字段硬编码
- 修复 `misMatchPercentage` 硬编码
- 加 `--verbose` / `--debug` 标志,便于排查

### P2: 自动化清理

- 跑完测试后自动清理 `screenshots/*-current.png` 中的孤立文件
- diff 图加保留策略(只保留最近 N 次的)

## 结论

**框架核心机制已可用**:
- ✅ `agent-visual-judge.js` 修复后能正确扫描 + 生成报告
- ✅ Markdown 报告结构清晰,Agent 可直接用 view_image 判断
- ✅ 无需任何外部 AI 依赖

**但框架**目前无法跑端到端测试**:
- ❌ baseline 是假 PNG
- ❌ playwright 未安装
- ❌ 真实测试路由不存在

建议**先做 P0**,把框架真正跑通一次,再做后续功能扩展。