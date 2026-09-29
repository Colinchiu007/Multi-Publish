# Tasks: UI Apple Token 双轨退役（backlog）

**状态**：提案已建立，未开始实现。依赖 `story2video-detail-visual-refinement`（2026-09-20 详情页批次）先落地，以便沿用其确立的「新代码禁止消费 `--apple-*`」约束与暗色核对手法。

**基线（批次 0 门禁实测并钉住；历史值 282 处 / 7 文件、起草期 337/57 均已过期）**：`--apple-*` 消费点 **339 处 / 10 文件**，其中 2026-09-20 禁令之后**回潮 59 处 / 4 文件**（`AccountCloudSync*`，PR #2461 后又涨 2 处）。
- **取证 SHA**：main@4ec7ef42（2026-09-29）
- **取证命令（可复现，已入库且 CI 接线）**：`node .github/scripts/check-frontend-consistency.js --json` → 读 `counts.appleAlias`（= 339）与 `violations.appleAlias`（逐条 `file:line`，按文件聚合即得分布）；口径=逐消费点计数、排除注释行与测试文件
- **门禁基线**：`frontend-consistency-baseline.json` 的 `appleAlias = 339`（只降不升；批次 6 升级为 = 0）
- 分布：`history-page.css` 190 · `UiModal.vue` 29 · `UiButton.vue` 28 · `AccountCloudSyncDigestBody.vue` 21 · `UiInput.vue` 16 · `AccountCloudSyncSummary.vue` 16 · `ConfigProfileManager.vue` 15 · `AccountCloudSyncItems.vue` 12 · `AccountCloudSyncDialog.vue` 10 · `create-view.css` 2
- 其他基线：`tokens.css` 暗色块仅重定义 31 个变量；`--color-apple-*` 17 个槽位 0 个暗色覆盖；视觉基线实测 **21 张**（本文件原写 18 张）。

**拍板**：七项开放问题已按推荐值记录于 `decisions.md`（D1–D7）。

## Task 0（批次 0，前置）: 基线重测 + 回潮止血门禁 + 拍板材料

**Status**: done
**Risk**: Low（门禁脚本 + 文档；不动运行时代码）
**Files**: `.github/scripts/check-frontend-consistency.js`、`.github/scripts/frontend-consistency-baseline.json`、`.github/scripts/check-frontend-consistency.test.js`、`openspec/changes/ui-apple-token-retirement/tasks.md`（基线回写）、`decisions.md`、`history-page-token-map.md`

### Acceptance Criteria
- [x] 按当时 main 重测 `var(--apple-` 消费面（命中数 / 文件数 / 回潮文件），把实测值与**取证 SHA + 命令**写回本文件「基线」段（见上：339 处 / 10 文件，回潮 59 处 / 4 文件，main@4ec7ef42）
- [x] `check-frontend-consistency.js` 增加别名回潮检查项（`appleAlias`，**基线制**：命中数 > 基线即 CI 失败，输出文件与行号）；扫描面独立（`scope: allSrc` 覆盖 `styles/*.css`），既有两模式的判定面不变
- [x] 基线值取实施时实测值：**339 处 / 10 文件**（钉入 `frontend-consistency-baseline.json`）
- [x] **门禁自证（反证）**：植入 2 处（一普通行、一「注释在前同行」）→ 341 > 339 且 `FAIL exit 1`，同时定位 `create-view.css:495` 与 `:496`；还原后 339 → `PASS exit 0`
- [x] 产出 `history-page.css` 43 个变量的「旧 → 新 → 值差异」三栏清单初稿 → `history-page-token-map.md`（**未写入 CSS 注释**）
- [x] 七项开放问题拍板落 `decisions.md`（D1–D7）；据此校正 Task 2 文件清单（`--text` 所在 `video-creation-tokens.css`）与 Task 3 范围（含回潮 59 处）
- [x] 基线张数漂移同步：Task 1 验收口径按实测 **21 张**浅色基线改写（原写 18 张）

