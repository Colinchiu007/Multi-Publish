# 质量节拍

## 一句话定义

> 开发质量不是靠检查清单堆出来的，是靠**固定节奏的日常循环**跑出来的。

---

## 核心思想

传统质量管理的误区是列一个长 checklist，结果永远记不住、永远执行不了。

**质量节拍** 的解法是按"操作节奏"分层：

```
日常循环（每次写代码自动跑）→ 4 步，像呼吸一样自然
阶段检查（每 Phase 结束触发） → 3 步，AI 提示你执行
特殊场景（条件满足时激活）   → 按需触发，不需要你记
```

你只需要记住**日常循环的 4 步**，剩下的事 AI 会在对的时间自动做。

---

## 第一章：起作用的方式

### 1.1 三种触发机制

质量节拍的技能不是靠你手动一个个调的，而是通过三种方式自动/半自动触发：

```
触发方式 A：日常循环（自动串行执行）
  source-driven-dev → TDD → incremental-impl → /review
  条件：任何编码 session 开始后自动激活
  你做的事：告诉 AI "当前焦点"

触发方式 B：AI 主动提示（阶段门禁）
  verification-before-completion / /health / documentation-and-adrs
  条件：子任务完成 / Phase 结束时 AI 自动检测到并提示
  你做的事：说"好，跑一遍"或"跳过"

触发方式 C：你的一句话（按需调用）
  你说"出 bug 了" → AI 自动匹配 /investigate
  你说"安全审计" → AI 自动匹配 /cso + /guard
  你说"并行搞" → AI 自动匹配 dispatching-parallel-agents
  24 个场景全覆盖，AI 从场景映射表里找
  你做的事：用自然语言说出你的意图
```

### 1.2 日常循环的执行机制

日常循环的 4 步不是独立技能，而是**嵌套执行**的关系：

```
你开始一个新子任务
    │
    ▼
① source-driven-dev（自动展开）
    ├── 读取 OpenMontage 对应源码
    ├── 提取所有函数签名和参数（spec-driven-dev 自动伴随）
    └── 输出：接口对齐清单
    │
    ▼
② TDD（自动展开）
    ├── 先写测试（normal + error + edge）
    ├── 检查测试质量：不 mock 行为、不 mock 第三方（testing-anti-patterns 自动伴随）
    ├── 再写实现
    └── 跑通测试
    │
    ▼
③ incremental-impl（持续约束）
    ├── 检查：当前代码是否超出子任务边界？
    ├── 检查：有没有未经拆解就"顺手"改的地方？
    └── 输出：任务边界确认
    │
    ▼
④ /review（自动展开）
    ├── 扫描改动文件的 🔴/🟠/🟢 问题
    ├── 修复 CRITICAL 问题
    └── 输出：审查报告
    │
    ▼
回到 ①，进入下一个子任务
```

**实际场景**：你坐在电脑前，对 AI 说"Phase 1 —— 增强 render-engine.js"，然后看到 AI 依次执行：

```
→ 我先读取 OpenMontage 的 video_compose.py 看看渲染引擎的接口设计...
  （source-driven-dev 自动激活）

→ 提取到关键接口：render(composition, props, profile, outputFormat)
  （spec-driven-dev 自动伴随）

→ 现在写测试：
  test('render accepts composition parameter')
  test('render falls back to Explainer when composition omitted')
  test('render rejects invalid composition name')
  （TDD 自动激活）

→ 测试通过了，实现简化完成，去掉了 OpenMontage 中不需要的 HyperFrames 路由
  （code-simplification 自动伴随）

→ 写完审查：
  🔴 无
  🟠 render.js:23 缺少 composition 参数类型校验
  （/review 自动激活）

→ 进入下一个子任务：重构 CreateView.vue...
  （回到日常循环起点）
```

---

## 第二章：具体流程

### 2.1 完整 Session 流程

一个完整的编码 session 的实际流程（以 Phase 1 为例）：

