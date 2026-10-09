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
- **变更构成**（`git log --oneline origin/main..HEAD`，2026-10-10 二次 rebase 到 `8ed4e52ee` 后实测）：
  - fix(publish): 快手图文封面 tofu 乱码修复（含 degraded 第三态回归用例先红后绿、PRD/CHANGELOG/gates/records/ledger 同提交）
  - fix(publish): 压缩 cover:generate-ai 注释至 1 行，解除逐文件行数门禁（publish.js 回落 497 行）
  - docs(records): 二次 rebase 消解对账（本节 + 下方 Rebase 消解证据段）

## Rebase 消解证据（2026-10-10）

- 本分支两次 rebase 至 origin/main（`2a330fc22` → `8ed4e52ee`）。最后一次仅 `01-docs/PRD.md` 冲突：我方新增附录与 #3224 的「locales 结构拆分」附录在同一位置（文件末尾）各自追加整节 ⇒ 按**并集**消解（两节整块都保留、中间补一个空行），`.quality-gates.md` / `CHANGELOG.md` / `scripts/gate-record-debt-ledger.json` 由 git 自动合并。
- **自动合并不构成通过证据**，逐文件按 `git diff --numstat origin/main HEAD` 对账：`.quality-gates.md` 17/0、`CHANGELOG.md` 14/0、`01-docs/PRD.md` 8/0、`scripts/gate-record-debt-ledger.json` 2/1（唯一一行删除是前一个键的尾逗号，非内容）。置顶型追加文件要求**删除数为 0**；另 grep 复核 main 已回填的证据行仍在（`已合并 #3217` 的 `远程同步 | PASS` 行完好），ledger 键集合按「main 的 8 键全在 + 仅新增本 PR 1 键」校验通过。
- 首轮曾用「删冲突标记行」的方式消解，实测把 main 的 `official-compute-stopgap` 记录从 `PASS` 退化回 `PENDING`（对账出现 2 行删除即为信号），已按上述口径重做。`--numstat` 与 `--ignore-cr-at-eol --numstat` 两口径逐文件相等，未改写行尾。
- rebase 后重跑：`verify-worktree-deps.js` OK；`electron/ipc-handlers/publish.test.js` + 消费者并集 `src/views/Publish.test.js` = **140 passed / 140**（2 文件）。`publish.js` 相对 rebase 前逐字节未变 ⇒ 既有 QM-1 打包证据（`electron-builder --win --dir` exit 0 + asar 内 `ai-generate-degraded-placeholder` 标记 + 隔离 userData 启动 8 秒无失败签名）沿用成立。

## 远程同步

| 项目 | 状态 |
|------|------|
| 远程同步 | PENDING |
