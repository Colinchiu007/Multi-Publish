## Context

现状（详见 proposal.md - Why 与 `01-docs/i18n-sync-mechanism.md`）：
- `locales/zh.js` / `en.js` 各 738 叶子键，当前对称，但 `i18n.test.js` 无键对称断言，CI 无任何 locale 检查。
- `story2video-notifications.js` 持有与 locales 重复的第二份 zh/en 语料（38 通知键 + 弹窗按钮 + BGM reason + 历史详情规则），当前值一致但无机制保证。
- 服务层→渲染端的「机器码 + 本地化」模式已确立（`user-facing-messages` spec、`story2video-bgm-i18n-single-source` 先例），但未强制。

## Goals / Non-Goals

**Goals:**
- 用自动化门禁把「zh/en 漂移」从人工核对改为 CI/测试拦截，覆盖键、占位符、重复源、提交配对、硬编码文案。
- 建立术语词典，让「改一个名词」从改多处 + 靠记忆，变为改一处 + 机器校验。
- 收敛 `story2video-notifications.js` 的重复文案，让 locales 成为唯一事实源。

**Non-Goals:**
- 不做自动机器翻译（AI 生成 en 文案仍由人工/AI 会话提供，门禁只保证「成对存在、键与占位符一致」）。
- 不新增语言（如 ja/fr）；本机制只保证现有 zh/en 同步。
- 不重构全部历史硬编码文案（存量清理分批推进，本 change 只立规则 + 拦截新增）。

## Decisions

**D1：门禁以测试 + CI 脚本实现，不引入新依赖。**
- `i18n.test.js` 内增加 `collectLeaves` 键对称与占位符断言（该文件已有 `collectLeaves` 工具函数，复用成本最低）。
- 重复源校验做成独立测试文件 `src/story2video/story2video-notifications.sync.test.js`（或并入现有测试），对比 locales 与模块同 key 值。
- CI 配对与 CJK 扫描做成 `scripts/check-locale-sync.js`（Node，无依赖），在现有 CI workflow 挂一个 job。
- 备选：eslint-plugin-vue-i18n / formatjs 等第三方 lint。不选：引入新依赖 + 需对齐项目 lint 体系，成本高于收益；测试脚本对项目现状更直接。

**D2：收敛策略——`story2video-notifications.js` 只留逻辑，文案并入 locales。**
- 模块保留：`STORY2VIDEO_NOTIFICATION_KEYS`、错误归一化正则、`resolveMessageKey` 等逻辑；`messageFor` 改为调用 `i18n.global.t(key, params)`（或注入 t 函数保持可测）。
- 文案值以「与 locales 完全一致」为前提迁移；迁移后删除 L0-3 重复源校验。
- 备选：反向（locales 不再持有 story2video 通知键）。不选：通知弹窗已走独立 map，且 locales 中同键已被其他路径/测试引用，保留 locales 更符合 SSOT 方向。

**D3：术语词典落地为 `01-docs/i18n-glossary.md` + 校验测试。**
- 词典为 markdown 表格（zh/en/机器 ID 三列），测试解析表格并扫描 locales 文案断言成对出现；未知术语只告警不阻断（避免误报）。
- 备选：locales `terms` 命名空间。不选：词典是产品术语资产，放 docs 便于产品/运营维护，测试只读不改。

**D4：diff 配对检查在 CI 层做，不侵入 git hook。**
- CI job 读取 `git diff --name-only origin/main...HEAD`，若 locale 文件未成对出现则失败。
- 备选：pre-commit hook。不选：团队成员工具链不一致（Windows 多会话），CI 是唯一权威闸口；AGENTS.md 提示条款配合。

## Risks / Trade-offs

- [L0-4 CJK 扫描误报（平台数据源、翻译注释、正则里的中文）] → 扫描白名单/豁免规则（注释行、明确数据源文件），先以 Warning 灰度再转 Error。
- [L2 收敛破坏既有通知渲染契约] → 迁移期保留 `formatStory2VideoNotification` 返回结构不变，测试先行；收敛前后双跑 `story2video-notifications.test.js`。
- [术语词典校验误报（同名词多义）] → 词典校验只对「机器 ID 绑定」的术语做硬校验，其余告警。
- [CI 配对检查与并发 worktree 冲突] → 只读 diff，不修改文件；按现有 CI 路径门控只对 locale 变更触发。

## Migration Plan

1. Phase A（L0 + L1）：加测试 + `scripts/check-locale-sync.js` + CI job；先验证「构造只改 zh.js 的提交」能复现失败。
2. Phase B（L2）：迁移 `story2video-notifications.js` 文案入 locales → 删除 L0-3 → 全量测试。
3. Phase C（L3）：建词典 + 校验测试；更新 AGENTS.md / `.quality-gates.md`。
4. 回滚：门禁全部为增量检查，回滚 = 撤销对应 commit；L2 迁移可用 git revert 回退（文案已入 locales，无数据迁移）。

## Open Questions

- CJK 扫描对「平台数据源」（如平台显示名、provider 返回的标签）的豁免边界，需要在 Phase A 实测后收窄规则——不改变 spec 与任务分解。
