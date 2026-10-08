# 批次 C（M-9）侦察备忘 —— main 时效性核验结果（2026-10-08，基线 2809128e）

> 本文档第一版写入后因共享根写保护与会话竞态丢失（未进 git 对象），此为凭
> 会话记录重建的第二版。结论与第一版一致；批次 C 的改动已落地并经反证验证，
> 本文档保留作 §13 时效性核验的过程证据。

## 报告 M-9 的三条缺陷，main 上的现状（动手前核验）

### ① 9 份独立 getApi() —— 仍在，防御强度不一

| 文件 | getApi 定义 | 守卫形态 | direct-calls | toPlainIpcValue |
|---|---|---|---|---|
| electron-bridge.js | ✅（真源） | `typeof window !== 'undefined' &&` | — | 有 |
| identity.js | 独立 | `window.electronAPI \|\| null` | 6 | 0 |
| services.js | 独立 | 同上 | 2 | 0 |
| model-providers.js | 独立 | 同上 | 11 | 0 |
| providers.js | 独立 | 同上 | 8 | 0 |
| ops-center-sync.js | 独立 | 同上 | 7 | 0 |
| cloud-publisher.js | 独立 + `_api` 模块级缓存 | `window.electronAPI \|\| null` | 0 | 0 |
| tts-voice-catalog.js | 无（直引 window.electronAPI.ttsVoice） | ns 子对象检查 | 0 | 2 |
| tts-voice-clone.js | 无（直引 ttsVoiceClone） | ns 子对象检查 | 0 | 2 |

要点：报告「4 个文件无守卫」的结论已过时（#2952 后有人补了 `|| null`），
但 8 份重复 getApi + 绕过脱壳 + 零 invokeWithFallback 依然成立。

### ② API Key 直传不脱壳 —— 仍在（最高风险项）

model-providers.js（Create/Update）与 providers.js（Create/SetUserKey）
直接 `api.X(data)` 传 reactive 表单对象，**含 API Key**。

### ③ publisher.js 绕过 —— 报告 3 处，实为 4 处

531/555/558/567 直访 window.electronAPI：extractVideoCover / generateAiCover /
listPlatformCollections / creatorPendingTotal（第四处是报告之后新长的，
证明没有机械守卫必然复发）。

### ④ 契约测试（#2952 落地）SCAN_DOMAIN 只含 5 文件

automation / hot-topics / knowledge-library / publisher / rate-limit。
8 个 getApi 文件不含 `invoke(` 字面，从域守卫判据的缝里漏掉。

## 执行蓝图（已按此落地）

1. 扩契约测试 SCAN_DOMAIN + 判据（invokeWithTimeout/invokeNamespace/window.electronAPI）；
2. 统一 getApi 真源（electron-bridge 导出）；
3. API Key 链路走 invokeWithFallback 脱壳；
4. publisher 四处绕过改桥接层（fallback 按调用语义逐个定）；
5. 反证：拼错方法名 ⇒ 对账点名；注入直访 ⇒ M-9 守卫点名。
