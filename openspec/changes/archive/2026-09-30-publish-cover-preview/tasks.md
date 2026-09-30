# Tasks — publish-cover-preview

## 1. 规格先行

- [x] `01-docs/PRD-PUBLISH-COVER-PREVIEW-2026-09-28.md`（12 节：问题与根因 / 目标与明确不做 / 方案选型 / 功能逻辑 / 显示项 / 交互流程 / 数据校验与安全 / 提示文字 zh-en 对照 / 性能实测 / 验收标准 / 测试策略 / 决策记录）
- [x] `01-docs/PRD.md` 尾部追加指针节，登记三条不可省略口径
- [x] 本 change（proposal / design / specs delta / tasks）

## 2. 测试（TDD，先写先红）

- [x] `src/composables/useCoverPreview.test.js`（新增 17 例）：导出完整性、空/非字符串不发 IPC、两种信封形状、`code!==0`、`code===0` 但 dataUrl 缺失、reject、同步抛错、无 `electronAPI`、`unavailableKey` 切换、竞态两类（迟到成功 / 迟到失败）、卸载后不写状态、`reload()`
- [x] `src/views/Publish.test.js` 新增「封面缩略图与放大预览」12 例：提取与 AI 生成两入口写入即出图、草稿恢复（入口 5）经 `loadDraft` 真实路径出图、迟到响应不倒灌、点击与 Enter 打开、关闭释放挂起、预览中换封面自动收起、失败降级且 `cover-state` 契约节点仍在、删除清空、空封面不发 IPC、图文行同样生效
- [x] `src/views/Publish.test.js` 夹具同步：两处 `electronAPI` 块补 `readCoverData` 与 `pageManager.{suspend,resume}EmbeddedViews`；`stubs` 补 `teleport: true`（`UiModal` Teleport 到 body，否则取不到弹窗节点）
- [x] `src/overlay-view-suspension.test.js` 新增三 owner 结构锁（逐函数取块，不用跨函数懒惰匹配；断言 `watch(visible)` 开合成对、`onBeforeUnmount` 兜底在位、不得以字面量塞 owner）
- [x] `src/components/CoverCropDialog.test.js` 作为复用后回归（未降低断言强度）

## 3. 实现

- [x] `src/composables/useCoverPreview.js`（新增）：`cover:read-data` 剥信封唯一实现 + 自增序号竞态守卫 + `onScopeDispose` 作废在途 + `unavailableKey` 可选措辞
- [x] `src/components/CoverThumbnail.vue`（新增）：144×81、`object-fit: cover`、`cursor: zoom-in`、三态互斥、`role=button` + `tabindex=0` + Enter/Space、失败态保留占位框并挂 `title`
- [x] `src/views/Publish.vue`：`useCoverPreview(() => article.cover_path)` 单实例；视频与图文两个封面行各插入 `CoverThumbnail`（`el-upload` 兄弟节点，图文侧刻意不加 flex 包裹层）；`UiModal` 放大预览（文件名 + 原始尺寸）；预览中换封面自动收起
- [x] `src/views/Publish.vue`：浮层互斥 owner `publish-cover-preview` 与 `publish-ai-cover-dialog`；预览的挂起/释放后随组件迁入 `CoverPreviewDialog.vue`（见 §7），AI 封面浮层仍由本视图按 `watch` + `onBeforeUnmount` 成对释放
- [x] `src/components/CoverCropDialog.vue`：改用 `useCoverPreview`（删除内部重复的剥信封实现与命令式 `loadImage()`），补 owner `publish-cover-crop-dialog`，`previewUrl` 变化时复位 `imgNatural`
- [x] `src/locales/{zh,en}.js`：`publishPage.coverPreview.{title,hint,ariaLabel,loading,unavailable}` 成对新增，插在 `coverCrop` 之后保持行位对称

## 4. 决策证据（不得只写结论）

- [x] 实测否决自己提的防御性门禁：0.3 / 2 / 8 / 20 MB 封面 `readFileSync`+`base64` = 0.9 / 1.9 / 6.7 / 25.6 ms ⇒ 撤销主进程 `maxBytes` 方案，数字留在 PRD §9
- [x] 核实 `sharp` 不可用：`apps/desktop/package.json` 未声明（仅 `packages/shared-utils` 声明），按「生产依赖闭包」排除
- [x] 核实 CSP：`img-src` 已含 `data:` ⇒ 零 CSP 改动；`index.test.js` 守卫保持通过
- [x] 核实 E2E 契约：`[data-testid="cover-state"]` 的 `dataset.coverPath` 原样保留并被用例断言

## 5. 自查追加：home-shell 内嵌实例不得挂起（本 change 的前置正确性条件）

- [x] `src/composables/useEmbeddedViewSuspension.js`：新增 `isHomeShellRuntime()` 守卫，判据按调用时刻读取 `window.location.search`
- [x] `src/overlay-view-suspension.test.js` 新增 4 例：壳态 no-op 且不发 IPC / 主窗口行为不变 / 判据不得导入期冻结 / 参数值须严格为 `1`
- [x] 变异反证：守卫改成恒不命中 ⇒ 恰好那 2 条变红，字节还原一致
- [x] PRD 新增 §7.5.1；CHANGELOG 与 learnings 补条目（纯插入，删除数 0）
- [x] 文档拼接工具坑修正：字符串下标与 Buffer 字节长度不可混用；自证断言必须用**可逆性**判据（摘掉插入块后与原文件 `equals`），并以 `git diff --numstat` 删除数为 0 对账

