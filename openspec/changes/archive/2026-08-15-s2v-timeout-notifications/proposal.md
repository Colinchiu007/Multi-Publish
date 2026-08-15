## Why

Story2Video 已允许最长 50 分钟成片，但下游 concat、旁白、BGM、WebM 与输出校验仍沿用短片固定超时，导致合法长成片被隐性执行上限中断；同一批时长/合成超时错误在 renderer 又回退为“稍后再试”，用户无法区分需缩短内容还是可重试的合成超时。

## What Changes

- 将全片 ffmpeg 操作统一改为“媒体时长 × 阶段倍率 + 固定余量”，并按阶段设置最小/最大预算；无效时长回退阶段最小值。
- concat 使用预计拼接时长，旁白合并使用未含静音补齐的旁白预计总时长，BGM/WebM/输出校验使用预计最终成片时长；xfade 保留现有公式并增加硬上限。
- Story2Video 通知新增总时长超限、单段旁白超限、合成超时三个稳定 key；zh/en locale 成对，未知技术错误继续安全回退。
- 补齐动态预算、调用参数、错误归类、本地化与脱敏回归测试，并同步 PRD、视频创作 PRD、CHANGELOG、learnings 与质量门禁。

### 基线差异审计

- **已交付**：50 分钟产品上限、成片/旁白/单段预检、动态时长文案、片段编码动态超时、xfade 动态超时。
- **待办**：下游固定超时按时长缩放、xfade 最高上限、时长/合成超时通知映射及文档闭环。
- **待确认**：无。

## Capabilities

### New Capabilities

（无。）

### Modified Capabilities

- `story2video-compose-duration-limit`：把“下游固定 ffmpeg 超时”从已知限制改为有界动态预算合同，并加入 renderer 时长/合成超时通知要求。

## Impact

- `apps/desktop/electron/services/story2video-compose-engine.js` 及其单测。
- `apps/desktop/src/story2video/story2video-notifications.js`、通知单测和 `locales/zh.js` / `en.js`。
- `openspec/specs/story2video-compose-duration-limit` 的行为合同。
- `01-docs/PRD.md`、`01-docs/PRD-video-creation.md`、`CHANGELOG.md`、`01-docs/learnings.md`、`.quality-gates.md`。
- 无新增依赖，无 IPC/API 契约破坏，不改变 50 分钟产品上限。