### 批次 0 附带的门禁加固（同批 PR，均有测试覆盖）
- [x] **共享基线写入改为 merge**：`frontend-consistency-baseline.json` 由本脚本 / `check-color-literals` / `check-css-var-defined` 三方共用；原实现 `writeBaseline` 只写自己的键 → 会抹掉他方键并使其门禁误报 FAIL。现保留他方键（`mergeBaseline`），实测 `colorLiterals=129`/`cssVarUndefined=64` 存活
- [x] **基线缺键 fail-closed**：`counts > undefined` 恒 false 会让新增检查项静默放行；现缺键即失败并提示 `--update-baseline`
- [x] **计数口径统一为「消费点（处）」**：原按行计一次，与基线文档语义（处）不符；`main.js` 单行两处引用由 1 改计 2（既有基线 0，判定不受影响）
- [x] **CSS 块注释盲区**：`isCommentLine` 对「以 `/*` 开头」的整行直接跳过，会漏掉 `/* 说明 */ .a { color: var(--apple-x) }` 这类同行代码（反证实测踩到）→ 新增 `commentStyle: 'blockAware'`（按扩展名分派：`.css` 只认块注释，`.vue/.js` 保留既有约定）


## Task 1: 视觉基线增加暗色通道

**Status**: pending
**Risk**: Low（测试基建，不改运行行为）
**Files**: `apps/desktop/tests/visual-testing/scripts/run-pixel-tests.js`、`test-runner.js`

### Acceptance Criteria
- [ ] runner 支持主题参数（如 `THEME=dark`），注入 `data-theme="dark"` 后逐视图截图
- [ ] 基线命名区分主题（`<view>.png` / `<view>-dark.png`），互不覆盖
- [ ] CI GATE-7 增跑暗色一遍，失败信息与浅色同格式
- [ ] 既有 18 张浅色基线在改造后仍逐张通过（证明改造零视觉影响）

---

## Task 2: `tokens.css` 补齐缺失语义槽与暗色槽

**Status**: pending
**Risk**: Low（**只新增、不改动既有值 → 零视觉回归**）
**Files**: `apps/desktop/src/styles/tokens.css`、`apps/desktop/src/styles/video-creation-tokens.css`（D3：`--text` 定义在此，非 tokens.css）、`apps/desktop/src/styles/tokens.slots.test.js`（契约测试）

### Acceptance Criteria
- [x] 新增 `--font-weight-regular/medium/semibold/bold`、`--font-family-display/text/mono`、`--leading-tight/normal/relaxed`、`--duration-fast/normal/slow`、`--ease-default/spring/in-out`（取值与别名层现值逐字一致 ⇒ 迁移时字体/字重/行高/动效渲染不变）
- [x] 新增通用阴影级差 `--shadow-sm/md/lg`，色相与既有 `--shadow-float` 的 `rgba(30,27,75,α)` 口径一致（**实测本已存在**于浅色与暗色块，本批次只做口径核对并加回归锁，不重复新增）
- [x] `[data-theme="dark"]` 增补 `--color-text-strong` / `--color-text-primary` / `--color-text-secondary` / `--color-text-muted` / `--color-primary-light`（暗色卡片底上实测对比度 14.35 / 12.80 / 7.53 / 6.66 :1，全部 ≥ 4.5:1；回归锁含 WCAG 计算断言）
- [x] `--text` 去留拍板（D3：**保留**）并给暗色正确值：`video-creation-tokens.css` 暗色块原为 `var(--ep-bg, #1a1a1e)`（**文字色转发到背景色** = 2026-09-20 事故根因）→ 改为 `var(--ink, #e8e8ed)`（在暗底 14.21:1），结构与浅色对称；文件清单已按 D3 扩到该文件
- [x] `--color-primary` 保持不覆盖（既有合同；回归锁断言暗色块无该键）
- [x] 顺带补齐 `--spacing-16: 64px`（间距族原止于 `--spacing-10`，批次 5 的 history-page 用到 64px，属批次 0 三栏清单暴露的缺档）
- [ ] 全量浅色基线不变（**待 CI 实跑取证**，同批次 1 口径：本地像素运行与 CI 不同源）。结构侧已证浅色无消费点变更 —— 本批次浅色侧全部是**新增槽位**（无任何消费点），暗色侧才是生效改动
- ⚠️ **暗色生效改动披露（2 处，须由暗色通道核对）**：①`--color-text-*` 暗色补齐（此前深字落深底）②`--color-primary-light` 暗色改品牌紫半透明叠加。二者都改暗色观感；因暗色基线尚未入库（批次 1 staged），**本批次落地后生成的暗色基线将是「修复后」状态**，后续批次 3/5 的暗色回归即以该基线比较（顺序正确：先修盲区，再建基线，再做视觉变更）

