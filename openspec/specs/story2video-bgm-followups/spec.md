# story2video-bgm-followups Specification

## Purpose
细化 BGM 降级的原因区分与可读提示、收窄 API-Key 错误归类、清洗多模态 models 回填、为 selected-media 导入文件提供老化回收，作为 PR #460 的审查后续闭环。
## Requirements
### Requirement: BGM 降级区分原因并返回机器可读码

compose 对不可用 BGM 降级时 SHALL 区分 `size_exceeded`（可读但超单文件上限）、`format_unsupported`（扩展名不支持）与 `unreadable`（缺失/不可读/越界/符号链接），结果 data 携带 `bgmSkippedReason` 机器可读码与 `warnings`（机器码数组，如 `bgm_size_exceeded`/`bgm_unreadable`，**不含用户可见文案**）；总输入大小超限 MUST 仍硬失败。用户可见文案 SHALL 由前端依据 `bgmSkippedReason` 本地化（单一 i18n 来源，服务层不硬编码中文）。

#### Scenario: 单文件超限

- **WHEN** BGM 文件存在、可读且大小超过 BGM 单文件上限
- **THEN** compose 返回 `code === 0`、`bgmSkippedReason === 'size_exceeded'`，warnings 含 `bgm_size_exceeded` 机器码

#### Scenario: 缺失/不可读

- **WHEN** BGM 文件不存在或不可读
- **THEN** compose 返回 `code === 0`、`bgmSkippedReason === 'unreadable'`，warnings 含 `bgm_unreadable` 机器码

### Requirement: API-Key 错误归类限定与英文覆盖

API-Key 错误正则 SHALL 仅在 api-key 上下文内匹配 `decrypt failed|解密失败`，并覆盖 `Missing API key` / `api key required` / `No API key` 等英文表述，全部映射到 `MODEL_API_KEY_REQUIRED`。

#### Scenario: 非 key 解密错误不误归类

- **WHEN** 错误为项目文件解密失败（无 api-key 上下文）
- **THEN** 不映射到 `MODEL_API_KEY_REQUIRED`（按既有 fallback 处理）

#### Scenario: 英文缺失 key

- **WHEN** 错误包含 `Missing API key`
- **THEN** 映射到 `MODEL_API_KEY_REQUIRED`

### Requirement: 多模态 models 回填清洗

多模态 models 回填 SHALL 对存量项 trim、过滤空串并去重后合并；预设下架模型残留（只增不删策略）在代码注释中记录人工迁移路径。

#### Scenario: 存量脏数据

- **WHEN** 存量行 models 含 `" model-x "` 与 `""`
- **THEN** 合并后不产生 trim 重复项与空串

### Requirement: selected-media 老化回收

导入媒体目录 SHALL 提供老化回收：超过默认 7 天、且为普通非符号链接文件的条目在启动时被清理；回收失败 MUST 静默降级（不阻塞启动）。被回收的 BGM 在后续运行中经 compose 降级路径处理，不得硬失败。

#### Scenario: 过期文件被回收

- **WHEN** `selected-media` 内普通文件 mtime 超过 maxAgeMs
- **THEN** 该文件被删除，返回已清理数量

#### Scenario: 新鲜文件保留

- **WHEN** 文件 mtime 在 maxAgeMs 内
- **THEN** 文件保留

