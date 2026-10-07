---
record: fix-publish-history-public-link
task: 发布记录「作品链接」必须落到平台公开内容页，不再是登录页（新增目的地语义判据 + 消除 platform-metrics 真源分裂）
date: 2026-10-07
---

## 本次执行记录：发布记录作品链接落到公开内容页（fix-publish-history-public-link，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | 运行时代码（`packages/shared-utils/`、`apps/desktop/src/`、`apps/desktop/electron/services/`）→ 隔离 worktree `D:\Data\projects\mp-worktrees\mp-fix-publish-history-public-link` + 裸分支 `fix-publish-history-public-link`，基线 `origin/main` = `01c58750`。`git worktree list` / `rev-parse --abbrev-ref HEAD` / `rev-parse --show-toplevel` 三项实证通过；共享根仍为 `main` 且他人 `01-docs/learnings.md` 改动保持 `M` 态未受影响 |
| 第一性原因（QM-5 ①） | ✅ | 三层，均有代码/配置取证：① 落库的 `result.url` 是 RPA webview 当前页（`rpa-view-platforms.js:790` `artifact.url \|\| result.url \|\| currentUrl`；`_publish_douyin:1005,1008` / `_publish_wechat_mp:1180` / `_publish_youtube:1259` / `_publish_zhihu:1400,1410,1417` 同为 `getURL()`），而 `config/platforms.yaml` 的 `publish_url` 多数即后台（`creator.xiaohongshu.com` / `mp.toutiao.com` / `member.bilibili.com` / `baijiahao.baidu.com/builder` / `cp.kuaishou.com` / `channels.weixin.qq.com`）；② `publisher-router.js:80-91` 的 `sanitizePublishResultUrl` 只脱敏不判目的地；③ `PublishHistory.vue` 唯一判据是 `safeHttpUrl`（协议），把「协议合法的登录墙 URL」当作品链接渲染，而应用内标签与系统浏览器都不带平台 Cookie ⇒ 平台重定向到登录页 |
| 逃逸分析（QM-5 ②） | ✅ | 单元：`PublishHistory.test.js:794-900` 14 例的负例**全是协议类**（`javascript:`/缺协议/协议相对/非字符串），正例用 `https://www.zhihu.com/question/123456`（**问题页**不是内容页）——缺口正是本 Bug；`platform-metrics/` **无任何测试文件**。集成：只验 `createTab` 被调、参数原样透传。E2E/视觉：跳转目标是外部站点，自动化断言不了落地页。评审：`PRD-…-CARD-OPEN-LINK` §2.2 把「不改详情弹窗」列为非目标、§6 只规定 `safeHttpUrl` 非 null 即产出可点行为，**评审范围本身排除了目的地正确性**。规范层：全仓只有协议判据，无「目的地语义」这一层概念 |
| 修复 + 回归保护（QM-5 ④） | ✅ | 新增 `packages/shared-utils/src/published-content-url.js` + `.browser.js`（ESM 孪生，`source`+`flags` parity 拦截）；渲染端卡片/详情锚点/可点性**全部**走同一 `publicLinkHref` 出口（杜绝「显示 A 打开 B」）；`platform-metrics` 四个 parser 委托共享解析器（对既有四平台逐字 no-op，M1-M4 锁死）。测试：`published-content-url.test.js` 91 例（15 平台 × 四输入 + 边界 + parity）、`platform-metrics/index.test.js` 26 例（**补齐该目录完全缺失的覆盖**）、`PublishHistory.test.js` 新增 V2-V8/V11/V12 共 8 例（首次以「合法 http 的后台页 URL」为输入） |
| 防止再次发生（QM-5 ⑤） | ✅ | ① 目的地判据成为**单一真源**（渲染端 + 指标回采端共用），并新增 `platform-metrics` 的测试文件消除「正确实现未被复用」的漂移面；② `href-scheme-contract.test.js` 的两条既有锁（`:href` 必须字面被 `safeHttpUrl` 包裹、`v-if` 与 `:href` 必须取同一判据表达式）保持通过并顺带加固本变更的 sink；③ `PRD-HREF-SCHEME-GUARD` 增补三层判据分层补丁，协议判据与目的地判据的分工从此有文档锚点；④ CHANGELOG 完整记录三层根因、逃逸链与变异反证 |
| 行尾与 diff 对账 | ✅ | `git diff --numstat` 与 `git diff --ignore-cr-at-eol --numstat` 两口径一致（见下方「行尾对账」小节实测） |
| 接线棘轮 | ✅ | 新增两个 `*.test.js` 均在既有 vitest include 覆盖内：`packages/shared-utils/src/__tests__/*.test.js`（包内 `vitest run`）、`electron/services/**/*.test.{js,ts}`（`apps/desktop/vitest.config.js` include 已含该 glob）。实测均被 runner 收集并执行（91 / 26 例） |
| 渲染层 CJS 边界（`QG Static` Gate 2c） | ✅ | 首轮 CI 红：`[renderer-cjs-boundary] FAIL：渲染层有 1 处未登记的 CommonJS 跨边界导入`。**成因**：渲染层写的是 `import … from '@multi-publish/shared-utils/src/published-content-url.browser'`（带 `.browser` 后缀）。**修法**：① `apps/desktop/vite.config.js` 的 `resolve.alias` 登记不带后缀的模块名 → `.browser.js`（alias 登记 7 项）；② 导入侧去掉 `.browser` 后缀，与 `safe-http-url` / `publish-audit-status` 既有约定一致。复跑 `check-renderer-cjs-boundary.js` rc=0（扫 295 个渲染层文件），其变异反证 `check-renderer-cjs-boundary.test.js` 3/3 绿 |
| 逐文件行数门禁 | ✅ | 首轮 CI 红：`LEDGER_GREW: apps/desktop/src/views/PublishHistory.vue 较登记值 1205 膨胀 253 行（容差 200）`。**处置选拆分而非 `--update` 抬高基线**——判据与打开通道抽成 `apps/desktop/src/composables/usePublishHistoryContentLink.js`，视图 1457 → 1363 行（增长 158 < 200），门禁复跑 rc=0。附带修掉两处：`OPEN_SITES_GUARDED_IN_MAIN` 仍指旧文件（契约测试「登记表里的站点必须真的还存在」立刻报红）；`window.open` 扫描域原本只扫 `.vue`，代码搬进 `.js` 后会**静默退出扫描域**（既不用登记也不被看见），已把扫描域扩到 `.vue` + `src` 下非测试 `.js` |
| QM-1 打包 | N/A | 未触碰 `apps/desktop/electron/` 下的**构建产物**路径与 `packages/rpa-engine/`；`node scripts/verify-worktree-deps.js` 通过（11 个 workspace 消费方全部指向本 worktree） |
| QM-4 视觉 | ⚠️ 见遗留 | 本变更改详情弹窗「作品链接」行渲染形态（单锚点 → 三态）。`test:visual:pixel` 需 dev server 与基线，本机未执行；**未刷新任何基线** |
| 品牌残留 | ✅ | `node scripts/check-no-brand-residue.js` → PASS（扫描 7127 tracked 文件） |
| locale 成对（Gate 7） | ✅ | `check-locale-sync.js --keys` → PASS（446 个使用中 key 均存在于 zh/en）；`--cjk` → PASS（基线 1489 条，当前 1331 条，无新增硬编码） |
| CHANGELOG 两门禁 | ✅ | 按 CI 差分口径：`--base=origin/main --head=HEAD` → 冗余份数 828 → 828、本 PR 新增副本=0；growth → PASS。**注**：`main` 上以绝对口径跑 `check-changelog-duplicate-entries.js` 亦为 rc=1 / 828 份重复（既有基线污染），本 PR 未使其变多，也未做越界去重 |
| 变异反证 | ✅ | 把内容页白名单退化为「`safeHttpUrl` 通过即算内容页」（精确复刻旧判据）→ `published-content-url.test.js` 69 例转红、`PublishHistory.test.js` 的 V2/V3/V4/V5/V6/V11 精确转红（V11 报出 `expected 'https://creator.xiaohongshu.com/publish/publish' to be 'https://www.xiaohongshu.com/explore/6530a1b2c3d4e5f600112233'`，正是本 Bug）。还原后 `isPublicContentUrl` 两端函数体逐字 `IDENTICAL`、203 例全绿。**第一次尝试的变异只改「协议非法」分支，desktop 侧 96 例全绿——是个恒不触发的假变异，已作废重做** |
| QM-6 CCG 双模型外部评审 | 未执行 | 本机无 `codeagent-wrapper`，如实记「未执行」，不以自审冒充通过 |
| 远程同步 | PASS | 已合并 #3057 = `23822b73fecc6c8f8e6710c1dc7911e02ea4e1fc`，committer 2026-10-07T17:32:25+08:00。取证：GitHub `mergeCommit` 与远端一致，`git log origin/main --grep="(#3057)" --format="%H %cI"` 双源一致，`git ls-remote --heads origin fix-publish-history-public-link` 返回 **0 行**（远端分支已删） |

