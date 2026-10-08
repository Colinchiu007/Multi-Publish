---
sync_reason: 远程同步 PENDING——PR 开启中（分支 podcast-rss-channel）；合并后在状态列改写 PASS + merge SHA，并同一次提交删除 gate-record-debt-ledger.json 的登记项与本篇 frontmatter 三字段（回填与销账必须同一次发生）
sync_backfill_owner: agent（PR 自动合并后由回填 PR 收口）
---

# 执行记录：播客 RSS 频道发布（podcast-rss-channel，2026-10-09）

- **分支 / worktree**：裸分支 `podcast-rss-channel` @ `D:\Data\projects\mp-worktrees\mp-podcast-rss-channel`（非 C 盘）；共享根 `D:\Data\projects\mulpub` 保持 `main` 且未被写入。
- **变更分层**：运行时代码（`packages/shared-utils/`、`apps/desktop/electron/`、`apps/desktop/src/`、`packages/api-publish-engine/test/`）⇒ 走完整质量节拍，`classify-docs-only.js` 判定 false。
- **需求来源**：`01-docs/INVESTIGATE-XIAOYUZHOU-PODCAST-2026-10-09.md`（小宇宙无发布侧 API，仅消费侧 RSS 协议）→ `01-docs/PRD-PODCAST-RSS-CHANNEL-2026-10-09.md` → `docs/adr/0008-podcast-rss-is-protocol-channel-not-platform.md` → `openspec/changes/podcast-rss-channel/`（proposal / design / tasks / specs）。

## 提交构成（origin/main..HEAD，rebase 后 SHA）

| SHA | 内容 |
| --- | --- |
| `a84037211` | 共享层单一实现：`podcast-rss.js`（校验/构建/自检/判重 `EPISODE_DUPLICATE` / `PODCAST_FEED_INVALID` fail-closed 不写文件）+ `podcast-endpoints.{json,js,browser.js}` 目录与 CJS/ESM 孪生（parity 锁）+ 33 例回归 |
| `fa3a40984` | 形态 B 托管直传**规则层** `podcast-hosting-upload.js`：`validateHosting` 缺字段 fail-closed、`deriveObjectKey`（禁标题/禁路径穿越）、`objectPublicUrl`（禁拼出 `bucket.bucket`）、OSS V1 待签串结构断言、签名头返回值不含凭证、STS 形态 `uv` 形状、`putObject` 出站经注入 `httpClient`（测试零真实出站）+ 34 例 |
| `9bcc96cfb` | 主进程持久化与接线：`podcast-channel-service.js`（`{userData}/podcast/{channel.json,episodes.json,feed.xml}`、`PODCAST_FILES` 单点导出、临时文件 + 原子 rename、仅 `EPERM/EACCES/EBUSY` 有界退避、损坏即 `PODCAST_STORE_CORRUPT`）+ `ipc-handlers/podcast.js`（8 通道，**字面量**注册）+ `preload/podcast.js`（`electronAPI.podcast`，两个 bundle 已重生成） |
| `3ce5e24d2` | 渲染层：`PodcastChannelView.vue`（频道/单集/feed+分发端指引三区块）+ `usePodcastChannel.js` + 路由/侧栏/`useTabDocumentTitle` 注册 + zh/en **成对** locale |
| `b391fc86e` | ADR-0008 正交闸锁：`publishMode` 三态不回退、误配 `rss` 经 `normalizeMode` 抛 `/unknown publishMode/`、`platforms.yaml` 键集不含分发端 id；max-lines 基线随 locale 落盘更新（接受漂移，已披露） |
| docs 刀（本记录所在提交链尾） | PRD / 调研报告 / ADR-0008 / openspec 四件套入库并按三刀实况回填（§8.2 落盘位置、§8.3 composable、§8.5 正交闸 enforcement、§9.1 实现偏差表、P0/P1 状态行）；SHA 以 PR diff 与 squash merge SHA 为准 |
| 修复刀（QM-6 处置 + QG Static 红因修复，本记录后追加） | ① **Critical**：`buildItem` enclosure/guid 取址改为 `audioUrl` 优先，与 `resolveEnclosure` 同序（此前反向可让 http 地址经校验入 feed）；② `verifyFeed` 徽标 `ok` 改引擎语义 `issues.length===0`（不再沿用恒真的 IPC envelope.ok）；③ guid `trim` 后纯空白视同缺省（与判重口径一致，杜绝空 `<guid>`）；④ `ownerEmail` 公开提示落地（`podcast-owner-email-privacy-hint` + zh/en 成对键）；⑤ 保存失败 issues 区块逐条清单（`podcast-channel-save-issues`/`podcast-episode-save-issues`，成功即清空）；⑥ 渲染层 CJS 越界修复：新建窄面 ESM 孪生 `podcast-rss.browser.js` + vite alias + 裸 specifier import。回归锁：引擎 38 passed（含 2 条 QM-6 锁）、视图 30 passed（含 4 条 QM-6 锁）、契约 6 passed；每条修复均做变异反证后还原全绿。PRD §5.3/§6.3/§九.A/§9.1/§十/§11.1 已同步写入实况 |

