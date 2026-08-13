# requirements.md — 加密凭证保存失败，账号创建已回滚

## 用户报告
账号管理 → 添加账号 → 选择抖音 → 扫码登录成功后，报错「加密凭证保存失败，账号创建已回滚」。

## 日志铁证
```
[2026-08-13T15:08:11.044Z] [ERROR] CredentialStore Failed to save credentials for a3f80984:
  Error while decrypting the ciphertext provided to safeStorage.decryptString.
[2026-08-13T15:08:11.064Z] [ERROR] Auth Login failed for douyin: 加密凭证保存失败，账号创建已回滚
[2026-08-13T15:08:11.066Z] [INFO] PythonBackend ... DELETE /api/accounts/a3f80984 ... 200
```
日志路径：`C:\tmp\Multi-Publish-debug-profile\logs\app-2026-08-13.log`（dev 实例 userData）。

## 根因
- `credentials/.masterkey`（safeStorage:v1: 前缀，Electron safeStorage/DPAPI 包裹 AES-256 主密钥）已存在（08-12 创建），但当前会话 safeStorage.decryptString 解密失败（DPAPI 状态变化/用户目录迁移/不同用户上下文创建）。
- `getMasterKey()`（credential-store.js:158-160）对 keyFile/.bak 全部解码失败后 `throw lastError`（fail-closed）→ `saveCredential` 返回 false → account-manager 按契约回滚后端账号。
- 用户凭证库 `credentials/`（含 owners/ 命名空间）无任何 `*.json.enc`——旧主密钥未加密任何数据，本可安全重建却永久阻断账号功能。

## 修复
- credential-store.js `getMasterKey()`：lastError 分支新增自愈——`hasAnyCredentialFiles(credDir)` 递归（含 owners/）确认无任何 *.json.enc 且 safeStorage 可用时，生成新随机主密钥并原子重建 .masterkey/.bak（error 日志记录原因+动作）；有凭证或 safeStorage 不可用时保持 fail-closed（延续明文主密钥禁令）。
- 回归测试 5 组（根目录/owners 空库自愈、根目录/owners 有凭证 fail-closed、safeStorage 不可用 fail-closed）。
- 不改 saveCredential/account-manager 契约与回滚语义。