```
Session 开始
    │
    ├── 你说："使用质量节拍，当前焦点 Phase 1 —— 增强 render-engine.js"
    │
    ▼
Step 1: 上下文加载（AI 自动）
    ├── 读取 01-docs/PRD-video-creation.md → 了解 Phase 1 的验收标准
    ├── 读取 01-docs/migration-plan-opermontage.md → 了解任务描述
    ├── 读取 apps/desktop/electron/render-engine.js → 了解当前实现
    └── 读取 D:\Projects\OpenMontage\tools\video\video_compose.py → 了解 OpenMontage 的渲染引擎
    │     ↑ context-engineering 自动激活
    │
    ▼
Step 2: 日常循环第 1 轮 —— render() 函数扩展
    ├── source-driven-dev：OpenMontage 的 render() 接收 composition 参数
    ├── TDD：先写 test('render accepts composition= CinematicRenderer')
    ├── incremental-impl：只改 render() 签名，不改其他
    └── /review：检查新参数是否向后兼容
    │
    ▼
Step 3: 日常循环第 2 轮 —— IPC handler 扩展
    ├── source-driven-dev：读取 OpenMontage 的 IPC 设计
    ├── TDD：先写 test('render:start 透传 composition')
    ├── incremental-impl：只改 ipc-handlers/render.js
    └── /review：检查 IPC 协议一致性
    │
    ▼
Step 4: 日常循环第 3 轮 —— 添加 render:list-compositions
    ├── TDD：先写 test('render:list-compositions 返回数组')
    ├── incremental-impl
    └── /review
    │
    ▼
Step 5: 子任务完成（AI 自动检测）
    ├── AI: "enhance-render-engine 子任务已完成。需要跑阶段检查吗？"
    │     ↑ verification-before-completion 自动激活
    └── 你说："跑一遍"
    │
    ▼
Step 6: 阶段检查
    ├── verification-before-completion：
    │   ✅ render() 支持 composition 参数
    │   ✅ IPC 协议透传 composition
    │   ✅ 向后兼容：旧调用仍正常工作
    │   ❌ 测试覆盖率 70%，未达 80% 目标
    ├── /health：
    │   · 测试覆盖率: 70%（需补充）
    │   · 死代码: 0
    │   · lint: 0 warning
    └── documentation-and-adrs：
        · 记录 ADR: render-engine 扩展方案
        · 选择本地 composition 参数传递，而不是在 Electron 进程中维护 composition 注册表
    │
    ▼
Session 结束
    ├── AI: "本阶段完成，剩余工作：补测试到 80% 覆盖率。下次从测试开始。"
    └── 你说："记下来"
        ↑ /learn 自动激活，记录问题
```

### 2.2 后补模式流程（对已有代码）

```
你说："对现有 CreateView.vue 跑后补模式"
    │
    ▼
AI 自动执行 6 步流水线：
    │
    ① source-driven-dev
    │   对比 D:\Projects\OpenMontage\remotion-composer\src\Explainer.tsx
    │   输出差异清单
    │
    ② code-review-and-quality
    │   扫描 CreateView.vue 的安全/错误处理/边界
    │   输出审查报告
    │
    ③ /cso + /guard
    │   安全审计：buildProps 是否有注入风险？
    │
    ④ 补测试
    │   为 buildProps() 写单元测试
    │   为 canRender 计算属性写测试
    │
    ⑤ documentation-and-adrs
    │   记录 CreateView 的架构设计
    │
    ⑥ /health
    │   健康检查评分
```

---

## 第三章：触发方式详解

### 3.1 日常循环的触发

| 触发词 | 效果 |
|--------|------|
| `使用质量节拍` | 全量激活所有三层机制 |
| `遵循质量节拍` | 同上 |
| `日常循环` | 只激活第一层（编码节奏），不检查阶段 |
| `当前焦点：[描述]` | 设定本次 session 的子任务，AI 自动进入日常循环 |

### 3.2 阶段检查的触发

| 触发词 | 效果 |
|--------|------|
| `阶段检查` | AI 执行 verification + health + adrs 全流程 |
| `验收一下` | AI 执行 verification-before-completion |
| `健康检查` | AI 执行 /health |
| `记下来` | AI 执行 documentation-and-adrs |

**AI 也会主动触发**：当它检测到以下条件时，会主动问你"需要跑阶段检查吗？"

```
- 当前 Phase 的 TODO 清单上所有子任务标记为完成
- 测试覆盖率达到目标值
- /review 报告没有 CRITICAL 项
```

### 3.3 特殊场景的触发（完整映射表）

AI 通过**关键词匹配**自动激活对应技能。以下是完整的映射规则：

