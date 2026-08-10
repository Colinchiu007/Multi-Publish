# Review: story2video-bgm-i18n-single-source (Claude 独立审查)

- 后端：claude（codeagent-wrapper）；antigravity 降级（agy 缺失，2026-08-10 记录）。
- 结论：**Critical 0**。

## 合入前已修复（审查发现）

- Major1 compose-engine.js:566 陈旧注释（"供前端提示"）与新约定矛盾 → 更新为单一来源契约说明。
- Major2 data.warnings 语义变化（中文→机器码）无契约标记 → compose() JSDoc 补 warnings/bgmSkippedReason 语义说明。
- Minor1 机器码断言仅覆盖 2/4 → format_unsupported / not_allowed / 混音期降级用例补 warnings 断言 + 无中文字符防回退。
- Minor2 码形约定 → 注释明确 `bgm_<reason>` 与前端 BGM_SKIP_REASON_TEXT reason 键一一对应。
- Minor3 命名碰撞脚枪 → 注释明确 renderer 不得把 warnings 当输入（bgmSkippedReason 才是权威码）。

## 记录为后续项（不阻塞）

- Info：W3「服务层不硬编码中文」原则仅应用于 BGM 跳过警告；引擎进度 message/部分 IPC 错误仍为中文，repo-wide 扩展为独立议题。
- Minor4：Minor9 注释随本 PR 附带（属既有不变式文档，可接受）。
