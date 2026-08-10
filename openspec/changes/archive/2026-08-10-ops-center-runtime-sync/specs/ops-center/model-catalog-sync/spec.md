## Purpose
ops-center 提供只读模型目录同步端点，供桌面端拉取运营配置（限流/模型/能力），解除「种子手工对齐」。

## ADDED Requirements

### Requirement: 只读目录同步端点
ops-center 必须提供 `GET /api/v1/model-presets/catalog`：以 `X-Catalog-Key` 头鉴权（`OPS_CATALOG_API_KEY` 常量时间比较）；未配置 key → 404；错误 key → 401；成功返回 is_visible=1 的完整目录（id/name/category/base_url/models/default_model/rate_per_minute/limit_per_5h/capabilities/capability_models/updated_at），不含敏感字段。

#### Scenario: 正确 key
- **WHEN** 携带正确 X-Catalog-Key
- **THEN** 200 返回目录数组（仅 is_visible=1）

#### Scenario: 未配置或错误 key
- **WHEN** OPS_CATALOG_API_KEY 未配置 或 key 错误
- **THEN** 404（未配置）/ 401（错误），不泄露端点存在性

### Requirement: 目录数据自洽
目录项必须满足：default_model ∈ models（非空时）、rate_per_minute/limit_per_5h 为 null 或正整数、多模态 capabilities/capability_models 完整。

#### Scenario: 自洽校验
- **WHEN** 返回目录
- **THEN** 每项通过自洽断言（与 test_catalog_facts_consistency 一致）
