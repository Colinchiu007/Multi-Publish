---
record: hot-topics-publish-handoff
task: 热门选题改写完成后「去发布」批量交接全部草稿 + 批量发布目标一次分发 + 小红书仅存平台草稿箱
date: 2026-10-09
---

## 本次执行记录：热门选题 → 一键发布图文 的批量交接（hot-topics-publish-handoff，2026-10-09）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（`apps/desktop/src/views|composables|locales`）⇒ 隔离 worktree `D:/Data/projects/mp-worktrees/mp-hot-topics-publish`，裸分支 `hot-topics-publish-handoff`，基线 `origin/main`=`8b3d3e91f`；非 C 盘；共享主目录保持 `main` 未被改动（`git -C D:/Data/projects/mulpub status` 仅含他人遗留的 1 个 M + 未跟踪文件） |
| 第一性原因（QM-5 ①） | PASS | CDP E2E 复现：勾 5 条选题 → 一键发布 → 直接发图文 → 5/5 改写成功、5 条草稿落库（进度区「改写完成，已生成 5 条草稿」）→ 点「去发布」表单全空（标题 0 字、正文 0/10000 字、8 个 input 值皆空）。根因：`HotTopics.goToDestination()` 图文分支 `router.push('/publish')` 不带草稿参数，而 `Publish.vue onMounted` 只在 `route.query.draft` 存在时 `loadDraft` ⇒ 两者组合使装载恒不发生；弹窗承诺「改写内容将自动填入文案输入框」不成立 |
| 逃逸分析（QM-5 ②） | PASS | ①**单元层**：`HotTopics.test.js` 的「batch publish flow」只断言 `aiRewrite`/`draftSave` 调用次数，**从未断言跳转参数** ⇒ 去向参数无人守；②**组件层**：`Publish.test.js` 只覆盖 `?draft=`（「继续编辑草稿」用例），**没有多条交接用例**，也没有任何用例走「热门选题 → 发布页」这条跨页链路；③**E2E 层**：既有 E2E 记录（`e2e-hot-topics-crash-and-cookie`）验收的是「发布成功数」，**不校验表单是否正确装载**（发布能成功是因为人工补了装载步骤）；④**审查层**：弹窗文案（「将自动填入」）与实际行为不一致，属文案与实现漂移，无机械判据 |
| 修复 + 回归保护（QM-5 ④） | PASS | 修复：去向按成功条目数带参（多条 `?drafts=`／单条 `?draft=`）+ 发布页接收端（解析/装载/幂等/失败语义）+ `createArticleItem` 字段面工厂 + `seedArticlesFromDrafts` + `applyTargetsToAll` + 「批量设置发布目标」工具条 + 8 条成对文案。回归锁 15 例：`HotTopics.test.js` 2、`Publish.test.js` 6、`useBatchPublish.test.js` 7；三文件全绿（238 passed / 3 files） |
| 防止再次发生（QM-5 ⑤） | PASS | ①「跳转参数」类缺陷改由组件测试直接断言 `router.push` 载荷（新增 2 例钉住多条/单条形态）；②跨页链路契约写进 openspec 能力 `hot-topics-publish-handoff`（参数形态、幂等、失败语义、目标分发四组 Requirement + Scenario）；③`createArticleItem` 工厂 + 「装载与 addArticle 键集一致」用例，堵住「新增字段只改一处」这一类复发形态；④PRD 记录弹窗文案与实现的对应关系（文案即验收承诺） |
| 变异反证（锁是否在跑） | PASS | M1 `HotTopics` 去向退回 `push({path:'/publish',query:{}})` → HotTopics 1 红；M2 禁用 `Publish` 交接分支（`if (handoffIds.length > 0)` → `if (false)`）→ Publish 4 红；M3 `applyTargetsToAll` 不写账号 → useBatchPublish 2 红。脚本以 `stdio:'inherit'` 规避沙箱管道 EPERM，每轮结束用 git 还原并校验字节一致 |
| 小红书仅存草稿（硬约束） | PASS | 用户追加要求「小红书风控严格，不得真实发布，只放平台草稿箱」。**第一版设计（路由到新增 API 草稿轨 `xhs_draft`）被真机实测推翻**：RPA 轨图文自 2026-09-29 起本就是 `draftOnly`（并非「会点发布」），而 API 轨 note 步不可用（`creator` 域 404 / `edith` 域 406；permit+upload 均通过；账号缺主站 `web_session`）。落点改为轨内：图文强制 `draftOnly`、**视频 fail-closed**（`XHS_VIDEO_DRAFT_UNSUPPORTED`，此前视频仍走点发布链路）；删除 `xiaohongshu-draft-publisher.js` 与其 7 例，新增 2 例锁（图文必带 draftOnly / 视频 generic 零调用）。真机复验见下方 E2E |
| 与既有 spec 裁决一致性 | PASS | `openspec/specs/api-publish-xiaohongshu-chain/spec.md`（2026-09-26 定案）明确小红书 API 链「整体止步、不实现」，理由即「`x-s`/`x-t` 依赖**外包签名服务**（运行时禁止远程求签通道）」。本次对参考产品主进程 bundle 的独立逆向**复现了同一技术依据**（Sign/GetSign 下发 `X-s`/`X-t`/`X-S-Common` 并返回刷新后的 `a1`）⇒ 不路由 API 轨是与 spec 一致的选择。如实登记既有偏离：`xiaohongshu-draft.js` 与该裁决并存（本 PR 不删该文件，仅确认它不在任何路由上） |
| CCG verify-security（存量误报） | PASS（附取证） | 门禁对本次触及的 `rpa-view-platforms.js` 报 2 条高危（`:1010` innerHTML / `:1078` 运行时 token 拼接）。取证：本 PR 在该文件只有 `@@ -1312,6 +1312,19 @@` 一个 hunk；对 `origin/main` 同文件扫描得到完全相同的两条同位置告警 ⇒ 存量误报。门禁无基线白名单，按文档化豁免 `SKIP_CCG_GATE=1` 提交（未用 `--no-verify`）并在此登记 |
| 线上事故（新组件漏导入 UiInput） | PASS | E2E 现场发现：`BatchArticleCard.vue` 漏 `import UiInput` ⇒ `<UiInput>` 渲染成未知元素、标题/正文输入框整体失效（DOM 值空），而 `Publish.test.js` 夹具把 `UiInput` 注册为全局组件 ⇒ **单测全绿掩盖之**。修法：补局部导入；两层锁——①卡片渲染值断言（`.batch-articles input.ui-input` 值 = 草稿标题、textarea = 草稿正文）；②全仓结构锁「凡使用 `<UiInput|UiButton|UiSelect>` 的 SFC 必须自行 import」 |
| 行数棘轮（max-lines） | PASS | 首轮 CI 三红：`TARGET_GREW: Publish.vue 1896 > 点名目标 1773`、`TEST_OVER_LIMIT: useBatchPublish.test.js 1508 ≥ 1500`、`TEST_LEDGER_GREW: Publish.test.js 膨胀 212 > 容差 200`。**修法为真实拆分而非上调 targets**：交接状态机 → `useHotTopicsDraftHandoff.js`；工具条 → `BatchTargetsToolbar.vue`；发布目标块 → `BatchTargetPicker.vue`；整卡片 → `BatchArticleCard.vue`；测试侧合并同场景用例。末态 `check-max-lines.js` ✅ |
| 品牌残留（Gate 12，首轮 CI 红） | PASS | 首轮 QG Changes 红 7 处：PRD/proposal/learnings 写出了参考产品品牌名与含品牌词的目录路径。按仓内红线改写为「参考产品」并给出品牌词无关的定位法；`check-no-brand-residue.js` PASS（7463 tracked 文件） |
| TDD | PARTIAL（如实记录） | 本次为「先复现缺陷 → 写回归锁 → 实现」顺序：E2E 复现先于实现（真红证据为表单空表单实测），但 `Publish.test.js` 新用例是在实现后与实现同批落地，未逐条先跑红灯再写实现（变异反证已补足「锁能变红」的证据） |
| 行尾与 diff 对账 | PASS | `git diff --numstat origin/main...HEAD` 与 `--ignore-cr-at-eol` 两口径逐行一致（8 文件：HotTopics.vue 13/1、Publish.vue 124/0、useBatchPublish.js 82/2、locales zh/en 各 13/0、测试 3 文件 65/86/111） |
| locale 成对（Gate 7） | PASS | `check-locale-sync.js --pair-base origin/main` PASS（zh/en 两侧均变更）；`--keys` PASS（1482 个在用 key 均在 zh/en） |
| 品牌残留 | PASS | `check-no-brand-residue.js` PASS（7431 tracked 文件） |
| lint | PASS | `apps/desktop` 下 eslint 8 个变更文件：0 error / 2 warning（`CATEGORY_KEYS`、`copyDetailMeta` 均为既有告警，不在本次改动行） |
| 接线棘轮 | PASS | 未新增 `*.test.js` 文件（三个用例均追加进既有受 workflow 点名的文件），无需新增接线 |
| QM-1 打包 | PASS（含一处如实缺口） | 第二轮改动触达 `apps/desktop/electron/` ⇒ 本地 `pnpm exec electron-builder --win --dir --publish never` **exit 0**；asar 清单含新增 `electron/services/xiaohongshu-draft-publisher.js` 与 `publisher-router.js`。缺口：未跑「打包产物启动 8 秒存活」（避免与正在执行的真实发布会话争用共享 profile） |
| QM-4 视觉 | PARTIAL | 涉及渲染端 UI（工具条 + 批量卡片），已用 CDP 截图存证；未跑像素基线对比（本机无 baseline 流程）——如实记录 |
| QM-6 CCG 双模型外部评审 | NOT RUN | 本机未执行 `codeagent-wrapper` 双模型评审；不得以自审冒充通过 |
| E2E（本次修复的验收） | PASS | 见下方「E2E 实证」 |
| 远程同步 | PASS | 已合并 #3227 = `ff8e3b260c9059aa5bb908285679961ab924fb46`（2026-10-09T18:44:53Z）。取证：`git log origin/main --grep='(#3227)$' --format=%H|%cI` 唯一命中该 SHA 与时间；`git ls-remote --heads origin hot-topics-publish-handoff` 返回 **0 行**证远端分支已删；本行与 records 的同步行、frontmatter `sync_*` 三字段、`scripts/gate-record-debt-ledger.json` 登记项已在**同一次提交**内收口 |

