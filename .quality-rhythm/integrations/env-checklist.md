# 新环境安装核对清单（env-checklist）

> 用途：新电脑复制整套机制时逐项核对。**每项都必须有验证证据，禁止口头"应该没问题"。**
> 机制分三层：CCG（编排）/ 质量节拍（门禁）/ OpenSpec（规格工件）。

## 0. 前置

- [ ] Node.js 20+（`node -v`）
- [ ] Codex CLI 已登录可用
- [ ] Claude Code CLI（CCG 双模型需要；`claude --version`）
- [ ] git + GitHub 认证（`gh auth status`）

## 1. CCG 机制（官方安装器）

- [ ] `npx ccg-workflow` → 菜单选 Codex Mode → 生成 `~/.codex/AGENTS.md` + `config.toml` + `codeagent-wrapper`
- [ ] 追加本地增强：`integrations/ccg/codex-overlay.md` 区块到 `~/.codex/AGENTS.md`（codegraph 路由 / fastctx / 子代理使用）
- [ ] 双模型认证：antigravity 或 Gemini CLI 登录 + Claude 登录（`codeagent-wrapper --backend <x> --version` 可跑）
- [ ] `~/.codex/config.toml` 含 `[features.multi_agent_v2]`（max_concurrent_threads_per_session=6、wait 480s——官方 Codex 模板自带）

## 2. MCP 工具链（可用 bootstrap-env.js 自动完成）

```bash
node integrations/bootstrap-env.js --yes    # 自动：fastctx 安装+apply / codegraph 安装 / config.toml 合并
node integrations/bootstrap-env.js --dry-run  # 先看计划
```

自动后仍须逐项核对结果：
- [ ] **fastctx**：`fastctx status`（要求 MCP handshake PASS；bootstrap 已执行 apply）
- [ ] **codegraph**：`codegraph --version`（bootstrap 已装 `@colbymchenry/codegraph`）；目标项目 `codegraph init` + `codegraph status`（索引 up to date——bootstrap 不建索引，需在项目内执行）
- [ ] **config.toml**：bootstrap 已备份并追加缺失 MCP 段；检查 `~/.codex/config.toml` 含 `[mcp_servers.fastctx]`/`[mcp_servers.codegraph]` 且路径非 `{{...}}` 占位符
- [ ] context7（可选）：模板已含 npx 方式，无需额外装
- [ ] Stitch/浏览器/文档等插件（可选，按需从市场启用）

## 3. OpenSpec 与项目初始化（install-mechanism.js 自动）

```bash
node integrations/install-mechanism.js <项目> --yes
# 自动：openspec init --force + 复制模板 + codegraph init + 验证
```

自动后仍须核对：
- [ ] `openspec --version` ≥ 1.8（bootstrap-env.js 已装 CLI）
- [ ] 项目内 `openspec init` 已执行（install-mechanism 自动；`.agents/skills/openspec-*` 生成）
- [ ] `openspec doctor` → OpenSpec root: ok
- [ ] `openspec list --specs` → 契约可见（按项目裁剪 11 条）
- [ ] `codegraph status` → 索引 up to date（install-mechanism 已自动 `codegraph init`）

## 4. 质量节拍 skill

- [ ] **skill 目录**：bootstrap-env.js 已自动 clone（`~/.agents/skills/质量节拍/`）；缺失时手工 `git clone https://github.com/Colinchiu007/quality-rhythm.git`
- [ ] **项目门禁产物**：install-mechanism.js 已自动复制（`.quality-rhythm` 标记 + `.husky/pre-commit.js` + `.github/workflows/quality-gate.yml` + `branch-protection.json`）
- [ ] husky 钩子注册：项目内执行 `node .husky/install.js`（一次）
- [ ] pre-commit 自动化门禁：提交时自动执行 分支保护 + 测试存在性 + 语法检查 + 密钥扫描，通过后自动生成 `.quality-gates.md` 审计记录（幂等，无需人工勾选）；失败 → commit 被拒
- [ ] `~/.codex/config.toml` 或项目 AGENTS.md 能路由到质量节拍 skill

## 5. 项目模板

- [ ] `AGENTS.md.snippet` 合并进项目 AGENTS.md（分支分层/机制硬化）
- [ ] `.quality-gates.md` 由 ci-hardening 脚手架渲染生成（单一来源 `skills/other/ci-hardening/assets/templates/quality-gates.md.tpl`）
- [ ] 按项目裁剪：QM 条款、测试命令、spec-contract 中的项目背景

## 6. 重启 Codex（技能加载）

- [ ] 完全重启 Codex 应用（.agents/skills、openspec 技能、AGENTS.md 都是启动时加载）

## 7. 生效验证（验证门禁 + 重启后逐项）

**自动门禁（任一 FAIL 阻塞完成）：**
- [ ] `node verify-env.js <项目>` → 输出 PASS/FAIL 报告；FAIL 项修复后重跑（install-mechanism.js 会自动调用）

**重启 Codex 后逐项：**
- [ ] 会话 skills 列表可见：openspec-propose / openspec-apply-change / 质量节拍（`[$quality-rhythm]` 可触发）
- [ ] 重跑 `node verify-env.js <项目>` → WARN 项收敛（fastctx status 全 PASS、认证已配置）
- [ ] `node scripts/openspec-sync-check.js` → OK（无未归档警告）
- [ ] CCG 双模型 smoke：对 M 级任务触发双模型分析，两路都有产出（而非只一路/报错）
- [ ] 首次 M+/中高风险任务走完整链路：CCG 评估 → 质量节拍门禁 → `/opsx:propose` → 实现 → archive 三同步

## 已知不会自动复制（手工项）

- 各平台 API Key / 登录态（Claude、antigravity/Gemini、Stitch、CloudBase 等）
- `~/.codex/config.toml` 中的插件市场 local source、历史项目 trust 列表
- Multica 平台运行时块（平台特定）
- 项目历史（.ccg/tasks 归档、openspec/changes 历史、codegraph 索引）