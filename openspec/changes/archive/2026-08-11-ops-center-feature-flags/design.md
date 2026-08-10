## 设计

### 数据模型
`feature_flags`：key（主键，`^[A-Za-z0-9_.-]{1,128}$`）/ value_type（string|boolean|number）/ value（存储字符串，下发时按类型解析）/ description / enabled（0|1）/ updated_at / updated_by。

### 端点
- 管理：`GET /api/v1/feature-flags`（登录读）、`POST`（admin，重复 key → 409）、`PUT /{key}`（admin，不存在 → 404，部分更新）、`DELETE /{key}`（admin，不存在 → 404）。
- 校验：key 字符集；value_type 枚举；boolean value ∈ true/false/1/0；number value 可解析数字。
- 运行时：`GET /api/v1/runtime/bootstrap` 增加 `feature_flags` = `{key: typed_value}`（enabled=1）。

### 种子
`videoCreation.maxOutputResolution`：string，'1080p'（默认禁止 4K），描述输出分辨率能力开关（PRD 7.1.20）。已存在即跳过。

### 桌面端
- `OpsCenterSync`：运行时状态新增 `featureFlags`（applyRuntime 从 `payload.feature_flags` 应用；仅接受基本类型值，结构非法/超 100 项 → 空对象 fail-closed；持久化 opsCenterRuntime；重启恢复）；`getFeatureFlag(key)` 供主进程/引擎读取；`getRuntimeState()` 暴露给渲染端（现有 `opsCenterSyncRuntime` IPC）。
- 4K 能力开关读取优先级：`MAX_OUTPUT_RESOLUTION` 环境变量 → 运营功能开关（phase1 注入 `setFeatureFlagProvider(opsCenterSync.getFeatureFlag)`）→ store 设置 → 默认 1080p（fail-closed）。
- 引擎：`Story2VideoComposeEngine` 支持 `getMaxOutputResolution` 惰性读取（每次 compose/renderSegment 能力校验时取当前值）；构造期静态 `maxOutputResolution` 兜底。
- 渲染端：CreateView `loadMaxOutputResolution` 优先读 `opsCenterSyncRuntime().featureFlags` → store → 默认。