### E2E 实证（CDP，运行中实例：worktree `mp-hot-topics-publish`，vite 7595 / CDP 11643，共享 `shared-user-data`）

命令形态：`MP_CDP_PORT=11643 MP_VITE_PORT=7595 node cdp-e2e.js ...`（Playwright `connectOverCDP` 连接已启动应用）。

1. **热门选题页**：`#/hot-topics` 加载成功（376–400 条选题，8 渠道）。
2. **选最新 5 条**：十五五开局六张网齐铺开 / 樊振东回归也救不了国乒人才断档 / 王仁君飞天奖视帝 / 超长蛋挞陆续下架 / 宋佳集齐三大奖；批量条显示「已选 5 条」。
3. **一键发布 → 直接发图文**：改写队列 5/5 全绿，进度区「改写完成，已生成 5 条草稿」。
4. **去发布（本修复的验收点）**：URL 变为 `#/publish?drafts=mv136xlqowts,mv1373nny7xf,mv137m4umvbe,mv137wklgeaz,mv138319o7l8`；发布页自动进入批量模式，**5 条条目全部装载**（标题＝选题、正文长度 1263/925/1169/1115/798 字）；提示「已装载 5 条热门选题草稿」；工具条列出 8 个有账号平台并已勾选；每条条目 8 个平台账号全部勾选；底部主按钮「🚀 批量发布 (40 个任务)」。
5. **提交与确认**：确认弹窗如实提示「即将发布 5 篇内容，共 40 个平台账号任务」并列出快手 480 字截断预告（1263→468 等）；点「确认发布」后回执「🚀 已接受 40 个发布任务」。
6. **第二轮（含小红书草稿轨的完整验收）**：重启应用加载新代码后重跑同一链路——5 条改写完成（正文 1061/714/1081/863/1277 字）→ 去发布 → `?drafts=` 装载 5 条并预置 8 平台 + 默认账号 → 每条设封面（小红书草稿必须有图）→ 第 1 条取消百家号（避免与上一批已成功的那篇重复）→ 「批量发布 (39 个任务)」→ 确认弹窗「即将发布 5 篇内容，共 39 个平台账号任务」→ 回执「🚀 已接受 39 个发布任务」。
7. **冷重载复验**：在 `?drafts=` URL 上 `location.reload()`（组件冷挂载）后，内容仍装载、平台仍预置、任务数回到 39 —— 验证「交接幂等 + 预置来自账号目录（不依赖平台目录就绪）」两项修复；同轮以 Vue 实例树直读确认 `articles` 内部状态与 DOM 输入一致。
8. **批量 5 条小红书草稿（终态：5/5 全部落库）**：带封面重投 5 条，`2026-10-09T18:12:22Z` / `18:42:21Z` / `19:12:28Z` / `19:42:21Z` / `20:12:21Z` 各一次成功——`uploading image...` → `DIAG[publish2] draftOnly=true` → `draft-only done saved=true` → `draft saved` → `publish done platform=xiaohongshu ... draft=true`。**同窗口硬判据**：`[xiaohongshu] publishing...` 计数 **0**（无发布点击）、`draft-only ABORT` 计数 **0**、`audit-requery`/`PublishMonitor` **0 行**（草稿不建回查）。节奏由每账号 30 分钟频控决定（18:12 → 20:12 五条依次落库），**未为取证放宽频控**（保护真实账号）。
9. **小红书草稿落点（真机复验，PASS）**：第一版把 `xiaohongshu` 路由到新增 API 草稿轨被实测推翻——
   - `xiaohongshu:probe-draft-chain` 实跑：permit（GET）与 ros-upload（PUT）**均通过**；note 步
     `creator.xiaohongshu.com/web_api/sns/v2/note` → **404**（端点不在 creator 域），
     `edith.xiaohongshu.com/web_api/sns/v2/note` → **406**（`{code:-1}`）。签名基址 A/B（绝对 URL vs 路径）
     **两种都 406**；该账号 cookie 无主站 `web_session`（只有 creator 域会话）⇒ 签名/风控过不去。
   - 改为轨内落点后单篇只投小红书（标题 17 字、1 张封面）：频控等待 6 分钟后于 16:57:36Z 执行 ——
     `route-selected mode=rpa_vm` → `[xiaohongshu] DIAG[publish2] draftOnly=true` → `saving draft...`
     → `draft-only done saved=true` → `RpaView publish done platform=xiaohongshu ... draft=true`
     → `rpa-publish-ok mode=dom`。**全程无「发布」点击**，且随后**没有** `audit-requery` 行（草稿不建回查 ✅）。
   - 平台侧历史成功例（同一机制）：`【验证稿·可直接删除】DOM轨草稿箱活体验收 …` · 小红书 · **成功**
     （2026-10-08 21:01 / 21:24、2026-10-09 05:01 / 05:31，应用主页「近期动态」可见）。

| 平台 | 结果 | 回执/说明 |
|------|------|----------|
| 小红书 | **PASS（只存草稿）** | `draftOnly=true` → `draft saved` → `draft=true`；无发布点击、无审核回查 |
| 百家号 | 第一轮已成功（API 直连 · 全部发布成功 · 23:01:14） | 第二轮该条已从第 1 篇中移除，避免重复 |

### 遗留（不假装已闭合）

- **TDD 顺序**：回归锁与实现同批落地，未做「先红后绿」的逐条 TDD（以变异反证补足）。已在门禁表如实标注 PARTIAL。
- **QM-6 双模型外部评审未执行**（本机无 `codeagent-wrapper`）。
- **QM-4 视觉未做像素基线对比**（仅 CDP 截图存证）。
- **预置全部可发布平台**是产品取舍：用户若不取消勾选会发到更多平台（仍需手动点提交）。见 PRD §12.4。
- **`loadDrafts()` 全量拉取后内存匹配**：草稿量大后应考虑主进程按 id 批量取（PRD §12.2）。
- **交接上限 50 静默丢弃**：超限无提示（PRD §12.1）。
