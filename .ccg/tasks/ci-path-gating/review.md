# CI 路径门控 Phase 1 — 双模型审查报告

## 审查方式
- antigravity：`agy command not found`（后端不可用）→ 按机制硬化规则降级。
- Claude（codeagent-wrapper --lite，固定 diff 只读）：第一轮完成；修复后重审 240s 超时强杀（无孤儿进程），
  以契约测试 + 本地验证替代（15/15 pass）。

## Claude 第一轮发现处置
| 级别 | 发现 | 处置 |
|---|---|---|
| 🔴 Critical | required check 死锁（paths-ignore + 分支保护） | **排除**：`gh api .../branches/main/protection` 404 + rulesets `[]`，main 无 required checks |
| 🔴 Critical | .ccg/**、openspec/** 忽略导致契约测试自绕过 | **部分成立→加固**：契约测试在 `.github/scripts/**`（未忽略）；新增 CI_IGNORED_PATHS 契约测试防漂移 |
| 🟠 Warning | `**/*.md` 过宽（嵌套 md 被跳过） | **修复**：收窄为根级 `*.md` |
| 🟠 Warning | LICENSE/.gitignore 裸名匹配任意深度 | **排除**：GH Actions 路径过滤非 gitignore 语义，无 `/` 模式仅匹配根级 |
| 🟠 Warning | 契约测试需扩展校验忽略集 | **修复**：新增 `CI_IGNORED_PATHS` 断言测试 |
| 🟠 Warning | 列表复制 6 份易漂移 | **缓解**：注释指向契约测试单一来源 |
| 🟠 Warning | quality-gate.yml BOM | **既有问题**：HEAD 即带 BOM，本次未引入，不动 |
| ⚪ Info | tag push 不受过滤 | **修复**：build.yml 加注释固化 |

## 提交前 .quality-gates.md 自检
- [x] YAML 语法/解析通过（js-yaml 全量）
- [x] 契约测试通过（15/15，含新增白名单断言）
- [x] 无硬编码密钥/路径（仅 workflow 触发配置）
- [x] 变更在请求范围内（4 个文件）
- [x] 分支隔离：独立 worktree codex/ci-path-gating，基点 origin/main