| 你说的话（关键词加粗） | AI 匹配的技能 | AI 的行为 |
|---------------------|--------------|----------|
| "出 **bug** 了" / "这 **错误** 怎么回事" / "**根因**是什么" | /investigate, systematic-debugging | 进入 5 阶段调试流程（复现→分析→假设→修复→报告） |
| "**并行**做" / "**同时**搞" / "互不**依赖**" | subagent-driven-dev, dispatching-parallel-agents | 分析任务依赖图，启动多个 worker |
| "**首次联调**" / "**第一**次跑" / "小心**测试**" | /careful, defense-in-depth | 每步确认结果，加入超时/验证/回滚三层保护 |
| "这代码**可疑** / **不对** / **冗余**" | doubt-driven-dev | 主动质疑假设，标记存疑点逐个验证 |
| "**安全**审计" / "**密钥**泄露" / "检查**风险**" | /cso, /guard | OWASP + STRIDE 全量扫描 |
| "**架构**审一下" / "**方案**评估" | /plan-eng-review | 架构深度审查 |
| "**UI**审一下" / "**视觉**看看" | /plan-design-review, /design-review | UI/UX 审查 |
| "这个**需求**确定吗" / "**值不值得**做" | /office-hours | 6 轮追问澄清 |
| "**接口**设计" / "IPC **协议**" | api-and-interface-design | 接口定义 + 签名规范 |
| "**审查**意见回**来了**" / "**改完了**再看" | receiving-code-review | 逐条确认修复 |
| "**发起**审查" / "帮我**看**这段代码" | requesting-code-review | 生成审查请求 |
| "**分支收尾**" / "这个**搞完了**" | finishing-a-development-branch | 测试→merge→清理 |
| "**发布**说明" / "**release notes**" | /document-release | 生成变更日志 |
| "**总体验收**" / "跑一遍 **QA**" | /qa | 全量质量验证 |
| "**复盘**一下" / "这**周**怎么样" | /retro | 工程复盘报告 |
| "**记**下来" / "**记录**这个问题" | /learn | 写入 learnings |
| "**commit**" / "**push**" / "**合并**" | git-workflow-and-versioning | Git 操作规范化 |
| "这代码可以**简化**" / "太**复杂**了" | code-simplification | 重构简化 |
| "**Vue 组件**规范" / "**前端**最佳实践" | frontend-ui-engineering | Vue 组件规范审查 |

---

## 第四章：实际场景（完整会话示例）

### 场景 A：日常开发 —— 做 Phase 1 的 render-engine.js 扩展

```
你：使用质量节拍。当前焦点：Phase 1 —— 允许 render-engine.js 选择不同的 Composition。

AI：好的，开始日常循环。

① source-driven-dev
    读取 D:\Projects\OpenMontage\tools\video\video_compose.py
    发现关键设计：render_runtime 字段 + composition 选择
    当前 render-engine.js 只有默认的 'Explainer'，需要加 composition 参数

② TDD
    先写测试文件 tests/render-engine.test.js：
    · test('default composition is Explainer')
    · test('accepts composition parameter')
    · test('falls back to Explainer on invalid composition')
    · test('passes composition to remotion CLI')
    测试跑通 → 红色的 → 开始写实现

③ incremental-impl
    render() 签名从:
      render(props, options = {})
    改为:
      render(props, options = { composition: 'Explainer', ... })
    只改了这个函数，没改其他地方

④ code-simplification
    发现 OpenMontage 的实现有 HyperFrames + FFmpeg 路由，当前不需要，去掉

⑤ /review
    输出：
    🟢 render-engine.js:12 新增 composition 参数有默认值，向后兼容
    🟢 render-engine.js:45 composition 参数透传到 remotion CLI
    🟠 render-engine.js:30 缺少 composition 类型校验（建议加）

你：好，下一个子任务 —— 扩展 ipc-handlers/render.js

AI：回到日常循环。① source-driven-dev...
```

### 场景 B：出 bug —— OpenMontage 的 TalkingHead 在 Multi-Publish 渲染不出来

```
你：TalkingHead 模式渲染出来是黑屏。

AI：[检测到 bug 场景，自动匹配 /investigate]
    进入根因调试流程：

    Phase 1 — 复现
    运行 npx remotion render src/index.tsx TalkingHead out/test.mp4 --props=...
    确认黑屏可复现

    Phase 2 — 对比分析
    在 OpenMontage 跑同样的命令 → 正常
    对比两个项目的 Root.tsx → 差异发现：
    OpenMontage 的 TalkingHead 有 defaultProps.videoSrc = ""
    Multi-Publish 也是，但 IPC 传递时 videoSrc 字段丢失

    Phase 3 — 假设验证
    假设：IPC 序列化时 videoSrc 被过滤了
    证据：查看 IPC 日志，videoSrc 字段在 preload.js 的 contextBridge 中被遗漏

    Phase 4 — 修复
    在 preload.js 的 renderStart 定义中添加 videoSrc 字段

    Phase 5 — 报告
    🔴 CRITICAL | preload.js:42 | videoSrc 字段未在 contextBridge 注册
    根因: preload.js 的 renderStart 接口固定只透传 props/profile
    修复: 在 renderStart 中添加 videoSrc 到白名单
```

