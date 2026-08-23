# 机制整合包 — 新环境复制整套流程

> 目标：新电脑/新环境用 Codex 时复制「CCG + 质量节拍 + OpenSpec」整套机制。
> ⚠️ 这是**核对清单驱动的安装**，不是"跑一条命令就全好"——完整核对见 **[env-checklist.md](env-checklist.md)**。

## 前置条件

- Node.js 20+、Codex CLI、git + GitHub 认证
- Claude Code CLI（可选；CCG 双模型分析需要）

## 安装步骤（7 步）

### 1. CCG 机制（官方安装器）

```bash
npx ccg-workflow        # 交互式菜单 → 选 "X. Codex Mode"
```

生成：`~/.codex/AGENTS.md`（CCG 决策矩阵/任务系统/铁律）+ `config.toml`（multi_agent_v2）+ `codeagent-wrapper` + hooks。

安装后**追加本地增强**（`ccg/codex-overlay.md` 区块到 `~/.codex/AGENTS.md`）：codegraph 优先路由 / fastctx 说明 / 子代理使用编排。

**双模型认证（手工）**：Claude Code 登录 + antigravity/Gemini CLI 登录 + API Key 配置——没有认证则 CCG 退化为单模型 + 子代理，机制文本仍生效但双模型交叉验证不可用。

### 2. MCP 工具链（自动，一条命令）

```bash
node bootstrap-env.js --yes
# 自动完成：
#   1. fastctx：npm i -g fastctx + fastctx apply --yes + status
#   2. codegraph：npm i -g @colbymchenry/codegraph（已装跳过）
#   3. ~/.codex/config.toml：备份后只追加缺失的 [mcp_servers.*] 段
#      （fastctx / node_repl 路径自动检测，不覆盖已有配置，无密钥）
#   4. 可选 git clone quality-rhythm → ~/.agents/skills/质量节拍
# 输出「仍需手工」清单（认证 + 重启）
```

> 想先看会执行什么：`node bootstrap-env.js --dry-run`。手动模板参考 `codex/config.toml.template`。

### 3. OpenSpec（CLI 已由 bootstrap 安装，确认版本）

```bash
openspec --version    # ≥ 1.8（bootstrap-env.js 已自动 npm i -g @fission-ai/openspec）
```

### 4. 项目初始化（一键，含 openspec init + codegraph init + 模板）

```bash
node integrations/install-mechanism.js <项目> --yes
# 自动完成：
#   0. openspec init --tools codex --force（生成 openspec/ 目录 + .agents/skills 技能）
#   1. 复制 config.yaml.template / spec-contract.md / openspec-sync-check.js
#   2. 复制 AGENTS.md.snippet（追加）；.quality-gates.md 由 ci-hardening 脚手架渲染
#   3. codegraph init（建 .codegraph 项目索引）
#   4. 提示 CCG / 门禁（交互式）
#   5. 验证（openspec doctor + 检查脚本）
```

**质量节拍 skill 本体**（bootstrap-env.js 已自动 clone）：
```bash
git clone https://github.com/Colinchiu007/quality-rhythm.git   # → ~/.agents/skills/质量节拍/
```

**项目门禁**（install-mechanism.js 已自动生成产物，无需交互 installer）：
- `.quality-rhythm` 标记 + `.husky/pre-commit.js` + `branch-protection.json`
- `.github/workflows/quality-gate.yml` + `.quality-gates.md` 由 ci-hardening 脚手架渲染（并行 QG + 触发去重，单一来源 `skills/other/ci-hardening/assets/templates/`）
- husky 钩子已由 install-mechanism.js 自动注册（`node .husky/install.js --force`）

### 6. 会话隔离与共享主目录写保护（Windows 一键）

Multi-Publish 的共享主目录必须保持 main + clean，运行时代码只允许落在隔离 worktree。克隆仓库后运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap-write-guard.ps1
```

该命令自动完成：git hooks 安装 → 自检（session-write-guard / session-isolation-automation）→ 注册 `Session Isolation Health`（默认每 15 分钟）与 `Session Isolation Write Guard`（登录启动）→ 启动 watcher → 健康门禁；幂等可重跑。新电脑可覆盖：`-WorktreeRoot` / `MP_WORKTREES`、`-GitBash` / `MP_GIT_BASH`、`-GitPath` / `MP_GIT`。验证命令见 env-checklist 第 7 节。

### 7. 重启 Codex + 验证

**必须完全重启 Codex**（技能/AGENTS.md 启动时加载），然后逐项验证（详见 env-checklist 第 8 节）：
```bash
openspec doctor                                   # OpenSpec 健康
openspec list --specs                             # 契约可见
node scripts/openspec-sync-check.js               # 归档同步
fastctx status                                    # MCP handshake
codegraph status                                  # 索引
# 会话内：skills 可见 [$quality-rhythm]、/opsx:* 可用
```

## 日常使用（装完怎么用）

### 触发质量节拍

- 任务开始时说「使用质量节拍」或由项目 AGENTS.md 自动触发（涉及代码修改即强制门禁）
- 质量节拍自动路由 Phase 0-5（探索→规划→开发→交付→复盘）并执行 QM 门禁（`.quality-gates.md`）

### 任务分层（收到需求先 CCG 5 秒评估）

```
S 复杂度 + 低风险   → 直接 CCG + 质量节拍，不建 change
M+ 或中/高风险     → 必须走 OpenSpec 规格流程（本表下方）
触红线（auth/数据库/API 契约/加密）→ 无论大小一律建 change
```

### M+/中高风险任务端到端流程

```bash
# ① 建 change（规格层）
/opsx:propose <change-name>
#   或命令行：openspec new change <name>
#   → 按依赖顺序生成 proposal → design → specs → tasks
#   → 对既有基线先做差异审计（只承载真实待办）

