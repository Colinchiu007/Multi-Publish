# Review — fix-s2v-history-scene-prompt-persistence

日期：2026-08-16
范围：ResultView.vue / CreateViewHistory.vue / locales(zh,en) / 2 个测试文件 / OpenSpec change / docs

## 模型降级记录（AGENTS.md 子代理降级规则）

- Antigravity 后端本次不可用：`Error: Eligibility check failed: Your current account is not eligible for Antigravity, because it is not currently available in your location.`（geo 限制，非配置问题）。
- 按机制硬化规则降级为单模型（Claude reviewer）审查，并在本报告中显式记录；Claude 用时约 12 分钟，实测了 vue-router@4 `canOnlyBeCalledOnce` 源码、CJK 门禁与两个受影响测试套件（79/79 通过）。

## 审查结论（Claude reviewer）

### Critical 🔴
- 无。

### Warning 🟡
1. **[ResultView.vue leave 弹窗]** 保存在途时仅「保存并离开」禁用，discard/cancel 仍可点击 → 双重 next / 语义错乱。
   → **已修复**：discard/cancel 按钮加 `:disabled="saving"`，且 `discardAndLeave`/`cancelUnsavedLeave` 方法内 `if (this.saving) return` 双保险（vue-router 4 的 next 被 `canOnlyBeCalledOnce` 包装，第二次调用生产环境静默忽略，导航不会双发/重入，但语义上需消除）。
2. **[ResultView.vue segmentsDirty 语义]** 生成/素材类服务端已持久化的操作后仍置 `segmentsDirty=true`，离开守卫会提示「有未保存修改」。
   → **已评估不采纳**：这是 3.1.29 既有设计（生成类操作返回新数据后标脏，驱动「保存分段/重合成」捕获最新数据，W3 自动保存语义）——改为「仅用户编辑标脏」会重定义保存模型并波及大量既有测试与产品行为；作为已知 UX 噪音记录，不在本次范围。

### Info 🟢
1. **[CreateViewHistory.vue CSS]** 重复 `.history-detail-scene-item` 规则（center 死值）。
   → **已修复**：合并为 `align-items: flex-start`。
2. **[docs]** 「新增 7 键」实为 8 键（create.history 2 + sceneMaterial 6）；1922/1922 为自研脚本计数，官方门禁为 1499/1499。
   → **已修复**：CHANGELOG 与 PRD 改为「新增 8 键」「官方门禁 1499/1499 无新增硬编码」。
3. **[ResultView.vue:149-150]** 标题行混用 `$t` 与 `tOrKey` —— `tOrKey` 仅无 i18n 上下文时回落 key，生产等同 `$t`，接受现状。
4. **[ResultView.vue:410]** 离开守卫只覆盖应用内路由离开；Electron 窗口关闭/刷新仍会静默丢 dirty 编辑（无 `beforeunload`）——**范围外**，记录待后续。

## 修复后重验

- Vitest 受影响套件：`ResultView / CreateViewHistory / CreateView / views-deep2` **288/288 通过**（含新增 7 用例）。
- `pnpm run build:vue` 通过；eslint 变更文件 0 错误。
- `check-locale-sync --cjk` PASS（1499/1499 无新增硬编码；基线两次 `--update-baseline` 吸收行号偏移，字符串集合对比 1922/1922 无新增无删除）；`--pair-base HEAD` PASS。
- `check:ts` 报错均为 `packages/*` 存量问题（postgres-identity-repository / webhook-manager / data-sync / video-clone-engine），与本次改动无关。
- openspec validate：`Change 'story2video-history-scene-prompt-persistence' is valid`。

结论：无阻塞项；Warning 1 与 Info 1/2 已修复，Warning 2 / Info 4 记录为已评估范围外。批准合入。
