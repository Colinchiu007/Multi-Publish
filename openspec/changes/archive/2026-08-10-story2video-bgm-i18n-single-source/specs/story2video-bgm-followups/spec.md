## Purpose

细化 BGM 降级的原因区分与可读提示、收窄 API-Key 错误归类、清洗多模态 models 回填、为 selected-media 导入文件提供老化回收，作为 PR #460 的审查后续闭环。

## MODIFIED Requirements

### Requirement: BGM 降级区分原因并返回机器可读码

compose 对不可用 BGM 降级时 SHALL 区分 `size_exceeded`（可读但超单文件上限）、`format_unsupported`（扩展名不支持）与 `unreadable`（缺失/不可读/越界/符号链接），结果 data 携带 `bgmSkippedReason` 机器可读码与 `warnings`（机器码数组，如 `bgm_size_exceeded`/`bgm_unreadable`，**不含用户可见文案**）；总输入大小超限 MUST 仍硬失败。用户可见文案 SHALL 由前端依据 `bgmSkippedReason` 本地化（单一 i18n 来源，服务层不硬编码中文）。

#### Scenario: 单文件超限

- **WHEN** BGM 文件存在、可读且大小超过 BGM 单文件上限
- **THEN** compose 返回 `code === 0`、`bgmSkippedReason === 'size_exceeded'`，warnings 含 `bgm_size_exceeded` 机器码

#### Scenario: 缺失/不可读

- **WHEN** BGM 文件不存在或不可读
- **THEN** compose 返回 `code === 0`、`bgmSkippedReason === 'unreadable'`，warnings 含 `bgm_unreadable` 机器码
