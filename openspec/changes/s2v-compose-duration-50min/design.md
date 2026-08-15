# Design: s2v-compose-duration-50min

## 现状

- `DEFAULT_MAX_DURATION_SECONDS = 10 * 60`（600s）：成片总时长上限，compose 预检按 ffprobe 实测旁白音频总时长校验，超限返回「成片总时长不能超过 10 分钟」（`story2video-compose-engine.js:66,704-705`）。
- `DEFAULT_MAX_AUDIO_DURATION_SECONDS = 15 * 60`（900s）：旁白音频总时长上限（`:67,701-702`）。
- `DEFAULT_MAX_SEGMENT_DURATION_SECONDS = 3 * 60`（180s）：单段旁白上限（`:68,715-716`）。
- 错误文案硬编码分钟数；前端 `story2video-notifications` 无时长类错误映射，回退 `UNKNOWN_ERROR` 通用文案（本次不改前端映射，见范围）。

## 方案

- 常量：`DEFAULT_MAX_DURATION_SECONDS = 50 * 60`；`DEFAULT_MAX_AUDIO_DURATION_SECONDS = 50 * 60`；`DEFAULT_MAX_SEGMENT_DURATION_SECONDS = 3 * 60` 保持不变。
- 文案动态化：成片/旁白/单段三条中文错误消息与声明时长/运行时累计两条英文错误消息均由 `formatDurationLimit`/分钟数计算拼入上限值，禁止硬编码；非整分钟上限按「X 分 Y 秒」格式化，避免 `Math.round` 误导。
- 检查顺序：成片总时长检查先于旁白总时长检查（默认两上限一致，保证超限输入返回「成片总时长不能超过 X 分钟」；旁白检查仅当旁白上限更严时可达）。
- 不新增配置入口：保持构造期默认，与现状一致；如需运营可配置上限，另行立项走 ops-center 开关。
- 测试（TDD）：更新常量断言；新增预检边界用例——总时长 ≤3000s 通过预检进入片段合成、>3000s 拒绝且错误含「50 分钟」且不调用片段合成；恰 3000s 通过/3000.1s 拒绝；旁白上限更严时返回旁白文案。

## 备选

- 只改 600→3000、不动 15 分钟旁白上限：30-50 分钟成片仍会被旁白预检拦截，不满足需求，否决。
- 运营后台可配置上限：本期范围外，PRD 另行立项。
