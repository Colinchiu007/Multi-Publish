# 代码审查报告 — smart-tag-suggest-v2（智能标签建议优化）

## 审查方式

- **opencode 审查**：已完成（C:/tmp/review_opencode_out2.txt），对全量 diff + 新增模块做了只读审查，并执行 122 个相关测试 + 真实数据模拟验证。
- **Claude 审查**：**未完成**。codeagent-wrapper.exe --backend claude 持续返回 inference gateway 500 服务器错误（127.0.0.1:15721），重试 10 次仍在循环，最终判定为 **Claude 后端可用性问题，非代码问题**。
- **结论依据**：以 opencode 审查报告 + 修复后的全量测试作为审查依据。

## 审查结论

**无 Critical 级问题。** 架构清晰、fail-closed 校验与回退设计到位，无安全/崩溃级问题。

opencode 发现 1 个 MAJOR（W1）+ 7 个 Warning（W2-W8），均已修复并验证。

## 问题与修复对照

| 编号 | 严重度 | 问题描述 | 修复状态 |
|------|--------|----------|----------|
| W1 | MAJOR | 热度角标在 hash 平台（weibo/xiaohongshu/douyin）永不渲染：matchedTopics 用 store 原始 tag，渲染用 applyPrefix，hotHeat 精确匹配失败 | 已修复：matchedTopics[p] 改用 applyPrefix 渲染形态 |
| W2 | Warning | calibrated 只在热填分支置 true，正常命中热门库时保持 false | 已修复：traffic 命中热门库即置 true |
| W3 | Warning | suggestions.fallback 死字段（Vue 渲染但后端不设置） | 已修复：LLM 路径 false，回退路径 true |
| W4 | Warning | 内容标签未保留 max-2 流量位 | 已修复：content slice(0, max-2)，traffic slice(0, 2) |
| W5 | Warning | relatedTerms 恒为空（旧 Reddit/HN 搜索被移除） | 有意取舍，已在 PRD 4.4.1 明确 |
| W6 | Warning | _extractKeywords 变死代码 + 两套摘词实现漂移 | 已在 PRD 4.5 明确唯一实现为 fallback-extractor |
| W7 | Warning | formatUserError 未使用 import | 已修复：删除未使用 import |
| W8 | Warning | LLM 失败静默吞错 | 已修复：index.js + content-intelligence-analysis.js 的 catch 均加 log.warn |

## 修复后验证

- tag-suggest 模块测试：76 个通过
- content-intelligence.test.js：33 个通过（source 断言更新）
- phase1-context.test.js：13 个通过
- TagSuggester.test.js：16 个通过（mock 数据改为真实后端形态）
- publisher.test.js + ipc-handlers.test.js：236 个通过
- 合计受影响测试：374 个通过

## 遗留 Info 项（非阻塞，记录备查）

1. TagSuggester.vue loading 文案依赖旧状态（重分析加载中显示上一次结果的文案）。
2. 回退路径平台支持不一致：fallback 只支持 DEFAULT_PLATFORMS，LLM 路径支持 douyin/wechat_mp。
3. 组件内仍有硬编码文案，CI Gate 7 只拦新增字面量。
4. calibrator 模糊匹配对 2-4 字中文词敏感（编辑距离 ≤1 易误匹配）。
5. 测试缺口：content-intelligence.test.js 只覆盖无 aiGenerator 的 extractor 路径，缺 LLM 分支集成用例。

