# 审查记录 — s2v-retry-content-policy-message

> 双模型审查流程：Antigravity 地区资格不可用（`Eligibility check failed ... not available in your location`），按既有惯例降级为 Claude 完整审查 + 主代理复核。

## 首轮（Claude，2026-08-16）

### Critical / Major（已全部修复）

| 级别 | 问题 | 修复 |
|------|------|------|
| Critical | empty_result 消息曾内嵌 "content-policy" 字样，渲染层模式再次自触发内容审查映射 | `needsUserInputMessage(checkpoint)` 单一来源；empty_result 消息不再含 content-policy 字样 |
| Critical | stages.js 存在三处平行硬编码 content-policy 消息 | 三处（748/799/2351）统一改用 `needsUserInputMessage(checkpoint)` |
| Major | MiniMax 真实额度文案「已达到 Token Plan 用量上限」未被渲染层映射 | `QUOTA_EXCEEDED_PATTERN` 增补 `(?:用量|Token\s*Plan|额度).{0,24}(?:上限|超|耗尽|用尽|用完)` 与 usage limit / plan expired / upgrade 子句 |

## 第二轮（Claude 复审，2026-08-16）

### Critical #1：历史页空结果失败误标内容政策（已修复）

`RESUME_BLOCKING_ERROR_PATTERN` 增补 empty-result 短语后，`contentPolicyScenes` 与 `CreateViewHistory.vue:382 policyResumeBlockedText` 复用同一模式，历史页会把空结果失败标为「该任务包含内容政策拦截的素材」。

修复：`history-utils.js` 新增 `CONTENT_POLICY_ERROR_PATTERN`（内容政策子集，不含 empty_result 短语）；`POLICY_SCENE_PATTERN` 与 `CreateViewHistory.policyResumeBlockedText` 改用子集；门控正则保留 empty-result 短语。回归：`history-utils.test.js` 断言子集不命中空结果短语、空结果错误 `contentPolicyScenes('')` 且门控仍拦截。

### Critical #2：重试弹窗 empty_result 仍显示通用失败文案（已修复）

`ResultView.vue retrySegment` 只透传错误文本，渲染层无 EMPTY_RESULT 类别 → `operation_failed`。

修复：`story2video-notifications.js` 新增 `EMPTY_RESULT` key + 模式（`repeatedly returned no result|多次未返回结果`，位于 CONTENT_POLICY 检查之前）+ 场景号插值；locales zh/en 成对新增 `empty_result` 文案；`notifications.test.js` 原把 OPERATION_FAILED 固化为期望的用例改断 EMPTY_RESULT；`ResultView.test.js` 补 empty_result 弹窗用例。

### Warning #3：适配器 isAuth 裸 `api key` 过宽（已修复）

「您的 API Key 额度已用完，请升级套餐」会误判 AUTH_FAILED（应为 QUOTA_EXCEEDED）。

修复：`minimax-image.js` isAuth 收紧为 `api[ _-]?key[^\n]{0,24}(?:invalid|expired|失效|过期|无效|错误|不正确)` 等邻近失效信号；新增「含 API Key 的额度文案 → QUOTA_EXCEEDED」回归用例。

### Warning #4：认证表述覆盖不全（已修复）

适配器与渲染层均不识别 `Authentication failed` / `Invalid authentication credentials` / `token invalid`。

修复：两侧补 `authenticat|credential|(?:token|凭证).{0,16}(?:invalid|expired|无效|失效)`；`minimax-image.test.js` 新增 4 组分类用例。

### Info（记录，不阻塞）

- `getContentPolicyCheckpoint`（stages.js:1051）只认 `reason === 'content_policy'`，empty_result checkpoint 无独立暂停面——pre-existing，列为后续增强。
- `needsUserInputMessage(null)` 兜底回 empty_result 文案，语义符合「未知原因不报内容政策」的 fail-closed 方向。

## 复审结论

- 首轮 2 Critical + 2 Major 全部修复到位；第二轮 2 Critical + 2 Warning 已闭环。
- 复审后测试：9 文件 351 passed（minimax-image 34 / image-retry 12 / asset-generator-provider 25 / stages 102 / project-service 65 / notifications 18 / story2video-notifications 27 / history-utils 12 / ResultView 56）+ 相邻 4 文件 246 passed（CreateView 199 / CreateViewHistory 14 / api-usage-governor 22 / provider-error 11）。