---

## Task 3: 组件层收敛（`UiButton` / `UiInput` / `UiModal` / `ConfigProfileManager`）

**Status**: pending
**Risk**: High（全站观感：Apple 蓝 → 品牌紫）
**Files**: `components/UiButton.vue`(28)、`UiInput.vue`(16)、`UiModal.vue`(29)、`ConfigProfileManager.vue`(15)

### Acceptance Criteria
- [ ] 采取 design 的 (a) 方案：组件**内部**改 token 来源，props/emits/slots API 完全不变
- [ ] 不得要求调用方「加类覆盖」（scoped 特异性 (0,2,0) 会压过外部全局类，已实证无效）
- [ ] 每个组件一份「旧 `--apple-*` → 新令牌 → 值差异」三栏清单，随 PR 附上
- [ ] 组件单测全绿 + 受影响的视图测试全绿
- [ ] 相关视图基线**定向**重生成（`PIXEL_ONLY`），浅色 + 暗色各一遍并逐张核对
- [ ] 完成后 `apps/desktop/src/components` 下 `var(--apple-` 命中 = 0

---

## Task 4: `create-view.css` 弹窗域 2 处

**Status**: pending
**Risk**: Low
**Files**: `apps/desktop/src/styles/create-view.css`

### Acceptance Criteria
- [ ] `.gen-video-modal-content` / `.pipeline-progress-modal-content` 的 `var(--apple-surface-primary, var(--surface, #fff))` → `var(--color-bg-card)`
- [ ] 注意 `create-view.css` 现 496 行，改动不得使其越过 500 行硬线（`check-debt-budget` 的 `filesOver500` 余量仅 1）
- [ ] 弹窗基线（含暗色）定向重生成核对

---

## Task 5: `history-page.css` 190 处（最大一块）

**Status**: pending
**Risk**: High
**Files**: `apps/desktop/src/styles/history-page.css`

### Acceptance Criteria
- [ ] 先产出 43 个变量的「旧 → 新 → 值差异」清单并拍板圆角/字号取尺（design Decision Point 1）
- [ ] 单文件单 PR，不与其它收敛混提
- [ ] 历史视图浅色 + 暗色基线定向重生成，逐张肉眼核对
- [ ] `check-color-literals` / `check-font-size-scale` / `check-frontend-consistency` 全绿

---

## Task 6: 删除别名层并加回潮门禁

**Status**: pending
**Risk**: Medium
**Files**: `styles/apple-design-tokens.css`、`styles/tokens.css`、`.github/scripts/check-frontend-consistency.js`、`main.js`

### Acceptance Criteria
- [ ] `var(--apple-` 在 `apps/desktop/src/**` 命中 = 0（含 `main.js` 的导入）
- [ ] 删除 `apple-design-tokens.css` 与 `tokens.css` 的 17 个 `--color-apple-*` 槽位
- [ ] 移除 `main.js` / `cohere-design-system.css` 中对 alias 层的导入
- [ ] 新增静态门禁：`var(--apple-` 命中数必须为 0，非 0 则 CI 失败并列出行号
- [ ] 全量基线（浅 + 暗）跑一遍通过
- [ ] `cohere-design-system.css` 的 `--ink` / `--muted` / `--surface` 收敛为对 `tokens.css` 的纯转发，不再承担暗色救火

---

## Task 7: 文档收口

**Status**: pending
**Risk**: Low

### Acceptance Criteria
- [ ] `01-docs/CHANGELOG.md` 记为 BREAKING（视觉）
- [ ] `docs/desktop-ui-layout-spec.md` 与 `docs/frontend-interaction-spec.md` 中的令牌指引改指权威令牌，删除 `--apple-*` 示例
- [ ] `desktop-ui-consistency` spec 归档本 change 的 delta
- [ ] `.quality-gates.md` 记录每片的基线重生成证据
