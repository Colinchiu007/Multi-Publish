# Codex 本地增强 Overlay（官方 ccg-workflow Codex 模式安装后追加）

> 生成自 ~/.codex/AGENTS.md 与官方 templates/codex/AGENTS.md 的差异。
> 用途：新环境执行 `npx ccg-workflow`（菜单选 Codex Mode）生成官方 ~/.codex/AGENTS.md 后，追加以下区块以恢复本地增强能力。

---

## 区块 1：代码检索路由（codegraph 优先）

<!-- CCG-FAST-CONTEXT-START -->
# 代码检索路由提示

## 核心原则

**理解代码上下文、探索性搜索、自然语言定位代码、入口/调用链/影响面分析，以及大仓库语义搜索，默认优先使用 `mcp__codegraph__codegraph_explore` / `mcp__codegraph__codegraph_node`。只有在 codegraph 不可用、用户明确要求外部 Windsurf 语义搜索，或必须对接 fast-context 时，才使用 `mcp__fast-context__fast_context_search`。**

**本地文件读取、搜索、批量替换和终端工作仍按 `mcp__fastctx__read` / `grep` / `glob` / `replace` / `run` 处理，不要把 `fastctx` 与 `fast-context` 混用。**
<!-- CCG-FAST-CONTEXT-END -->

## 区块 2：fastctx 本地文件工具

<!-- fastctx:begin -->
## Local file inspection

The FastCtx MCP tools are the first-class way to read, search, and find
local files: `mcp__fastctx__read`, `mcp__fastctx__grep`,
`mcp__fastctx__glob` — prefer them over `cat`/`Get-Content`,
`rg`/`findstr`/`Select-String`, and `dir`/`ls -R`. Pass absolute paths. The
last line of every result says `Complete` or `Partial` — continue only with
the exact parameters a `Partial` note provides.

### Batch replacement

Use `mcp__fastctx__replace` for mechanical find-and-replace across files.
It preserves each file's encoding and line endings, supports dry-run previews,
and rejects concurrent changes before writing. Use apply_patch for generated
content, semantic rewrites, or small local edits.

### Shell commands

Prefer `mcp__fastctx__run` over the built-in shell for terminal work: it
executes with bash (Git Bash on Windows), so always write POSIX bash —
never PowerShell syntax. Commands must be non-interactive (no TTY): use
flags like -y or --no-edit, and expect editors/pagers to be disabled. For
anything that may run longer than two minutes, use
`mcp__fastctx__run_background`, poll `mcp__fastctx__job_output`, and
stop it with `mcp__fastctx__job_kill`. Background jobs run independently
of this session and survive restarts; rediscover an earlier job with
`mcp__fastctx__job_list` and resume polling it by job_id. A non-zero exit
code is a normal result. The last line of every result says `Complete` or
`Partial`.
<!-- fastctx:end -->

## 区块 3：子代理使用（编排）

## 区块 4：机制硬化规则（2026-08-08，与 openspec-integration 契约同步）

- **远程同步**：任务标记 completed 前必须核对关联 PR 已合并或记录 remoteStatus，禁止基于滞后状态做重复工作。
- **子代理降级**：派发探子前探测子代理可用性；出现 403/超时等后端不可用错误时立即降级为主代理直接执行，不盲等。
- **OpenSpec 引导**：OpenSpec 已启用——M+/中高风险任务须经 `/opsx:propose` 建 change，机制契约见 `openspec/specs/openspec-integration/spec.md`。

## 子代理使用

子代理在我们的工作里用于探索，他是你的探子。
把子代理当成你手边最顺手的、用于「宽而重」读取的工具。工作的任何时候，只要你觉得需要就可以派。只有在它能减少主线程上下文污染、提高并行度或者提供独立核验的时候才使用。
必须遵守：你需要更激进和更频繁地调用子代理，在任何需要的情况下，而不仅仅只是在对话的开头。我们需要更频繁的子代理调用来避免上下文腐烂，你承担子代理编排者的角色。

### 何时直接处理

直接读取以及处理以下内容，不派子代理：

* 已知位置的小文件、少量代码或者单一事实；
* 即将修改的具体代码；
* 派发、等待以及复核的成本不低于自己读取的任务。
* 奠基性文档，无论多长都自己读：架构文档、设计文档、交接备忘录（在别的工作流里可能是别的名字）等用来让你建立全局视角、充当后续判断地基的文件——它们的价值全在细节与脉络，一经子代理转译即失真，长度不构成外包的理由。

### 何时适合派发

适合交给子代理的：

* 巨型大文件（奠基性文档除外，见上）、跨文件或者跨目录的检索；
* 相互独立、可以并行的探索或者核验；
* 长任务当中需要重新确认模块现状的；
* 会产生大量日志、搜索结果或者外围材料的阅读。

多个独立的任务应当并发派发。

### 委派与验证

给子代理的任务必须是自包含的，说明检索范围、具体问题以及期望的输出。精度重要的时候，要求返回 `file:line`、符号名以及必要的关键原文——这些出处就是你之后廉价复核的抓手。

子代理的结果只是线索，可能遗漏或者出错。但复核不是把它读过的东西重读一遍，那样这次派发就白费了——你买的是「压缩」，重读会把压缩当场退光。复核 = 顺着它给的 `file:line` 以及关键原文来。抽查真的需要主代理亲自阅读的那几小部分，别去重新通读整份材料；既然把「读」外包了出去，就靠它压缩之后的结论来干活，只在结论要紧或者可疑的时候回去点验出处。

唯二需要你亲自完整读原文的是：① 即将修改的确切代码，② 奠基性文档——这两类本就不外包（见「何时直接处理」）。对它们，子代理至多帮你定位，读由你亲自来：定位与阅读是分工，并非重复劳动。

子代理默认只做探索、检索以及核验。代码修改、方案取舍以及最终验证由主代理来负责。

### 派发机制

* 是否派、派几个由主代理自主决定，无需用户明确要求；较重的探索应当拆成多个独立的轻任务来并发派发。
* 我们系统允许最大并行11个会话进程。所以你最多可以并行分派 10 个子代理；子代理模型的成本较低，无需去顾虑并行派发的成本，只要任务需要就积极使用。
* 子代理一律使用默认配置：工具支持角色参数的时候显式指定 `agent_role = "default"` 或者 `agent_type = "default"`；不支持的时候省略角色、由泛型派生加载 `default.toml`。禁用 `explorer`、`worker` 或者其他角色。
* 派生的时候**必须**显式 `fork_turns = "none"`，不复制主代理的历史，让每个探子都保持干净、快、不背主代理正在腐烂的上下文（代价即上文「任务必须自包含」）。
* 需要多个子代理的时候在同一轮并发派发；派发之后主代理立即 `wait_agent`，停止其余的分析、检索、命令执行以及文件修改，直至全部返回。
* 收到某个子代理结果之后，如果提供了 `close_agent` 就必须立即关闭；每个子代理只用一轮，不复用、不追派。
* 特别注意：子代理自派生起累计运行 10 分钟仍未完成：视为异常，主代理必须介入、不得继续盲等；检查代理状态或运行记录，已有可用 MESSAGE 时采用其部分结果，然后停止这个子代理。并自行判断是否需要再派生或拆分更小任务重新分派。

