# engine-w3 6.3 API 轨活体裁决——七层证据链（2026-09-28/29 六轮发布实测）

> 裁决结论：**API 轨未通过（spike not-go）**——本地接线七层中六层已修复合并，真实链已推进到
> `upload/complete`（签名 ✓、分片上传 ✓），剩余唯一阻塞是服务端对该请求的**裸 400（无响应体）**，
> 需网络级取证（对比真实浏览器 complete 请求）才能定位契约差异。DOM 轨六轮全部成功（发布链完全可用）。

## 六轮发布实测时间线（用户授权 CDP 代操作，间隔均 ≥18min）

| 轮次 | 时间 | API 轨表现 | 暴露层 | 修复 PR |
|---|---|---|---|---|
| 1 | 18:43 | `taskData.video.path required` | ① 形状翻译（裸 article 直传） | #2578 |
| 2 | 22:01 | `no signer injected` | ② 链缺省不走注册表 ③ registry 命令名不匹配 | #2580 |
| 3 | 22:48 | `bridge not injected` | ④ provider require 解析到门面（双模块陷阱） | #2582 |
| 4 | 23:31 | `missing sessionKey` | ⑤ opts 不传 accountId ⑥ bindSignerCookie 零调用方 | #2585 |
| 5 | 00:20 | **签名 ✓ 分片上传 ✓** → `upload/complete HTTP 400`（无体） | ⑦ 服务端契约差异（待网络级取证） | #2594（诊断增强） |
| 6 | 02:13 | 同上（400 无体确认——诊断增强实证响应体为空） | ⑦ 确认 | — |

每轮 DOM 轨兜底发布成功（作品 ID：3xvsedz34m82ppi / 3xfs9s628wkrp44 / 3xwdmnvysinp94e / 3xu9x8aypjhsque / 3xnvb9cqf6b23de / 3xh9ks8utgmqx9c）。

## 七层缺陷的根因与修复（全部 TDD + QM-1 + CI 全绿合并）

1. **形状翻译**（#2578）：RpaView API-first 裸传 article（扁平 video_path），适配器契约要 taskData.video.path（嵌套）→ 共享翻译器 `api-task-data.js`
2. **链缺省注册表**（#2580）：构造器文档契约「缺省走进程内注册表」从未实现 → `_sign` 回退 `registry.sign`
3. **registry 命令名**（#2580）：`ns-sig3-browser` 实现传 Tier-A 名，桌面注册的是带后缀本名 → 按注册名透传
4. **provider 双模块解析**（#2582）：`require('.../src/signer')` 解析到门面（不导出 browserPageProvider）→ setBridge 静默跳过（注册日志假绿）→ 直指 `src/signer/index`
5. **sessionKey 下传**（#2585）：签名页多账号隔离 fail-closed → opts 携带 accountId
6. **cookie 预绑**（#2585）：bindSignerCookie 零生产调用方（cookieStore 恒空）→ API-first 分支求签前预绑
7. **complete 400**（未修）：服务端裸 400 无响应体——诊断增强（#2594）实证；需对比真实浏览器 complete 请求（网络级取证）定位契约差异

## 6.3 任务裁决

**保持未勾**（spike not-go）：API 轨未完成发布。但裁决证据完整——七层中六层已修复（每层独立 PR + 回归锁），剩余一层精确画像（裸 400 无体）。下一轮诊断路径：网络捕获真实浏览器发布流的 complete 请求（headers/query/body 全量对比链的构造）。

## 附：同场验证的修复

- ImpactTracker `scheduleImpactTracking` 正常调度 + 基线快照落库（缺陷②，#2578）
- PublishMonitor kuaishou 干净 skipped（缺陷③，#2578）
