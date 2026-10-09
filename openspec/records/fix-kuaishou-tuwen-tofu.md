---
record: fix-kuaishou-tuwen-tofu
task: 快手图文封面 tofu 乱码修复（cover:generate-ai 拒绝 ffmpeg 占位图冒充 AI 封面，回退本地标题卡）
date: 2026-10-09
sync_reason: 记录含 `| 远程同步 | PENDING |` 行，待 PR 合并后由 docs PR 回填
sync_backfill_owner: fix-kuaishou-tuwen-tofu 会话（合并后回填远程同步行并删除本 frontmatter 三字段）
---

## 本次执行记录：快手图文封面 tofu 乱码修复（fix-kuaishou-tuwen-tofu，2026-10-09）

- **变更类型**：运行时代码 → 隔离 worktree `D:\Data\projects\mp-worktrees\mp-fix-kuaishou-tuwen-tofu`（裸分支 `fix-kuaishou-tuwen-tofu`），共享根保持 `main`。
- **本 PR 不是 docs-only**：含 `apps/desktop/electron/ipc-handlers/publish.js` 代码变更与回归测试。
- **根因链**：`usePublishFlow` 无图图文平台自动 `generateAiCover` → `cover:generate-ai` → `assetGenerator.generateImage` 未配置 provider 时返回 ffmpeg drawtext 占位图（`degraded:true`、Windows 无 CJK 字形）→ handler 只判 `code===0` 未检 `degraded` → tofu 图冒充「AI 封面」上传快手。
- **实锤证据**：`D:\Temp\story2video\assets\default\img_9400.png` 与用户截图形态逐像素吻合（深蓝 `0x1a1a2e` 底、中文全方块、仅「1」「20」可读）；`app-2026-10-06.log` `cover:generate-ai ok :: path=...img_9400.png 耗时=112ms`。
- **修复**：handler 对 `result.data.degraded === true` 判定为 AI 失败，走 `fallbackLocalCover('ai-generate-degraded-placeholder')` 本地标题卡兜底（sharp/Pango，CJK 正常）。
- **TDD**：新用例先红（Received: `img_9400.png`）后绿；`publish.test.js` 37/37；消费者并集 `Publish.test.js` 103/103。
- **QM-1**：worktree 内 `electron-builder --win --dir` exit 0；asar 含修复标记；打包应用隔离 userData 启动 8 秒存活、无 QM-1 失败签名。
- **QM-5 五步**：根因溯源（git blame：占位图 e1b46eba0、handler b414d35c5）→ 逃逸链（单测缺 degraded 第三态/集成无真实兜底分支/E2E 不校验字形/视觉不覆盖运行时生成图/审查跨模块字段无消费）→ 系统性漏洞（测试场景缺失 + 跨模块契约字段无人消费）→ 回归保护（degraded 第三态用例）→ 预防（CI 回归锁 + learnings 模式沉淀 + PRD §6）。
- **变更构成**（`git log --oneline origin/main..HEAD`，rebase 后如失效须在 docs 提交内重写）：
  - fix(publish): cover:generate-ai 拒绝 degraded 占位图，回退本地封面兜底
  - test(publish): degraded 占位图回归用例（先红后绿）
  - docs: PRD-KUAISHOU-TUWEN-TOFU-2026-10-09 + CHANGELOG + gates/records/ledger

## 远程同步

| 项目 | 状态 |
|------|------|
| 远程同步 | PENDING |
