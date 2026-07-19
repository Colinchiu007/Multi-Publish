---
name: auto-exec
description: 自主执行编排 — 将开发目标自动分解为可执行任务，通过跨会话批量执行持续工作，支持多子Agent并行 + Review + E2E + 上下文压缩 + 自适应记忆 + Knowledge Module
---

# Auto-Exec 自主执行编排

参见 [README.md](README.md) 获取完整架构说明。

## 快速集成

将本 `SKILL.md` 导入你的 Claude 技能系统，即可在任何会话中使用 `/auto-exec`。

### 导入步骤

1. 将本目录放入你的 `.claude/skills/` 或通过 Cowork skill manager 导入
2. 在 `core-rules.md` 的 Intent Gate 后添加 auto-exec 触发规则
3. 创建 `.plan/` 目录（参照 `.plan/README.md`）
4. 自定义 `ROLE_CARD_MAPPING.md` 中的角色映射

### 核心配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| ROLE_CARD 路径 | `agent-patch/.cowork/` | 各角色身份卡 |
| .plan/ 路径 | 项目根目录 | 跨会话状态目录 |
| 轮询间隔 | */1 * * * * | 每 1 分钟（batch 模式，高吞吐） |
| Review Agent | 按 risk 触发 | high/medium+code/shared-models 必须 |
| 执行模式 | batch | 每轮尽可能多完成 pending 任务，上下文 >70% 时退出 |

### Worker Prompt v3 — 三个新增强制执行步骤

| # | 步骤 | 指令 | 解决 |
|---|------|------|------|
| 1 | **分支检查** | `git branch --show-current` → 不在 main/特性分支则创建 `feat/auto-exec-<任务>` 并切换 | 避免在错误分支直接改 |
| 7 | **原子 Commit** | 每独立逻辑变更 → `git add <文件> && git commit -m "类型(范围): 描述"`，禁止 `git add -A` | 避免 46 文件同次 commit |
| 11 | **强制 Push** | 每 3 个 commit 或 batch 结束时 `git push`，失败时 `git pull --rebase` 再 push | 避免 commit 不 push |
| 12 | **知识收割** | 每轮 batch 结束前将失败/发现/模式写入 `.plan/knowledge/`，后续轮次自动加载 | 避免子 Agent 知识丢失 |

详见 Worker prompt 模板（在 auto-exec skill 的 Phase 3 中）的步骤 1、7、11。

### 自定义角色

编辑 `ROLE_CARD_MAPPING.md` 中的角色映射表，适配你的项目结构：
