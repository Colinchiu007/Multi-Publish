## Purpose
提示词评测 provider 密钥的管理契约：加密存储、连通性探测、CRUD（含删除）。删除按 id 物理删除，删除后回退查找立即失效。

## ADDED Requirements

### Requirement: 模型密钥可被管理员删除
管理员 SHALL 能删除已保存的 provider 密钥条目；`DELETE /api/v1/prompt-eval/providers/{key_id}` 按 id 物理删除。非 admin 返回 403；id 不存在返回 404；删除后列表与 LLM/视觉密钥回退查找均不再返回该条目；同一 provider+model 可重新保存。

#### Scenario: 管理员删除密钥
- **WHEN** admin 调用 `DELETE /providers/{key_id}` 删除已保存的 minimax-llm 密钥
- **THEN** 返回成功，列表不再包含该项，`get_llm_key` 不再返回该密钥

#### Scenario: 权限与存在性校验
- **WHEN** 非 admin 调用删除，或删除不存在的 key_id
- **THEN** 分别返回 403 / 404，数据不变

#### Scenario: 删除后可重建
- **WHEN** 删除某 provider+model 后再次保存相同 provider+model
- **THEN** 新条目正常创建（唯一约束不冲突）