### 门禁实测明细（本机，2026-10-07）

| 命令 | 结果 |
| --- | --- |
| `packages/shared-utils` → `vitest run src/__tests__/published-content-url.test.js` | 91 passed |
| `apps/desktop` → `vitest run src/views/PublishHistory.test.js src/href-scheme-contract.test.js electron/services/platform-metrics/index.test.js` | 112 passed |
| `apps/desktop` → `vitest run`（全量） | 见下方「全量回归」小节 |
| `node .github/scripts/check-locale-sync.js --keys` / `--cjk` | PASS / PASS |
| `node scripts/check-no-brand-residue.js` | PASS |
| `node scripts/check-changelog-duplicate-entries.js --base=origin/main --head=HEAD` | OK（本 PR 新增副本=0） |
| `node scripts/check-changelog-growth.js --base=origin/main --head=HEAD` | PASS |

### 行尾对账

- `git diff --numstat` 与 `git diff --ignore-cr-at-eol --numstat` 两口径一致，无 CRLF/LF 混用引入。

### 遗留（不假装已闭合）

- **QM-4 视觉未跑**：详情弹窗「作品链接」行由单锚点改为三态（新增 `detail-link-hint` / `detail-link-loginwall-hint` / `detail-link-absent` 三个 testid 与两行提示文案）。若 PR 合入前像素基线在该视图失配，**只更新该视图基线**，不得整体刷新。
- **QM-6 未执行**：本机无 `codeagent-wrapper`。
- **结构性不可派生的 7 个平台**（微信公众号、视频号、微博、TikTok、Twitter、Instagram、Facebook）本次**明确不给链接**。这是如实降级而非遗漏；后续若某平台能从发布结果取到第二成分（如公众号的 `__biz`），只需在 `PUBLIC_CONTENT_URL_RULES` 增一条规则，无需改视图。
- **`main` 上 CHANGELOG 828 份重复副本**属既有污染，本 PR 未触碰；按 `quality-gate.yml:173-180` 的注释，清理由配套改 growth 口径的另案处理。
- **`max-lines` 账本对 `PublishHistory.vue` 的登记值已陈旧**：登记 1205，而 main 实际已是 1379 行。本 PR 通过拆分把该文件压到 1363 行（增长 158 < 200）从而合规，**未改账本**（改账本等于把一个 1363 行文件的基线抬到 1457）。陈旧成因是该门禁按 **diff 作用域**检查：不被 PR 触碰的文件，其基线漂移永远不会被发现。这条口径问题需配套改门禁的另案处理。
- **`zhihu` 派生模板沿用 `https://zhihu.com/p/{id}`**（无 `www.`），与 `platform-metrics` 既有输出逐字一致以保证 no-op；两种形式均可解析。
- **小红书笔记 ID 形态闸门为 `^[0-9a-f]{16,32}$`**：十进制数字本身即合法 hex，该正则**无法也不该**区分二者。已锁的可判定不变量是「含非 hex 字符 ⇒ 拒绝」与「长度不足 ⇒ 拒绝」。若日后确认笔记 ID 恒为 24 位，可收紧为 `{24}`。
