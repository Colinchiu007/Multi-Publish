# Design: 主密钥解密失败自愈

## 背景

`getMasterKey()`（credential-store.js:125-165）当前行为：keyFile/.bak 候选全部解码失败 → `if (lastError) throw lastError`。对「DPAPI 状态变化但库中无任何凭证」的场景，这是永久性功能阻断且无自愈路径。

## 方案

### getMasterKey() lastError 分支（credential-store.js:158-160）

```
if (lastError) {
  // 1. 库中存在任何 *.json.enc（含 owners/ 递归）→ fail-closed，抛 lastError（防止破坏既有加密凭证）
  // 2. safeStorage 不可用 → fail-closed，抛 lastError（延续「拒绝明文主密钥」安全姿态，见测试 '系统凭据保护不可用时拒绝创建可被离线解密的主密钥'）
  // 3. 否则：log.error 记录原错误 + 重建动作 → 生成新随机主密钥 → writeMasterKeyFiles() 原子重建 keyFile/.bak → 返回新密钥
}
```

### 辅助函数 hasAnyCredentialFiles(credDir)

- 递归遍历 credDir（含 owners/<sha256>/ 子目录）
- 仅统计 `*.json.enc` 文件，忽略 `.masterkey*`、`.tmp.*` 与目录
- 无凭证 → 可安全重建（旧主密钥未加密任何数据，丢失无代价）

### 不改动

- `saveCredential`/`loadCredential` 契约（仍返回 boolean/null）
- `account-manager.js` 回滚语义（POST → saveCredential false → DELETE → 抛错）
- 明文主密钥禁令、原子写（tmp+rename）、Windows 有界重试

## 备选方案（否决）

1. **safeStorage 不可用时回退明文主密钥**：否决——违反既有安全审计决策（`encodeMasterKey` 硬性抛错 + 测试固化）
2. **解码失败时删除 .masterkey 强制重建**：否决——有凭证时会造成静默数据丢失；本方案以 `hasAnyCredentialFiles` 精确区分
3. **升级到浏览器级 encrypted-storage 分离密钥**：超出本次 Bug 范围，记入 learnings 备选

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 并发实例同时重建主密钥 | 原子写 + 后写覆盖；两实例生成各自密钥时后写者生效，但库中无凭证即无既有数据可损 |
| 加密可用但解密失败的罕见 DPAPI 双向损坏 | writeMasterKeyFiles 抛错 → saveCredential false → 既有回滚路径 + error 日志含原因 |
| owners/ 有凭证但根目录无 | hasAnyCredentialFiles 递归覆盖 owners/，不会误重建 |