## QM-1 打包证据（实跑，非推断）

`node scripts/verify-worktree-deps.js` → OK（11 项解析到当前 worktree）→ `pnpm run build:dir` rc=0（vite 29.78s；electron-builder 25.1.8，`--dir`）：

1. **asar 清单**：`podcast-channel-service.js` / `podcast-hosting-upload.js` / `ipc-handlers\podcast.js` / `preload\podcast.js` / shared-utils 四份 podcast 源全部在包内；`\dist\` 条目 1913 项（渲染层已入包，非空壳）。
2. **require 链**：解包到 `D:\Temp\app-asar-pod-*` 后，4 个非宿主模块逐个 `require` 成功；`ipc-handlers/podcast.js` 唯一失败为 `Cannot find module 'electron'`（离线 node 无宿主；所有 ipc-handlers 文件同态），相对 require 全部解析 → 无路径层级/文件遗漏类缺陷。
3. **启动验证**：`Multi-Publish.exe` 存活 12 秒并输出 `[NOTIFY] window main-window-shown`；stderr 无 `Failed to load platform config`、无 `ENOTDIR.*app.asar`、无 `PluginLoader.*mkdir failed`、无配置/插件路径指向 asar 内部。现场两类与本刀无关的既有噪声：`spawn python ENOENT`（本机 PATH 无 python）、`许可证权限不足`（未打包授权开发态）。
4. 取证文件：`D:\Temp\mp-pod-qm1b.txt`（打包）、`D:\Temp\mp-pod-stderr.txt`（启动 stderr）。
5. **修复刀后复跑（第二次实跑，当下结论以本节为准）**：`pnpm run build:dir` rc=0（vite 30.63s）；asar 清单含 `podcast-rss.browser.js`/`podcast-rss.js`/`podcast-endpoints.browser.js` 等全部播客件与 `dist\assets\PodcastChannelView-*`；解包 `D:\Temp\app-asar-pod-c` 后 `require(podcast-rss.js)` 成功（exports=30）且包内文件含修复行 `const url = ep.audioUrl || ep.resolvedAudioUrl`；渲染 bundle 含 `podcast-owner-email-privacy-hint`；`Multi-Publish.exe` 存活 12 秒、`[NOTIFY] window main-window-shown`，stderr 三类禁发噪声（platform config / ENOTDIR asar / PluginLoader mkdir）计数 0。取证 `D:\Temp\mp-pod-qm1c.txt`、`mp-pod-stdout-c.txt`、`mp-pod-stderr-c.txt`。

## 其余门禁

见 `.quality-gates.md` 顶部同名记录（TDD / 契约锁承重 / locale 成对 / max-lines / 未接线测试 / 品牌残留 / 行尾对账 / 文档同步 / QM-4 视觉 / QM-6 双模型 / 远程同步）。

## 已知未闭合（如实登记，不伪装完成）

- `headImpl` 的主进程 `net` 版 HEAD provider **未接**：缺省不注入即跳过 enclosure 可达检查（生产零真实出站，日志 `head=off`）。结构检查始终执行。接线属 F9 巡检刀。
- P1 直传**只有规则层**：托管配置落盘加密（credential-store）、`podcast:hosting:*` IPC、渲染层「本地文件 → 直传回填 `resolvedAudioUrl`」入口均未实现；`podcast-hosting-upload.js` 除自身测试外无消费者。
- QM-4 像素基线**尚未入库**（用例登记已闭合）：`podcast-channel` 已同时进 `viewTests` 与 `pixelTests`（route/waitFor 逐字一致），`.gitignore` 已放行浅色与暗色两张条目，本机 `visual-ci` + `visual-view-runner` 34 例通过。**基线只能取 CI artifact**（AGENTS QM-4 第 7 条），本机产物禁止入库，所以首次 `QG Visual` 对本条必然报 `ERR_VISUAL_BASELINE_MISSING`，须由那次 run 的 `quality-gate-visual-reports` 渲染回填并自证 0 px。风险已声明：侧栏新增条目会改变所有含侧栏视图的全页像素；若 `QG Visual` 变红，正解是按同一次 run 的 CI 渲染重建受影响基线，禁止提阈值。
- 代托管（P2 / 形态 C）未启动，三前置条件见 PRD §三。

## 远程同步

| 远程同步 | PENDING |
|--------|---------|
| PR | #3193（podcast-rss-channel → main，已开启） |
| 回填约定 | 合并后本行状态列改写 `PASS` + merge SHA（取证 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI`），并同一次提交删除 frontmatter 三字段与 `scripts/gate-record-debt-ledger.json` 的登记项（回填与销账必须同一次发生） |