### 场景 C：后补模式 —— 对已有代码 CreateView.vue 补质量

```
你：对 apps/desktop/src/views/CreateView.vue 跑后补模式。

AI：好的，启动后补流水线。

Step 1 — 源码对齐
    OpenMontage 的 CreateView 对应的是 Explainer.tsx 的 props 结构
    当前 CreateView.vue 的 buildProps() 只传了 cuts + theme
    缺失：overlays、captions、audio、compositionArgs
    输出差异清单到 01-docs/quality-reports/createview-diff.md ✅

Step 2 — 代码审查
    🟢 组件覆盖了 loading/error 状态
    🟠 buildProps() 的场景类型硬编码为 text_card 和 anime_scene
    🟠 scene-${i} 的 id 可能冲突
    输出审查报告 ✅

Step 3 — 安全审计
    🟢 没有直接 DOM 操作
    🟢 没有 eval
    🟢 所有用户输入通过 props 传递，没有注入风险
    输出审计报告 ✅

Step 4 — 补测试
    为 buildProps() 写测试：
    · text 模式 → 生成正确的 cuts 数组
    · gallery 模式 → 生成正确的 cuts 数组
    · 空输入 → 返回空数组
    测试通过 ✅

Step 5 — 补 ADR
    记录：为什么 CreateView 用 buildProps 而不是直接操作 store
    输出 ADR 到 docs/adr/ ✅

Step 6 — 健康检查
    评分: 7.2/10
    建议：补充场景类型选择器、增加渲染参数校验
```

---

## 第五章：完整技能覆盖清单

### 日常循环（8 个技能）

| # | 技能 | 触发方式 | 在循环中的角色 |
|---|------|---------|--------------|
| 1 | source-driven-dev | 自动（循环起点） | 读取 OpenMontage 源码，列出接口 |
| 2 | spec-driven-dev | 自动（伴随 1） | 提取接口签名和参数 |
| 3 | TDD | 自动（伴随 2） | 先写测试再写实现 |
| 4 | testing-anti-patterns | 自动（伴随 3） | 检查测试质量 |
| 5 | code-simplification | 自动（伴随 3） | 实现中持续做减法 |
| 6 | incremental-impl | 持续约束 | 防止 scope creep |
| 7 | context-engineering | 循环开始时 | 加载上下文 |
| 8 | /review | 自动（循环终点） | 写完后审核 |

### 阶段检查（3 个技能）

| # | 技能 | 触发方式 | 产出 |
|---|------|---------|------|
| 9 | verification-before-completion | AI 检测到子任务完成时主动提示 | 验收清单逐条确认 |
| 10 | /health | AI 主动提示或你说"健康检查" | 质量评分 + 改进项 |
| 11 | documentation-and-adrs | AI 主动提示或你说"记下来" | ADR 文档 |

### 特殊场景（26 个技能）

见第三章完整的触发映射表，按场景分类：

**调试类**: /investigate, systematic-debugging, /careful, defense-in-depth, doubt-driven-dev
**并行类**: subagent-driven-dev, dispatching-parallel-agents
**安全类**: /cso, /guard
**审查类**: /plan-eng-review, /plan-devex-review, /plan-design-review, design-consultation, /design-review, receiving-code-review, requesting-code-review, api-and-interface-design, frontend-ui-engineering
**需求类**: /office-hours, /plan-ceo-review
**发布类**: finishing-a-development-branch, /ship, /document-release, /qa, git-workflow-and-versioning
**复盘类**: /retro, /learn

---

## 附：接入指南

### 让 AI 识别这个 skill

这个 skill 放在 `~/.agents/skills/质量节拍/SKILL.md`。支持这个目录的 AI 工具（Codex、Cursor、Claude Code 等）会自动发现它。

### 首次会话

```
使用质量节拍 skill，当前焦点：[Phase 编号] —— [子任务名称]
```

### 后续会话

```
遵循质量节拍。当前焦点：[新子任务]
```

### 一句话检查自己是否在执行

> 我现在在质量节拍的哪一层？
> - 日常循环：正在编码，4 步走完了吗？
> - 阶段检查：Phase 快结束了，跑了验收吗？
> - 特殊场景：当前状况触发映射表里的哪一条？
