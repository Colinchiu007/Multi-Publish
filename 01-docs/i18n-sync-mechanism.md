# 多语言内容同步机制设计（i18n-content-sync）

> 状态：规划中（2026-08-13）
> 关联：PRD §3.2「多语言内容同步机制」小节 · OpenSpec change `openspec/changes/i18n-content-sync/` · `user-facing-messages` spec · `ui-i18n-p2` spec

## 1. 背景与问题

产品同时面向中文与英文用户，用户可见文案（名词、提示文字、错误/通知、状态、引导）要求 zh/en 成对。当前状态：

- **唯一事实源候选**：`apps/desktop/src/locales/zh.js` + `en.js`（vue-i18n，各 738 个叶子键，当前完全对称）。
- **重复语料源（风险点）**：`apps/desktop/src/story2video/story2video-notifications.js` 自带第二份 zh/en 语料（38 个通知键 + 弹窗按钮 + BGM reason + 历史详情规则，367 行），与 locales 中同名键**当前值一致，但无任何机制保证**。
- **门禁缺失**：`apps/desktop/src/i18n/i18n.test.js` 只测 CSP 安全转换与语言检测，**没有 zh/en 键对称断言**；`.github/workflows/` 无任何 i18n/locale 检查。
- **历史事故**：近两个月至少 4 次「漏键后补」修复（`26f36e78` 补 38 通知键、`46072426` 补 26 VOICE 键、`86a409df` 补 summaryDuration/summaryFileSize、`94fdd3c8` 补 videoEnhance/common.close），均为事后打补丁。

**核心痛点**：AI 会话（或人工）单独修改一个名词（如只改 `zh.js` 里的文案）时，**系统不会自动同步其他语言**；是否漏改只能靠人肉核对 738 个键。

## 2. 设计原则

1. **单一事实源（SSOT）**：用户可见文案只存在于 `locales/zh.js` + `en.js`；`story2video-notifications.js` 等模块只保留 key 常量与归一化逻辑，不持有文案。
2. **键驱动**：展示一律走 locale key；id→key 元数据映射（如 `i18n/pipeline-labels.js`）是正确范式。
3. **机器码过边界**：服务层/主进程只发稳定机器码（`bgm_skipped`、`AUTH_REQUIRED`…），文案由渲染端本地化（沿用 `user-facing-messages` 与 BGM single-source 既有模式）。
4. **门禁兜底**：不依赖「记得同步」，靠测试 + CI 在提交前拦截漂移。
5. **术语集中**：产品名词进词典，改名只改一处，机器校验其余引用。

## 3. 分层方案

### L0 — 自动化一致性门禁（先做，成本最低收益最高）

| 门禁 | 实现 | 拦截目标 |
|------|------|----------|
| L0-1 zh/en 键对称测试 | `i18n.test.js` 增加 `collectLeaves` 断言：zh/en 叶子键集完全一致（含嵌套路径），缺键即失败 | 「zh 加了 key、en 忘了」 |
| L0-2 插值占位符一致性 | 同一 key 的 zh/en 文案 `{param}` 集合必须一致 | 「en 漏了 `{max}` 插值」 |
| L0-3 重复源值一致性 | 断言 locales 与 `story2video-notifications.js` 同 key 文案值一致 | 「两处文案漂移」（语料源收敛后删除本条） |
| L0-4 渲染端硬编码扫描 | `apps/desktop/src/` 非 locales 文件出现 CJK 字符串字面量即失败（注释除外） | 「新代码直接写死中文」 |

### L1 — 提交配对规则（直接解决「只改中文」）

- **diff 配对检查（CI）**：locale 文件变更必须 zh/en 成对出现在同一提交；`git diff --name-only` 含 `locales/zh.js` 或 `locales/en.js` 而不同时含另一个 → 构建失败。
- **工作流提示**：AGENTS.md / `.quality-gates.md` 增加条款——修改任何 locale 文件必须成对提交 zh/en。

### L2 — 收敛重复语料源（根治）

