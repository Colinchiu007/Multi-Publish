# Tasks

## tts-voice-catalog-error-handling

- [x] **T1 service 错误分类**：tts-voice-service.js 新增 `VOICE_CATALOG_CONFIG_UNAVAILABLE`，配置类关键词判定；其余保持 `VOICE_CATALOG_UNAVAILABLE`；失败不写缓存
  - 测试：`tts-voice-service.test.js` — 缺 key → CONFIG；网络 → UNAVAILABLE；均断言不写缓存（spec 场景：配置类/瞬时类）
- [x] **T2 detail 脱敏透传**：failure 携带 `{ reason, detail }`，detail 截断 ≤200；敏感 message 脱敏为分类短语
  - 测试：`tts-voice-service.test.js` — detail 长度上限；'Bearer token leaked by upstream' 不回显（spec 场景：脱敏透传）
- [x] **T3 失败日志**：service 目录失败路径 log.warn（provider/model/脱敏原因）；IPC handler catch 分支记录日志
  - 测试：`tts-voice-service.test.js` 断言 logger 调用（provider/model 存在、不含 api_key 原文）（spec 场景：失败路径日志）
- [x] **T4 前端映射与刷新按钮**：friendlyVoiceCatalogError 增加 CONFIG 中英文映射（泛化文案）；「刷新音色列表」按钮仅瞬时/未知错误可见，触发 `loadS2VVoiceData({ refresh: true })`
  - 测试：`CreateView.test.js` — CONFIG 映射文案断言；CONFIG 不显示刷新按钮；瞬时错误按钮点击触发 refresh:true 调用（spec 场景：前端可操作提示与刷新入口）
- [x] **T5 既有断言迁移**：拆分 `tts-voice-service.test.js:206-215` 对 `callAdapter code!=0 → UNAVAILABLE` 的断言到 CONFIG/UNAVAILABLE 两分支
- [x] **T6 验证门禁**：定向 Vitest + CreateView.test.js 全绿；`vite build` 通过；QM-1 本地打包（electron-builder --win --dir）通过；双模型审查无 Critical
- [x] **T7 文档**：CHANGELOG、01-docs/learnings.md（本 Bug 复盘）、PRD 错误提示合同补充
- [x] **T8 交付**：提交 → 推送 → PR → 合并 → openspec archive + CCG task 归档三同步
