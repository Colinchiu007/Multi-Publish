# review.md — 模型 API 调用并发/排队/限流机制文档补充

## 审查方式
- 双模型审查探测：antigravity 后端返回「区域不可用」（geo-blocked，Eligibility check failed）；Claude wrapper（CLAUDE_CODE_GIT_BASH_PATH=D:\Program Files\Git\usr\bin\bash.exe + SDK PATH + --lite）两次 exit 1 无诊断；子代理后端 403。
- 按机制硬化规则（区块 4）降级为**主代理本地逐条核验**，不冒充双模型通过。

## 本地核验结论（与代码/UI 原文比对）
| 文档声明 | 代码/UI 出处 | 结果 |
|----------|--------------|------|
| 预算链 config>DB种子>静态表>类别默认 | model-call-scheduler.js:50-69（resolveProviderBudget）；model-provider-manager.js:106-138（_applyGovernorLimits）；model-provider-seeds.js:390-429（PRESET_RATE_LIMITS）；governor-provider-limits.js:16-80；api-usage-governor.js:29-36（DEFAULT_LIMITS） | ✅ 一致 |
| 显式清空回退 | model-provider-manager.js:846-899（applyCatalog：rpm===null delete config） | ✅ 一致 |
| 时序 30s/180s/45s | api-usage-governor.js:22-24（MAX_QUEUE_WAIT_MS/MAX_PACE_WAIT_MS/MAX_COOLDOWN_WAIT_MS） | ✅ 一致 |
| 429×0.75 / +0.05 / 下限 0.2 / max(2,…) | api-usage-governor.js:26-27,264-266,377 | ✅ 一致 |
| 并发 clamp(rpm/10,1,4)；video/audio 未配置=1 | model-call-scheduler.js:58-65 | ✅ 一致 |
| 5h 窗口 field=requests | model-provider-manager.js:126-131 | ✅ 一致 |
| 桌面端提示文案 | ModelProviders.vue:55,405,451-453；useModelProviderCrud.js:312-323 | ✅ 逐字一致 |
| ops-center 提示文案/列 | ModelPresets.vue:41-43,95-100,305-310；model_preset_service.py:68-86（_validate_optional_positive_int） | ✅ 逐字一致 |
| catalog 输出形状 | model_preset_service.py:747-771（_to_catalog_item） | ✅ 一致 |
| 重入保护/单层收敛 | api-usage-governor.js:42,（AsyncLocalStorage）_reentrant；openspec spec 既有 Requirement | ✅ 一致 |

## 发现并修复
- 既有文档 3 处 `[0,100000]`/`[0,10000000]` 范围笔误（代码实际拒绝 0，合法范围 [1,…]）→ 已修正为 `[1,100000]`/`[1,10000000]`（PRD §7.4.4.1、ops-center PRD §12A.10 两处）。
- CHANGELOG.md 残留 `>>>>>>> 8aaa96d4 ...` 冲突标记行（#533 合入带入）→ 已清理。

## 结论
- Critical：0；Warning：0（外部双模型不可用已记录为降级）；Info：既有文档范围笔误已修正。
- 测试：桌面 3 文件 37 用例全绿；ops-center model_presets/catalog 31 用例全绿。
