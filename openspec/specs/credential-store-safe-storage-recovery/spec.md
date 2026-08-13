# credential-store-safe-storage-recovery Specification

## Purpose
主密钥（safeStorage:v1: 包裹）存在但无法解密（DPAPI 状态变化/用户目录迁移）时，凭证库在无既有加密凭证的前提下自动重建主密钥，恢复账号添加能力；存在既有凭证时保持 fail-closed，绝不静默破坏数据或降级明文。
## Requirements
### Requirement: 无凭证时主密钥自愈重建
当 credentials/ 下存在 `.masterkey`（含 .bak）但所有候选均无法通过系统凭据保护解密时，若凭证库（递归含 owners/ 命名空间）中不存在任何 `*.json.enc` 加密凭证文件，且系统凭据保护可用，credential store SHALL 生成新的随机主密钥并通过系统凭据保护原子重建 `.masterkey` 与 `.masterkey.bak`，使后续 saveCredential 成功。

#### Scenario: 主密钥解密失败但库为空
- **WHEN** 用户添加账号且 masterkey 无法解密、库中无任何 *.json.enc
- **THEN** getMasterKey 重建主密钥，saveCredential 返回 true，新凭证可 round-trip 解密

#### Scenario: 重建过程记录可诊断日志
- **WHEN** 触发自愈重建
- **THEN** 以 error 级别记录原始解密错误与重建动作（不含敏感字段）

### Requirement: 有凭证时禁止破坏性重建
当凭证库中存在任何 `*.json.enc` 文件时，主密钥无法解密 SHALL fail-closed：抛出原始解密错误，saveCredential 返回 false，账号创建按既有契约回滚；禁止删除/覆盖主密钥或降级为明文存储。

#### Scenario: 主密钥解密失败且库中有凭证
- **WHEN** 库中存在既有加密凭证且 masterkey 无法解密
- **THEN** getMasterKey 抛出原始错误，saveCredential 返回 false，不写入、不删除任何文件

#### Scenario: 系统凭据保护不可用时拒绝明文
- **WHEN** safeStorage 不可用且 masterkey 无法解密
- **THEN** 保持既有行为：拒绝创建明文主密钥，抛出原始错误

