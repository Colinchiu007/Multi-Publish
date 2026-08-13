# 加密凭证主密钥解密失败时账号创建被永久阻断

## Why

用户添加抖音账号（扫码登录成功后）报「加密凭证保存失败，账号创建已回滚」。日志铁证：

```
CredentialStore Failed to save credentials for a3f80984:
  Error while decrypting the ciphertext provided to safeStorage.decryptString.
```

根因：`credentials/.masterkey`（safeStorage:v1: 前缀）已存在但 Electron safeStorage（Windows DPAPI）无法解密——典型于用户目录迁移、不同 Windows 用户上下文创建、或 DPAPI 状态变化。`getMasterKey()` 对 keyFile/.bak 全部解码失败后执行 `throw lastError`（fail-closed），`saveCredential` 返回 false，account-manager 回滚后端账号。用户凭证库中不存在任何 `*.json.enc` 文件（owners/ 为空），即当前状态下恢复主密钥不损失任何数据，但产品无自愈路径，账号功能被永久阻断。

## What Changes

- `apps/desktop/electron/services/credential-store.js` `getMasterKey()`：候选主密钥全部无法解密时，若凭证库（递归含 owners/）不存在任何加密凭证文件且系统凭据保护（safeStorage）可用，则生成新主密钥并原子重建 `.masterkey`/`.masterkey.bak`，恢复可用性；存在既有凭证或 safeStorage 不可用时保持 fail-closed（抛原始错误），禁止静默破坏既有数据或降级为明文主密钥。
- 新增辅助函数 `hasAnyCredentialFiles(credDir)` 递归扫描 `*.json.enc`。
- 修复在 `apps/desktop/electron/services/credential-store.test.js` 增加回归用例（解密失败+无凭证→自愈；解密失败+有凭证→fail-closed；恢复后 round-trip 可读）。
- 日志合同遵守 `.ccg/spec/observability/index.md`：error 级别记录原始错误原因与恢复动作，不打印敏感字段。

## Capabilities

### New Capabilities

- `credential-store-safe-storage-recovery`: 主密钥解密失败且库中无凭证时的自愈重建契约

### Modified Capabilities

<!-- 无 -->

## Impact

- `apps/desktop/electron/services/credential-store.js`（getMasterKey + 辅助函数）
- `apps/desktop/electron/services/credential-store.test.js`（新增 3 组回归用例）
- 不改 account-manager.js 对外契约（saveCredential 仍返回 boolean，回滚语义不变）
