---
record: blogger-p0-smoke
task: 博主采集 P0 冒烟首次实跑——4/5 通过，并暴露依赖库 @handle 静默返回错误频道的缺陷
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 尚不存在
sync_backfill_owner: 下一个会话
---

## 本次执行记录：博主采集 P0 冒烟实跑（blogger-p0-smoke，2026-10-07）

> 支撑分支 `blogger-collection`｜worktree `mp-blogger-collection`｜基线 `origin/main` = d1214fa1
> 前序：方案 PR #3007（b303e09a）已合并，本 PR 承载其 P0 冒烟的实测结论与脚本修正。

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 混合 PR：PRD 增补（docs）+ 冒烟脚本修正（`packages/python-backend/scripts/creator_p0_smoke.py`）；隔离 worktree，共享根未写入 |
| 冒烟结论 | **部分通过（4/5）** | E2E-2 作品枚举 ✅ 20 条全带 `video_id`；E2E-3 字幕正文 ✅ **1215 字 / `transcript_source=subtitle`**；E2E-4 探测幂等 ✅ 三次集合一致 `[20,20,20]`；E2E-5 单条入库 ✅ 正文 1215 字；**E2E-1 频道解析 ❌** |
| 第一性原因（QM-5 ①） | PASS | 依赖库 `youtube_collector.py:141-180` 契约缺陷：① URL 解析**仅在 `startswith('http')` 时进入**，裸串被原样塞进 API 的 `channelId` → HTTP 400；② `@handle` 被降级为**关键词搜索**（`search_query=handle`、`channel_id=None`） |
| 逃逸分析（QM-5 ②） | PASS | 逃逸层级：① 依赖库单测未覆盖 URL 前缀与 handle 语义；② 本仓无该库的消费方（此前无人用博主维度），无下游测试可发现；③ 方案评审读的是实现源码，**但评审模型默认该分支「走的是正常解析」**，未把「静默降级」识别为缺陷——直到真实调用才暴露 |
| 修复 + 回归保护（QM-5 ④） | PASS | 方案已改为 **adapter 自行解析、不依赖库的 URL 分支**：裸串补 `https://` → `UC…` 直取 / `@handle` 走 `channels.list?forHandle=` / `/c/` `/user/` 走 `forUsername=` → 拿 canonical ID 后再调 collector。冒烟脚本输入改为完整 URL、后续步骤改用归一后的 canonical ID，**使该缺陷在门禁层可复现** |
| 防止再次发生（QM-5 ⑤） | PASS | ① PRD §6.2 新增「依赖库缺陷」小节，把契约矩阵与危害等级写死；② openspec 契约的 canonical ID Requirement 增加「adapter 自行解析、MUST NOT 直接把用户输入当 channelId 传给 collector」；③ 冒烟脚本成为实现前的强制门禁（`creator_p0_smoke.py`，E2E-1 即锁此行为） |
| 行尾与 diff 对账 | PASS | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致 |
| 接线棘轮 | N/A | 本 PR 未新增 `*.test.js`；行为由 `creator_p0_smoke.py`（真实外部 API 门禁）锁定 |
| QM-1 打包 / QM-4 视觉 | N/A | 未触碰 `apps/desktop/electron/` 或 `packages/rpa-engine/`（QM-1 触发范围）；无视觉面变更 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填，并删除上方三个 sync_* 字段与 ledger 登记项 |

### 危害定级：静默数据正确性事故（非可用性问题）

`@handle` 走关键词搜索后，返回的是**标题/描述含该词的任意视频**，其 `channel_id` 是**那些视频作者的频道**，合法且有值。系统读到的 `channel_id`「看起来正常」，日志仅有一行 warning，UI 无任何异常信号。

**后果：用户关注 A 博主，系统把 B 博主的内容当作 A 的作品推给他，全程无异常信号。**

实测证据：期望 `UC_x5XG1OV2P6uZZ5FSM9Ttw`（GoogleDevelopers），实得含 `UC-BsRijgl1O-H-sD4-Zw3UA`——另一频道。日志：`[YouTube] @handle 格式需要搜索: GoogleDevelopers`。

三条正确形态（`/channel/UC…`、`/c/…`、`/user/…`）均解析正确，**仅 `@handle` 一条出错**。

### 冒烟同时证实的能力（正面结论）

| 能力 | 实测 |
|---|---|
| 官方 Data API 链路 | ✅ `forHandle` / `forUsername` / `channels` / `playlistItems` 全部可用 |
| **字幕正文可用** | ✅ 1215 字，`transcript_source=subtitle` —— 这是此前最大的未知项，现已证实 |
| 探测幂等 | ✅ 三次结果集合完全一致 |

### 遗留（不假装已闭合）

- **E2E-1 仍红**：缺陷在**依赖库内部**，本仓无法直接修；缓解是 adapter 层自行解析（已验证可行），但**须在实现阶段以单测锁死**，否则回归风险高
- 未测：打包产物中该依赖是否可用（QM-1）、`viral_library` 实际入库、outbox 最终化、送入 AI 写作
- 冒烟使用真实 API Key（由用户在会话中提供，仅作进程环境变量传入，**未写入任何仓库文件、未进日志、未提交**）

### 零假设·零臆测（证据等级）

| 结论 | 证据等级 |
|---|---|
| 依赖库 @handle 降级为关键词搜索 | **直接代码证据** + **真实 API 实测复现** |
| 裸串不进 URL 解析分支 | **直接代码证据** + 真实 API 返回 HTTP 400 |
| 三条正确形态解析可用 | **真实 API 实测** |
| 字幕链路可用（1215 字） | **真实 API 实测** |
| Key 归属与限额 | 用量远低于 10,000 units/天上限；本 PR 未触及配额治理设计 |