## 6. 验证与门禁

- [x] `useCoverPreview` + `Publish` + `CoverCropDialog` = 88 passed（实现阶段）
- [x] `overlay-view-suspension`（含新增 4 例 home-shell 守卫）+ `shell-mode-6b` = 23 passed
- [x] `views-deep2` + `views-coverage` = 16 passed（其余挂载 Publish 的套件）
- [x] **渲染层全量 `vitest run src` = 223 文件 / 3874 passed | 2 skipped，零失败**（拆分后重跑，见 §7；按 AGENTS.md 口径，接缝类判断必须在 runner 真实采用的全量跑法下验证，`-t` 单跑不构成证据）
- [x] `check-locale-sync --pair-base`（成对）与 `--cjk`（无新增硬编码）双 PASS
- [x] `check-docs-sync.sh`（Doc Sync 门禁）本地预跑 PASS
- [x] eslint 改动文件零告警；`vite build` 通过（模板编译）
- [x] `verify-worktree-deps` OK；`check-max-lines` 与 `check-debt-budget` 均在基线内
- [x] 六条变异反证实跑变红并断言字节还原，且各配正控（不施加变异须报出 passed 计数）：拆竞态守卫 ⇒ 3 红；owner 复用 `settings-dialog` ⇒ 1 红；缩略图不上抛 `open` ⇒ 1 红；home-shell 守卫恒不命中 ⇒ 2 红；放大弹窗抽为独立组件后**重测** —— 摘 `watch(visible)` else 分支的释放 ⇒ 4 红（结构锁 + 3 条行为用例）、删 `onBeforeUnmount` 兜底 ⇒ 1 红
- [x] 四份共享文档按字节前插/追加，`git diff --numstat` 删除数为 0，且与 `--ignore-cr-at-eol --numstat` 逐文件相等
- [x] QM-1 打包 N/A：`git diff --name-only origin/main...HEAD` 不含 `electron/` 与 `rpa-engine/`
- [x] QM-6 双模型外部评审（backend=codex / frontend=claude）：前端已回（0 Critical / 2 Warning / 4 Info，处置见 PRD §13）；**后端终态为缺失** —— `codeagent-wrapper` 报 `codex execution timeout`，累计约 2.5 小时、发现项 0 条、wrapper 日志退出后被清理不可回读。已按「缺失的第二位评审者」而非「审过没问题」登记（`.quality-gates.md` + PR 评论），自审不折算为外部评审。
- [x] 真机 Electron 窗口目视验证：已完成并经用户在本机确认「没问题」（2026-09-30）。证据性质如实登记为**用户目视确认**，不是自动化产物 —— 当时本机另一会话占用应用单例锁与 dev 端口，我未擅自起第二个实例，故本条没有我自己截到的现场图；三个检查点（缩略图出图 / 点击放大 / home-shell 内嵌实例里弹窗不再把承载视图自己藏掉）写在 PR #2562 的评论里。

## 7. 收口二轮：债务门禁逼出的拆分（CI `债务熔断检查` 红 → 绿）

- [x] 实测归因（`git show <ref>:<file>` 逐行数，不用 diff 计数）：登记值 1333、`origin/main` 已是 **1457**（别的会话累计 +124，登记值本就滞后）、本侧 +151 到 **1608** ⇒ CI 报 `LEDGER_GREW … 膨胀 276 行（容差 200）`
- [x] 读 `check-max-lines.js` 确认 `--update` 明确「不抬高已有登记值（存量膨胀交给 `LEDGER_GREW` 判定，而不是悄悄改基线）」、`--update --rewrite` 自陈「会掩盖别人的漂移」⇒ **不抬基线**，按门禁意图拆分
- [x] 放大弹窗整块（模板 + 挂起/释放 + 文件名/原始尺寸 + scoped 样式）迁为 `apps/desktop/src/components/CoverPreviewDialog.vue`；`Publish.vue` 1608 → **1530**（注意脚本口径是 `split('\n').length`，比 `wc -l` 多 1，曾降到 1533 仍报 201）
- [x] 结构锁随实现搬家（AGENTS.md「门禁断言随实现迁移同步」MUST）：`overlay-view-suspension.test.js` 三 owner 断言从 `Publish.vue` 的 `suspendCoverPreviewOverlay`/`closeCoverPreview` 改指 `CoverPreviewDialog.vue` 的 `suspendOverlay`/`releaseOverlay`/`watch(visible)`/`onBeforeUnmount`
- [x] 释放形态口径如实化（PRD §7.5、openspec spec、`01-docs/PRD.md` 指针节同步）：三个 owner 均为**状态驱动型**（`watch(visible)` 收开合 + `onBeforeUnmount` 兜底），`try/finally` 只适用于释放发生在函数体中间的那种浮层（先例 `account-cloud-sync-dialog`）；并记录为一致性接受的代价 —— 丢掉「挂起先于显示」的顺序保证，真机若闪遮需回到 `await suspend` 先行
- [x] 拆分后**重跑**变异（旧位置的红数对新结构不构成证据）：摘 else 分支释放 ⇒ 4 红；删 `onBeforeUnmount` ⇒ 1 红；owner 复用 `settings-dialog` ⇒ 1 红；各配正控
- [x] 渲染层全量 `vitest run src` = 223 文件 / 3874 passed | 2 skipped；`check-max-lines` / `check-debt-budget` / eslint / `vite build` 全绿；EOL 对账 8 个暂存文件 `--numstat` 与 `-w` 逐个相等
