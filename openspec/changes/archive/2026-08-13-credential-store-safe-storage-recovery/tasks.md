# Tasks: credential-store-safe-storage-recovery

## 1. 新增回归测试（TDD，先于实现）
- [x] credential-store.test.js：masterkey 存在 + decryptString 抛错 + 无凭证 → getMasterKey 返回新密钥、文件为 safeStorage:v1:、saveCredential 成功且 round-trip
- [x] credential-store.test.js：masterkey 存在 + decryptString 抛错 + 有凭证文件 → getMasterKey 抛原始错误、saveCredential false、文件不被改写
- [x] credential-store.test.js：masterkey 存在 + decryptString 抛错 + safeStorage 不可用 → 抛原始错误（延续明文禁令）
- [x] credential-store.test.js：owners/ 命名空间下存在凭证时同样 fail-closed（递归扫描验证）

## 2. 实现（credential-store.js）
- [x] 新增 hasAnyCredentialFiles(credDir) 递归扫描 *.json.enc
- [x] getMasterKey() lastError 分支实现自愈重建（日志 error 级别，含原因与动作）
- [x] 不改 saveCredential/account-manager 契约

## 3. 验证
- [x] vitest run credential-store.test.js + account-manager.test.js（52 通过）
- [x] 相关模块测试：publishers/comment-manager/phase5-ipc/store/phase8（89 通过）+ publishers 目录（37 通过）
- [x] eslint 通过；质量节拍自检 + 归档（OpenSpec archive + CCG task 归档 + learnings 三同步）
