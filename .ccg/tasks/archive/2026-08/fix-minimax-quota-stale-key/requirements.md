# 更换 MiniMax API Key 后视频流水线仍报额度用完 — 根因分析

## 现象
用户在桌面「模型设置」把 MiniMax 多模态（minimax-multimodal）API Key 换成新套餐 Key，但视频创作流水线仍提示
`story2video.quota_exceeded`（模型 API 的额度或余额已用完…请更换模型后从断点继续）。

## 结论（根因）
视频创作流水线 `optimize`（提示词优化）阶段统一走外部 sidecar **prompt-engine（127.0.0.1:8013）**，
该服务使用**自己的 `.env` 凭据**（`D:/Data/projects/prompt-engine/.env` 内 `MINIMAX_API_KEY`，MiniMax-M3），
与桌面「模型设置」写入的 `multi-publish.db.model_providers[minimax-multimodal]` 是**两个独立凭据来源**。
桌面改 Key 不影响 sidecar；sidecar 里的旧 Key（旧 Token Plan，已耗尽）持续导致 optimize 阶段
402 `insufficient_balance_error`「当前已达到 Token Plan 用量上限」→ 渲染层映射为额度耗尽提示。

`prompt_engine/config.py:15-18` 明示：桌面 Bridge 启动时**不注入 LLM Key**（只透传宿主 env），引擎自行加载项目根 `.env`。

## 硬证据
- 桌面侧 `model_providers`：`minimax-multimodal` updated_at=2026-08-16 10:49:19，api_key_enc 存在（Key 已更新）。
- 桌面侧 provider 日志今日：10:58 listVoices success、11:47:38 testConnection success、11:50:47 **generateImage success**（新 Key 可用）。
- 流水线日志 11:43/11:46/11:48（换 Key 之后）三次失败全部在 `stage=optimize (3/7)`：
  `Error code: 402 - {'type': 'error', 'error': {'type': 'insufficient_balance_error', 'message': '当前已达到 Token Plan 用量上限…', 'http_code': '402'}, 'request_id': '06d0…'}`。
- `D:/Data/projects/prompt-engine/.env` mtime=2026-07-19（未随桌面设置更新），`LLM_PROVIDER=minimax` / MiniMax-M3。
- `.quality-gates.md` 既有记录：prompt-engine 侧账户 402 属「账户需充值」外部边界（PENDING_EXTERNAL）。

## 修复路径
### 立即解除阻塞（不涉及本仓库代码）
1. 编辑 `D:/Data/projects/prompt-engine/.env`，将 `MINIMAX_API_KEY` 替换为新套餐 Key（同一账号新套餐 Key 即可，无需改模型）。
2. 重启桌面应用（PromptBridge 随桌面拉起 8013；或手动重启 8013 `python -m prompt_engine.api`）。
3. 验证：`curl http://127.0.0.1:8013/health` 正常后，在流水线「从断点继续」重跑 optimize。

### 产品级修复（可选，需 openspec propose + worktree + 双模型审查）
- 方案 A：PromptBridge 启动 prompt-engine 时按需注入 `MINIMAX_API_KEY`（从 ModelProviderManager 读取 minimax-multimodal 的当前解密 Key），使桌面设置成为单一来源；
- 方案 B：settings 保存 MiniMax Key 时同步写入 prompt-engine 项目根 `.env`（需处理跨仓库路径、加密、轮换与并发）；
- 方案 C：保持现状，把 prompt-engine 视为独立外部验收边界，文档化「模型设置」与 sidecar 凭据的差异。

## 交接待办（2026-08-16 追加）
- 已将本证据链写入并发会话任务目录：
  - 引擎侧：D:\Data\projects\mp-worktrees\pe-byok-llm-object\.ccg\tasks\prompt-engine-byok-llm\requirements.md
  - 桌面侧：D:\Data\projects\mp-worktrees\mp-prompt-engine-byok-llm\.ccg\tasks\prompt-engine-byok-llm\requirements.md
- 两个 BYOK change 需成对发布；桌面侧 PromptBridge 注入 llm/caller 后，本 bug 即结构性修复（桌面设置成为单一 Key 来源）。
