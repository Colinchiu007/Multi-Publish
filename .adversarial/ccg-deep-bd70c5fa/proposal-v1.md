# 变更提案（自动生成，待对抗评审）

- base: `origin/main`
- head: `bd70c5fa8e156c5e3dcabe32148e61c6185e946e`
- 采集模式: `diff`
- 变更规模: 253 行

## 变更内容

```diff
diff --git a/.quality-gates.md b/.quality-gates.md
index b8040be82..9e3448760 100644
--- a/.quality-gates.md
+++ b/.quality-gates.md
@@ -9544,3 +9544,14 @@ finding 2/3 则指出我的两处"修复"**没有真正生效**。这三条都
 - QM-6 CCG：双家族已执行（proposer=opencode + critic=claude，跨家族校验通过，PowerShell 统一入口），评审出口为自扮演裁决档（stall/maxRounds，置信权重 0.6），4 条发现（1 Critical + 3 Warning）逐条裁决回填 `.adversarial/ccg-deep-8c68453e/adjudication.json`：i1 文档重复 upheld 已修（§8/§9 去重 671→471 行）、i2 本声明时序 upheld 已改写为如实措辞、i3 台账陈旧登记重录 dismissed（门禁 rc=1 指令的合规动作）、i4 泛化类名 upheld 已补作用域契约注释
 - 行尾对账 ✅（numstat 两口径一致）| 品牌残留 ✅ PASS | 文档同步 ✅（研究方案 v1.5/v1.6）
 - **远程同步 PASS** | PR #3207 已 squash 合并，merge SHA `15fd49c0d57bfb3696b3e17fa669ed097f221824`（2026-10-09T15:24:36+08:00），取证 `git log origin/main --grep='(#3207)$' --format=%H|%cI` 唯一命中；`git ls-remote --heads origin ue-p4d-contrast-fix` 返回 0 行，证远端分支已删；台账登记项已在本次回填提交删除
+
+## 本次执行记录：P4E 深色可读性第四批收官（docs-ue-p4e-contrast-fix，2026-10-09）【混合 PR】
+
+- 变更类型：**混合 PR**（ep-theme.css 三槽桥接 + cohere coral 暗色 + tokens.css soft 四槽/视图级集中区 + Accounts/HomeGreeting/Dashboard 组件 dark 块 + 基线 0 + 文档 v1.6b）→ 完整质量节拍，隔离 worktree `mp-ue-p4e-contrast-fix` 执行
+- **低对比样本 19→0 清零**（P4 系列 61→0 收官）：三个系统性缺口均属 ep-theme.css 桥接层「只映射主色档、漏派生档」——light-9（el-message 底 2.49:1）/ popper-bg-light（下拉面板纯白 2.48:1）/ fill-color-blank（表单收起态纯白 2.07:1）
+- 修复实测：el-message 4 视图清零（danger #f87171 vs 新 soft #3a1d1d = 5.53:1）；coral 白字 3 处清零（#c2410c 5.18:1）；Accounts 8 处清零；HomeGreeting 1.14→14.21:1；Dashboard 1.09→修为 #a5a0ff
+- 行数门禁：Publish(1773)/Accounts(1578)/PublishHistory(1394) 三文件登记零容差，dark 规则全部迁 tokens.css 视图级集中区（P4D 模式第三次复用），check-max-lines rc=0
+- TDD：styles 契约 + PublishHistory.test + accounts-compile.test **123 passed | 1 skipped**；contrast-audit 无退化 exit=0，基线登记 0
+- QM-6 CCG：PENDING（提交后补跑双家族，结果回填）
+- 行尾对账 ✅ | 品牌残留 ✅ | 文档同步 ✅（研究方案 v1.6b）
+| 远程同步 | PENDING | 合并后本行就地改写 PASS + merge SHA，同一次提交删台账登记项 |
diff --git "a/01-docs/UX-\345\211\215\347\253\257\344\272\244\344\272\222\344\270\216\347\224\250\346\210\267\344\275\223\346\243\200\347\240\224\347\251\266\346\226\271\346\241\210-2026-10-07.md" "b/01-docs/UX-\345\211\215\347\253\257\344\272\244\344\272\222\344\270\216\347\224\250\346\210\267\344\275\223\346\243\200\347\240\224\347\251\266\346\226\271\346\241\210-2026-10-07.md"
index 50f1b773e..3d4a3984d 100644
--- "a/01-docs/UX-\345\211\215\347\253\257\344\272\244\344\272\222\344\270\216\347\224\250\346\210\267\344\275\223\346\243\200\347\240\224\347\251\266\346\226\271\346\241\210-2026-10-07.md"
+++ "b/01-docs/UX-\345\211\215\347\253\257\344\272\244\344\272\222\344\270\216\347\224\250\346\210\267\344\275\223\346\243\200\347\240\224\347\251\266\346\226\271\346\241\210-2026-10-07.md"
@@ -401,6 +401,7 @@ git grep -n "beforeEach|beforeResolve" -- 'apps/desktop/src' ':!*test*'
 | v1.4 | **P4C 第二批回填**：共性模式修复——--color-primary 暗色缺失（.page-title 9 视图命中）+ ProfileMenu 徽章硬编码（9 视图，含 scoped 不生效与父按钮白底两个实测发现）+ desktop-ui-consistency「主色不覆盖」合同用实测数据修订；低对比 60→**36**；低对比样本新增 badge-probe 亮暗双态探针 ||
 | v1.5 | **P4D 第三批回填**：两处共享模式——ProfileMenu 未登录态「登录」标题硬编码（18 视图各 1 处同源，.mp-profile-copy strong #4d4f6f）+ PublishHistory 单视图 20 处（history-tab muted 档 / secondary-action #4f505a / 表格文字）；低对比 36→**19**（-47%），六视图清零；残留归属：EP 原生控件另案、el-message 噪声登记 |
 | v1.6 | **P4D 级联落败实证与修正**：规则从组件迁 tokens.css 后审计退化 19→35（tokens 经 main.js 最先注入，同特异性规则被后注入的组件 scoped 样式按序反超；历史「规则不进 CSSOM」为探针路径误诊——`/src/styles/*` 落进 SPA fallback 返回 HTML，真实模块路径是 `/styles/*`）。修正：全部 dark 覆盖加 `html` 前缀抬特异性（(0,2,1) 压过 (0,2,0)），实测回归 **19** 且无退化（exit=0）。PublishHistory dark 块迁出组件（净零行 1394），解决行数门禁 TARGET_GREW。审计误诊方法论教训记入 8.2 节 ||
+| v1.6b | **P4E 第四批收官（19→0）**：低对比样本**全部清零**。三个系统性缺口（EP 变量桥接缺失）：① `--el-color-*-light-9` 未映射 → el-message 弹层暗色下仍是亮奶油底 2.49:1（4 视图）；② `--el-popper-bg-color-light` / `--el-fill-color-blank` 未映射 → 下拉面板/表单收起态暗色纯白底（accounts option 2.48、hot-topics 渠道 2.07）；③ 暗色 `--coral #ff8866` 压白字 2.34:1 → 改深橙 #c2410c（5.18:1，publish/calendar/dashboard 3 处）。组件级 dark 块：Accounts 工具条+平台过滤 8 条、HomeGreeting 问候、Dashboard 章节标题。Publish/Accounts dark 规则因行数零容差迁 tokens.css 集中区（同 P4D 模式）。实测 0 且无退化（exit=0），styles+history+accounts 测试 123 passed | 1 skipped ||
 
 ## 8. Wave 0.4 执行记录（2026-10-07）
 
diff --git a/apps/desktop/src/components/HomeGreeting.vue b/apps/desktop/src/components/HomeGreeting.vue
index cee584ae1..2b2ad31ee 100644
--- a/apps/desktop/src/components/HomeGreeting.vue
+++ b/apps/desktop/src/components/HomeGreeting.vue
@@ -87,3 +87,12 @@ async function handleLoginClick() {
   outline: none;
 }
 </style>
+
+<style>
+/* 深色模式覆盖（P4E 2026-10-09，全局块）：问候语 #25252b 硬编码深灰，
+ * 暗色画布 #1a1a1e 上 1.14:1 几乎不可见（contrast-audit home 1 处命中）。
+ * 副标题 #8b8e9a 同理。必须放非 scoped（data-theme 挂 <html>，P4C 实证），
+ * html 前缀抬特异性（P4D 实证）。 */
+html[data-theme='dark'] .home-greeting h2 { color: var(--color-text-primary); }
+html[data-theme='dark'] .home-greeting p { color: var(--color-text-secondary); }
+</style>
diff --git a/apps/desktop/src/styles/cohere-design-system.css b/apps/desktop/src/styles/cohere-design-system.css
index 97291738a..82735c908 100755
--- a/apps/desktop/src/styles/cohere-design-system.css
+++ b/apps/desktop/src/styles/cohere-design-system.css
@@ -1563,7 +1563,7 @@ body {
   --body-muted: #9999a0;
   --action-blue: var(--color-primary-dark-tint);
   --focus-blue: var(--color-primary-dark-tint);
-  --coral: #ff8866;
+  --coral: #c2410c;
   --coral-soft: #4a2018;
   --form-focus: #b878c8;
   --on-primary: #1a1a1e;
diff --git a/apps/desktop/src/styles/ep-theme.css b/apps/desktop/src/styles/ep-theme.css
index 193278e87..85d7c45ef 100644
--- a/apps/desktop/src/styles/ep-theme.css
+++ b/apps/desktop/src/styles/ep-theme.css
@@ -22,6 +22,26 @@
   --el-color-danger: var(--color-danger);
   --el-color-error: var(--color-danger);
   --el-color-info: var(--color-text-secondary);
+  /* 语义色 light-9 浅底桥接（P4E 2026-10-09）：el-message/el-alert 的底色读
+   * --el-color-{error,danger,warning,success}-light-9，此前未映射 → 暗色下
+   * 弹层仍是 EP 默认亮奶油底（#fef0f0 系），配 tokens 提亮字 2.49:1。
+   * 亮色指向 --color-*-soft（值与 EP 默认一致，零亮色回归）；
+   * 暗色由 tokens.css [data-theme=dark] 的同槽覆盖接管（同色相深底）。 */
+  --el-color-error-light-9: var(--color-danger-soft);
+  --el-color-danger-light-9: var(--color-danger-soft);
+  --el-color-warning-light-9: var(--color-warning-soft);
+  --el-color-success-light-9: var(--color-success-soft);
+  --el-color-info-light-9: var(--color-info-soft);
+  /* 弹层（popper）底色桥接（P4E 2026-10-09）：el-select-dropdown 等弹层挂
+   * body，底色读 --el-popper-bg-color-light（EP 默认 #fff），此前未映射 →
+   * 暗色下 accounts/hot-topics 下拉仍是纯白面板（option 2.48:1 命中）。
+   * 亮色指向 --color-bg-card（= #fff 同值，零亮色回归）；暗色跟随深面板。 */
+  --el-popper-bg-color-light: var(--color-bg-card);
+  /* 表单控件底色桥接（P4E 2026-10-09）：--el-fill-color-blank 是 el-input/
+   * el-select 收起态等 55 个消费点的底色（EP 默认 #fff），此前未映射 →
+   * 暗色下 hot-topics 渠道选择器仍是纯白底（2.07:1 命中）。
+   * 亮色 = #fff 同值零回归；暗色跟随 bg-card 深面板。 */
+  --el-fill-color-blank: var(--color-bg-card);
 
   /* 文本色桥接 */
   --el-text-color-primary: var(--color-text-primary);
diff --git a/apps/desktop/src/styles/tokens.css b/apps/desktop/src/styles/tokens.css
index 7927011aa..43873c22e 100644
--- a/apps/desktop/src/styles/tokens.css
+++ b/apps/desktop/src/styles/tokens.css
@@ -294,6 +294,16 @@
   --color-success: #4ade80;
   --color-warning: #fbbf24;
 
+  /* 语义色 soft 暗色覆盖（P4E 2026-10-09）：--color-*-soft 四个浅底 token
+   * 此前只有亮色定义，暗色下 Element Plus 弹层（el-message 等）读它们当底色，
+   * 亮奶油底 #fef0f0 配暗色提亮字 #f87171 实测 2.49:1（4 个视图命中）。
+   * 修复：soft 底改同色相深色变体，文字档（--color-danger 等）不动 ——
+   * 亮字 #f87171 在 #3a1d1d 上 4.6:1 达标。 */
+  --color-danger-soft: #3a1d1d;
+  --color-success-soft: #14301f;
+  --color-warning-soft: #33240c;
+  --color-info-soft: #14232e;
+
   /* 品牌主色暗色覆盖（P4C 2026-10-09）：--color-primary 原先只在亮色区定义，
    * 暗色下回退亮色 #5048E5 —— 在暗色画布 #1a1a1e 上 2.81:1，命中 9 个视图的
    * .page-title（cohere-page-header 的 color: var(--primary)）。
@@ -309,7 +319,14 @@
  * 故全部规则加 html 前缀抬特异性（(0,2,1)/(0,3,1) 压过 scoped 的 (0,2,0)/(0,3,0)）。
  * 作用域契约（CCG i4）：history-tab/secondary-action/toolbar-button/icon-action
  * 四个类名为 PublishHistory 独占（2026-10-09 全 src 检索证实，各 1 文件）；
- * 其他视图复用同名 class 前必须改名或加前缀，否则暗色会被本区意外染色。 */
+ * 其他视图复用同名 class 前必须改名或加前缀，否则暗色会被本区意外染色。
+ * P4E 追加：history-filters select（PublishHistory 页原生下拉收起态，
+ * #4f505a 硬编码在暗底 2.08:1；PublishHistory 登记 1394 行零容差，无法组件内加行）；
+ * media-upload-trigger（Publish 页选择图片按钮，#4d5574 在暗卡底 2.13:1；
+ * Publish 登记 1773 行零容差，同理迁出）；
+ * account-* / platform-filter-* / page-button / filter-tabs（Accounts 页 5+3 处：
+ * 工具条下拉/视图切换/过滤页签/次级按钮/平台过滤面板的硬编码亮色在暗底 1.91-2.95:1；
+ * Accounts 登记 1578 行零容差，同理迁出）。 */
 html[data-theme='dark'] .history-tab { color: var(--color-text-secondary); }
 html[data-theme='dark'] .history-tab.active { color: var(--color-text-primary); }
 html[data-theme='dark'] .secondary-action,
@@ -321,3 +338,15 @@ html[data-theme='dark'] .profile-license-pro { background: rgba(251, 191, 36, .1
 html[data-theme='dark'] .profile-license-trial { background: rgba(56, 189, 248, .16); color: #7dd3fc; }
 html[data-theme='dark'] .mp-profile { background: rgba(35, 35, 41, .72); border-color: #3d3d46; }
 html[data-theme='dark'] .mp-profile:hover { background: rgba(44, 44, 52, .9); }
+html[data-theme='dark'] .history-filters select { color: var(--color-text-secondary); }
+html[data-theme='dark'] .media-upload-trigger { border-color: var(--color-border); color: var(--color-text-secondary); }
+html[data-theme='dark'] .account-toolbar-selects select { background: var(--color-bg-inset); border-color: var(--color-border); color: var(--color-text-secondary); }
+html[data-theme='dark'] .account-view-toggle { background: var(--color-bg-inset); border-color: var(--color-border); }
+html[data-theme='dark'] .account-view-toggle button { color: var(--color-text-secondary); }
+html[data-theme='dark'] .account-view-toggle button[aria-pressed="true"] { color: var(--color-sidebar-accent); }
+html[data-theme='dark'] .filter-tabs button { color: var(--color-text-secondary); }
+html[data-theme='dark'] .filter-tabs button.active { color: var(--color-sidebar-accent); }
+html[data-theme='dark'] .page-button { color: var(--color-text-secondary); }
+html[data-theme='dark'] .platform-filter-panel button.active { background: rgba(139, 133, 255, .18); color: var(--color-sidebar-accent); }
+html[data-theme='dark'] .platform-filter-icon { background: var(--color-bg-inset); color: var(--color-sidebar-accent); }
+html[data-theme='dark'] .platform-filter-panel button strong { color: var(--color-text-secondary); }
diff --git a/apps/desktop/src/views/Dashboard.vue b/apps/desktop/src/views/Dashboard.vue
index 2ae825146..e44c110ff 100755
--- a/apps/desktop/src/views/Dashboard.vue
+++ b/apps/desktop/src/views/Dashboard.vue
@@ -384,6 +384,15 @@ onMounted(() => { loadCached(); loadStats(); loadRecent() })
   box-shadow: none;
 }
 
+/* 深色模式覆盖（P4E 2026-10-09）：--deep-purple #1e1b4b 在 :global(:root)
+ * 只定义了亮色值，暗色画布 #1a1a1e 上章节标题 1.09:1 不可读（contrast-audit
+ * dashboard 1 处命中）。改用暗色提亮变体（同紫色相）。
+ * 注意：--deep-purple 声明在 :global(:root)，若在此重声明变量需同作用域；
+ * 直接覆盖消费元素颜色更稳（scoped 内对组件元素生效，不受注入顺序反超）。 */
+[data-theme='dark'] .dash-section-header {
+  color: #a5a0ff;
+}
+
 .stat-card::before {
   content: '';
   position: absolute;
diff --git a/apps/desktop/tests/visual-testing/reports/contrast-audit-baseline.json b/apps/desktop/tests/visual-testing/reports/contrast-audit-baseline.json
index bd1afcd60..c121da5a7 100644
--- a/apps/desktop/tests/visual-testing/reports/contrast-audit-baseline.json
+++ b/apps/desktop/tests/visual-testing/reports/contrast-audit-baseline.json
@@ -1,21 +1,21 @@
 {
   "minRatio": 3,
   "counts": {
-    "home": 1,
-    "accounts": 5,
-    "publish": 2,
-    "publish-history": 1,
-    "create": 2,
-    "model-providers": 1,
-    "first-run": 1,
-    "dashboard": 2,
-    "calendar": 1,
+    "home": 0,
+    "accounts": 0,
+    "publish": 0,
+    "publish-history": 0,
+    "create": 0,
+    "model-providers": 0,
+    "first-run": 0,
+    "dashboard": 0,
+    "calendar": 0,
     "cloud-publish": 0,
     "viral-analysis": 0,
     "intelligence": 0,
     "collection": 0,
-    "hot-topics": 2,
-    "copy-library": 1,
+    "hot-topics": 0,
+    "copy-library": 0,
     "keywords": 0,
     "comments": 0,
     "member-center": 0
diff --git a/openspec/records/docs-ue-p4e-contrast-fix.md b/openspec/records/docs-ue-p4e-contrast-fix.md
new file mode 100644
index 000000000..be601f620
--- /dev/null
+++ b/openspec/records/docs-ue-p4e-contrast-fix.md
@@ -0,0 +1,30 @@
+---
+record: docs-ue-p4e-contrast-fix
+task: P4E 深色可读性第四批收官——低对比 19→0 清零：EP light-9/popper/fill-blank 三槽桥接 + coral 暗色深橙 + Accounts/HomeGreeting/Dashboard 组件 dark 块
+date: 2026-10-09
+sync_status: PENDING
+sync_reason: PR 尚未合并，merge SHA 待合并后取证
+sync_backfill_owner: 本会话（ue-p4e-contrast-fix 作者）
+---
+
+## 本次执行记录：P4E 深色可读性第四批收官（docs-ue-p4e-contrast-fix，2026-10-09）
+
+| 门禁 | 状态 | Fresh 证据 |
+|------|------|-----------|
+| 变更类型与隔离 | PASS | 运行时代码（CSS/文档/基线）经隔离 worktree `D:/Data/projects/mp-worktrees/mp-ue-p4e-contrast-fix`、裸分支 `ue-p4e-contrast-fix` 修改；共享主目录保持 main |
+| 第一性原因（QM-5 ①） | PASS | 19 处残留按 fg/bg 对归组为 4 个模式：①EP `--el-color-*-light-9` 未映射（el-message 亮奶油底 2.49:1，4 视图）；②`--el-popper-bg-color-light`/`--el-fill-color-blank` 未映射（下拉面板/表单收起态暗色纯白底，2.07-2.48:1）；③暗色 `--coral #ff8866` 压白字 2.34:1；④组件级硬编码亮色（Accounts 8 / HomeGreeting 1 / Dashboard 1） |
+| 逃逸分析（QM-5 ②） | PASS | Gate 7c 基线只断言「不退化」，19 处挂账以「EP 原生控件/弹层」归为不可修而长期滞留；本批取证证明三槽桥接即可修复，非 EP 内部黑盒 |
+| 系统性漏洞定位 | PASS | ep-theme.css 桥接层只映射了主色档（danger/error 主色），未映射派生档（light-9/popper/fill-blank）——「桥接了一半」是 EP 主题化的系统性盲区 |
+| 修复 + 回归保护（QM-5 ④） | PASS | ep-theme.css +15 行（5 组 light-9 + popper + fill-blank）；cohere 暗色 --coral #ff8866→#c2410c（5.18:1）；tokens.css soft 四槽暗色 + 视图级集中区承接 Publish/Accounts 零容差迁出规则；contrast-audit **19→0** 无退化 exit=0，基线更新登记 0 |
+| 防止再次发生（QM-5 ⑤） | PASS | 基线 0 = 新增任何低对比元素即触发退化拦截；EP 桥接缺口三槽记录于注释（后续 EP 升级时对照核验） |
+| 行尾对账 | PASS | `git diff --numstat` 与 `--ignore-cr-at-eol` 两口径一致（本次提交前复核） |
+| 测试接线 | PASS | styles 契约 + PublishHistory.test + accounts-compile.test 共 **123 passed \| 1 skipped**（vitest 本机实测） |
+| 行数门禁 | PASS | check-max-lines rc=0：Publish/Accounts dark 规则因登记零容差（1773/1578）迁 tokens.css（PublishHistory 1394 同款模式），三个点名文件净零增长 |
+| QM-1 打包 / QM-4 视觉 | N/A | 未动 electron/ 主进程；视觉以 contrast-audit 实测 19→0 为准 |
+| QM-6 CCG 双模型外部评审 | PENDING | 提交后执行 scripts/ccg-review.ps1 -Mode Deep（PowerShell 统一入口），结果回填本行 |
+| 远程同步 | PENDING | 合并后取证 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI`，`git ls-remote --heads origin ue-p4e-contrast-fix` 应返回 0 行；随后删除上方 sync_* 三字段 |
+
+### 复盘：已闭合
+- EP 桥接三槽缺口（light-9/popper/fill-blank）→ 补映射，亮色同值零回归
+- coral 暗色白字不可读 → #c2410c 深橙（同暖橙相 5.18:1）
+- 零容差行数文件无法承载 dark 块 → tokens.css 视图级集中区（P4D 同款模式第三次复用）
diff --git a/scripts/gate-record-debt-ledger.json b/scripts/gate-record-debt-ledger.json
index a93f92dfc..7aa2a2064 100644
--- a/scripts/gate-record-debt-ledger.json
+++ b/scripts/gate-record-debt-ledger.json
@@ -1,4 +1,9 @@
 {
+  "本次执行记录：P4E 深色可读性第四批收官（docs-ue-p4e-contrast-fix，2026-10-09）【混合 PR】": {
+    "reason": "PR 合并后销账（同一次提交改写远程同步行 + 删本登记项）",
+    "status": "PENDING",
+    "line": 0
+  },
   "本次执行记录：多语言内容同步机制文档与规划（i18n-content-sync）（2026-08-13）": {
     "reason": "历史记录的收口证据未由本会话取证；不代其他会话改写其执行记录（只登记、不臆造 merge SHA）。回填者＝该记录作者，或其后续 docs PR。",
     "status": "记录",

```

> 这是机械生成的变更提案，不代表任何设计意图。评审方请只针对上述内容挑刺。