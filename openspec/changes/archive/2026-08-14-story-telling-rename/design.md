## Context

见 proposal.md（Why）。当前展示名「全能创作 / Omni Creation」为 2026-08-12 由「图片轮播 / Image Carousel」更名而来；机器 ID `story2video-compose` 与 spec 目录名 `story2video-omnipotent-creation` 均为稳定标识（PRD §7.1.3、i18n-glossary 维护规则），本次不 rename。改动集中在显示层文案（locale）、测试断言与文档。

## Goals / Non-Goals

- Goals：zh/en 显示名、描述、配置标题、权限提示、模式摘要、素材模式选项同步为「故事讲述 / Story Telling」；测试断言与 live specs 同步；PRD/术语词典/使用手册/变更记录同步。
- Non-Goals：不改机器 ID、IPC、持久化契约与执行语义；不改历史记录（旧 changelog 条目、learnings、openspec/changes/archive、.ccg/tasks/archive、PRD-video-creation 修订记录与用户原话引用）；不重命名 `story2video-omnipotent-creation` 等标识。

## Decisions

1. **英文名「Story Telling」**：沿用「Omni Creation」双词、首字母大写的 Title Case 风格；描述性短语（素材模式说明、流水线描述正文）沿用既有小写约定（如 `omni creation` → `story telling`），保持「名称 Title Case / 描述性引用小写」的既有语料模式。
2. **素材模式选项沿用替换式**：`全部全能创作` → `全部故事讲述`（en `Omni creation only` → `Story telling only`）、`视频+全能创作` → `视频+故事讲述`（en `Video + omni creation` → `Video + story telling`）。备选「中性词（全部图片/视频+图片）」更抗将来再更名，但属于额外产品决策、超出本次请求范围，且 2026-08-12 更名先例即采用替换式；保留替换式，在 review.md 记为 Info。
3. **PRD 更名笔记链式化**：§7.1.3 契约句更新为「默认中文显示“故事讲述”，英文显示“Story Telling”（2026-08-14 更名，原名“全能创作 / Omni Creation”，再早“图片轮播 / Image Carousel”）」；2026-08-12 的 rename 条目补「→「故事讲述 / Story Telling」（2026-08-14）」；§7.1 标题更新为「故事讲述（原 全能创作 / Omni Creation；2026-08-14 更名）」。沿用 08-12 先例（该次更名即在 PRD 中留链式注记）。
4. **live spec 更新策略**：5 个 live spec 的 Requirement 通过本 change 的 delta 在 apply 时合入；Purpose 段（仅 omnipotent-creation / split-contract / creation-mode 的 Purpose 含旧名）在 apply 后直接编辑 `openspec/specs/` 更新为当前态。
5. **历史记录不动**：CHANGELOG.md 与 01-docs/CHANGELOG.md 旧条目、learnings.md、.quality-gates.md 旧记录均为历史事实，保持原样；仅在 CHANGELOG.md 与 01-docs/CHANGELOG.md 顶部新增本次更名条目，.quality-gates.md 顶部追加本任务记录。
6. **CI/门禁兼容**：i18n 术语表 zh/en 出现状态校验（glossary.test.js）与 locale 成对同步（CI Gate 7 check-locale-sync）要求 zh.js / en.js 同轮提交；E2E route-functional-suite 断言正则同步更新。

## Risks / Trade-offs

- [测试断言漏改导致 CI 红] → 全量 grep 新旧名，逐个断言文件更新；跑 i18n/组件/E2E helper 相关套件 + check-locale-sync。
- [素材模式名再次绑定流水线名（将来第三次更名又要改）] → 记为 Info，不扩大本次范围。
- [PRD 巨大单行文件批量替换误伤历史注记] → 用上下文精确匹配替换，替换后逐处 grep 复核；历史注记（含「原名…」句式）单独处理。
- [glossary 术语更新后旧名在 locale 中消失导致校验逻辑变化] → glossary.test.js 断言同步改新名，并验证 zh/en 两侧出现状态一致。

## Migration Plan

纯显示层更名，无数据迁移。回滚 = revert 本 change 的提交（机器 ID 与持久化契约未动，历史记录兼容）。

## Open Questions

无。
