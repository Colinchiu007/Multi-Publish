# Tasks: story2video-bgm-i18n-single-source

## 1. 服务层单一来源

- [x] `story2video-compose-engine.js`：`BGM_SKIP_WARNING_CODES`（机器码），warnings 只含机器码 + 注释/JSDoc 单一来源契约
- [x] `story2video-paths.js`：Minor9 注释
- **测试目标**：compose-engine.test.js（warnings 断言改机器码）

## 2. 规格

- [x] `story2video-bgm-reuse` spec：warnings 语义更新（机器码，不含用户可见文案）（机器码，不含用户可见文案）

## 3. 门禁与交付

- [x] 受影响 vitest 套件全绿（compose-engine + paths 103 用例，含 4 码断言与无中文防回退）
- [x] 双模型审查（Claude Critical 0，Major1-2 + Minor1-3 已修复；antigravity 降级记录）
- [x] PR #468 已合并回 main（merge 2e2ac3f2，CI 全绿）；本归档为三同步