# ② 实现（进度以 tasks.md 勾选为唯一来源）
/opsx:apply          # 按 tasks 实施；每个任务标注测试目标（TDD）

# ③ 完成归档（三同步）
/opsx:archive        # 或 openspec archive <name> -y
#   → 规格合入 openspec/specs/ + change 归档
#   → CCG task 归档至 .ccg/tasks/archive/<yyyy-mm>/
#   → 质量节拍复盘（learnings）
node scripts/openspec-sync-check.js   # 确认无「completed 但未归档」
```

### 常用命令速查

| 命令 | 用途 |
|---|---|
| `openspec doctor` | OpenSpec 健康检查 |
| `openspec list` / `openspec list --specs` | active changes / 契约清单 |
| `openspec status --change <name>` | change artifacts 进度 |
| `openspec validate <name>` | 校验 change（spec 场景格式等） |
| `node scripts/openspec-sync-check.js` | 归档三同步检查（CCG task ↔ change） |
| `[$quality-rhythm](...)` | 会话内触发质量节拍技能 |
| `/opsx:propose` `/opsx:apply` `/opsx:archive` | OpenSpec 三步命令（Codex 用 `$openspec-propose` 等） |

### 端到端示例（一次真实迭代）

```
需求: "图片轮播加 TTS 音色复制"（M/中风险）
① CCG 评估 → M/中风险 → 建 change: /opsx:propose story2video-tts-copy
② quality-rhythm Phase 0-1: 需求确认 + 设计评审（门禁通过）
③ 实现: /opsx:apply → tasks.md 逐项勾选（每项带测试）
④ Phase 2-3 门禁: 测试全绿 + QM 检查 + 视觉回归
⑤ /opsx:archive → 规格合入 specs/ + CCG task 归档 + 复盘
⑥ node scripts/openspec-sync-check.js → OK（无警告）
```

## 整合包结构

```
integrations/
├── README.md                  ← 本文件
├── env-checklist.md           ← 完整核对清单（含生效验证，必读）
├── bootstrap-env.js           ← 用户级一键（fastctx/codegraph/openspec CLI/config.toml/overlay）
├── install-mechanism.js       ← 项目级一键（openspec init/codegraph init/模板复制）
├── verify-env.js              ← 验证门禁（PASS/FAIL 报告；FAIL 阻塞完成）
├── ccg/codex-overlay.md       ← CCG 本地增强区块（官方安装后追加）
├── codex/config.toml.template ← ~/.codex/config.toml 骨架（MCP 配置，无密钥）
├── openspec/
│   ├── config.yaml.template   ← 1.8 context/rules 配置模板
│   ├── spec-contract.md       ← 11 条机制契约（按项目裁剪）
│   └── openspec-sync-check.js ← 归档三同步检查
└── project/
    └── AGENTS.md.snippet      ← 分支分层 + 机制硬化片段（.quality-gates.md 由 ci-hardening 脚手架渲染，见 skills/other/ci-hardening/assets/templates/）
```

## 跨平台说明

- 脚本以 **Windows** 为主测试（Node 20+ / PowerShell / cmd）
- `bootstrap-env.js` 会按平台生成 config.toml 的 context7 段：Windows 用 `cmd /c npx`，**macOS/Linux 用 `npx` 直连**，并输出平台提示；若 npx 不在 PATH 请手动调整
- `verify-env.js` 的 codeagent-wrapper 检测覆盖 Windows（`~/.claude/bin/*.exe`）与类 Unix（`/usr/local/bin/codeagent-wrapper`）
- 已知限制：macOS/Linux 未经完整端到端验证；如遇问题按 env-checklist 逐项核对

## 诚实边界（不会自动复制）

- API Key / 登录态（Claude、antigravity/Gemini、Stitch、CloudBase）
- 插件市场 local source、历史项目 trust 列表
- Multica 平台运行时块
- 项目历史（.ccg/tasks 归档、openspec 历史、codegraph 索引）
- 机制文本与模板可复制；**工具链与认证需按 checklist 手工配置，重启后验证生效**
- Windows 计划任务、git hooks 与实时 watcher 不会随 skill 安装自动生效，必须在新电脑上运行项目内 `scripts/bootstrap-write-guard.ps1`