- 将 `story2video-notifications.js` 的 38 条通知文案、弹窗按钮、BGM reason、历史详情规则并入 vue-i18n locales；文件只保留：key 常量、错误归一化/正则、通过 `i18n.global.t(key, params)` 取文案的调用。
- 收敛后删除 L0-3；L0-1/L0-2 成为唯一防线。

### L3 — 术语词典（针对「名词」）

- 集中维护产品名词翻译，如：

| zh | en | 机器 ID |
|----|----|---------|
| 故事讲述 | Story Telling | `story2video-compose` |
| 启动流水线 | Start pipeline | — |
| 提示 | Notice | — |

- 改名流程：改词典 → 扫描/测试断言 zh/en 文案中该名词的映射一致出现（或 CI 在 zh 文案变化时列出 en 侧未同步候选词）。
- 落地形式可选：`01-docs/i18n-glossary.md` 独立文件 + 校验测试，或 locales `terms` 命名空间。

## 4. 检测手段汇总（怎么判断「某次中文修改没同步」）

| 手段 | 抓什么 | 阶段 |
|------|--------|------|
| L0-1 键对称 | zh 有 `home.foo`、en 没有 → fail | CI/本地测试 |
| L0-2 占位符 | `{param}` 集合不一致 → fail | CI/本地测试 |
| L0-3 重复源值 | locales 与 notifications 同 key 文案不一致 → fail | CI/本地测试（收敛前） |
| L1 diff 配对 | 本提交只改 `zh.js` 没改 `en.js` → fail | CI |
| L0-4 CJK 扫描 | renderer 新代码直接写中文 → fail | CI |

## 5. 落地路线

1. **Phase A（L0）**：`i18n.test.js` 增加键对称 + 占位符断言；增加 L0-3 重复源校验测试；新增 `scripts/check-locale-pair.js`（diff 配对 + CJK 扫描）；CI 挂载 L1 配对 job。
2. **Phase B（L2 收敛）**：`story2video-notifications.js` 文案并入 locales，模块瘦身为 key + 归一化逻辑；删除 L0-3。
3. **Phase C（L3 词典）**：建立术语词典 + 校验测试；AGENTS.md / `.quality-gates.md` 条款更新。
4. **Phase D（规范回馈）**：把「zh/en 成对」写进 `user-facing-messages` / `ui-i18n-p2` spec 或新增 `i18n-content-sync` spec（本 change 已含 delta spec）。

## 6. 验收清单

> 状态：2026-08-13 全部实施完成（分支 `codex/i18n-content-sync`，OpenSpec change `i18n-content-sync`，PR #693 合并 2695b15f）；同日硬化轮（i18n-sync-hardening）再收口三项挂账：`.vue <template>` 纳入 CJK 扫描（基线 1650）、`user-facing-error.js` 文案并入 locales `userErrors`（豁免移除）、术语词典扩充至 10 条。

- [x] `i18n.test.js` 含键对称与占位符断言，zh/en 各 738+ 键通过
- [x] 重复源校验测试落地，并在 L2 语料源收敛后按设计移除（`story2video-notifications.js` 不再持有文案）
- [x] CI job：locale diff 配对检查生效（quality-gate.yml Gate 7，`.github/scripts/check-locale-sync.js --pair-base origin/main`）
- [x] CI job：renderer CJK 硬编码扫描生效（Gate 7，基线 `.github/scripts/locale-cjk-baseline.json` 836 条）
- [x] 术语词典 `01-docs/i18n-glossary.md` + `glossary.test.js` 存在
- [x] `.quality-gates.md` 与 AGENTS.md 增加「locale 成对修改」条款

## 7. 相关文档

- PRD §3.2「用户提示文字与多语言规范」「多语言内容同步机制」
- `openspec/specs/user-facing-messages/spec.md`
- `openspec/specs/ui-i18n-p2/spec.md`
- `openspec/changes/archive/2026-08-10-story2video-bgm-i18n-single-source/`（机器码单源先例）
- `apps/desktop/src/i18n/i18n.test.js`（门禁落点）
