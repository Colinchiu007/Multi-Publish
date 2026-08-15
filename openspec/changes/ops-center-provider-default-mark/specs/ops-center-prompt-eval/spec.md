# Ops Center Prompt Evaluation Specification — 模型密钥默认标记（delta）

## ADDED Requirements

### Requirement: 模型密钥「设为默认」按用途分组唯一
provider 密钥 SHALL 支持「设为默认」标记（`is_default`）；同一用途分组内至多一个密钥为默认。用途分组 SHALL 定义为：LLM=`minimax-llm`；视觉=`minimax-vision`、`opencode-go-vision`；生图=`minimax-image`、`flux`、`hunyuan`。管理员通过 `PUT /api/v1/prompt-eval/providers/{key_id}/default` 设置默认，服务端在同一事务内将同分组其他密钥默认标记清 0。

#### Scenario: 设置默认并同分组唯一
- **WHEN** admin 对视觉分组某密钥（如 minimax-vision / MiniMax-M3）调用 `PUT /providers/{key_id}/default`
- **THEN** 返回成功；该密钥 `is_default=1`；同分组其他密钥 `is_default=0`；列表仅该密钥显示默认标记

#### Scenario: 跨分组默认互不影响
- **WHEN** admin 设置生图分组某密钥为默认，而 LLM/视觉分组已有默认
- **THEN** 仅生图分组内默认标记被重排，LLM/视觉分组的默认保持原样

#### Scenario: 权限与存在性校验
- **WHEN** 非 admin 调用设为默认，或 key_id 不存在
- **THEN** 分别返回 403 / 404，数据不变

### Requirement: 默认键的有效性约束
SHALL 仅允许启用中的密钥被设为默认：对禁用（`enabled=0`）密钥设置默认 SHALL 返回 HTTP 400 并给出可操作提示。禁用或删除当前默认键时，其默认标记 SHALL 被清空且不自动转移到其他密钥（选择链路回退到「最新启用」）。

#### Scenario: 禁用密钥拒绝设默认
- **WHEN** admin 对 `enabled=0` 的密钥调用设为默认
- **THEN** 返回 HTTP 400，提示先启用，默认标记不变

#### Scenario: 禁用/删除默认键后清空
- **WHEN** 当前默认键被禁用（编辑 enabled=0）或被删除
- **THEN** 该键默认标记清空；同分组其他密钥默认标记保持，选择链路回退最新启用

### Requirement: 默认键被选择链路优先使用
LLM（中英对照优化/翻译）与视觉评估的选择链路 SHALL 优先使用其分组内 `is_default=1` 的启用密钥；分组内无默认时回退到现有「最新启用」逻辑。新保存的密钥在其分组尚无默认时 SHALL 自动成为默认。

#### Scenario: LLM 选择优先默认
- **WHEN** minimax-llm 分组存在多个启用密钥且其中一个 `is_default=1`
- **THEN** `get_llm_key` 返回默认密钥（而非最新更新的非默认密钥）

#### Scenario: 视觉选择优先默认
- **WHEN** 视觉分组存在默认密钥（无论 minimax-vision 或 opencode-go-vision）
- **THEN** `get_vision_key` 返回该默认密钥

#### Scenario: 新键自动默认
- **WHEN** admin 保存一个新 provider+model 密钥，且其分组尚无任何默认
- **THEN** 新密钥自动 `is_default=1`，列表可见默认标记
