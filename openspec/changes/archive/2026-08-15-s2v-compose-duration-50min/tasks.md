# Tasks: s2v-compose-duration-50min

- [x] 测试：更新常量断言 `10 * 60` / `15 * 60` → `50 * 60`（`story2video-compose-engine.test.js:115-116`）
- [x] 测试：新增预检边界用例（≤50 分钟通过预检进入片段合成；>50 分钟拒绝、错误含「50 分钟」、不进入片段合成）
- [x] 实现：`DEFAULT_MAX_DURATION_SECONDS = 50 * 60`
- [x] 实现：`DEFAULT_MAX_AUDIO_DURATION_SECONDS = 50 * 60`
- [x] 实现：成片/旁白/单段三处时长错误文案动态化
- [x] PRD：补充成片与旁白 50 分钟上限合同
- [x] 门禁：compose-engine 测试全绿 + QM-1 打包 + 双模型审查
- [x] 交付：PR #836 全绿合并回 main；OpenSpec 与 CCG task 归档
