# Tasks — s2v-retry-content-policy-message

进度唯一来源（openspec-integration Requirement: 进度单一来源）。

## 实施

- [x] 适配器：`minimax-image.js` 读取 `image_urls` 前解析 `base_resp.status_code != 0`，按 `status_msg` 分类 CONTENT_POLICY / AUTH_FAILED / QUOTA_EXCEEDED / PROVIDER_ERROR 立即上抛
- [x] 资产层：`asset-generator.js` `_tryProviderImage` 按 `checkpoint.reason` 区分 content_policy 与 empty_result，消息不再一律硬编码 content-policy review
- [x] 渲染层：`story2video-notifications.js` 新增 `API_KEY_INVALID` / `EMPTY_RESULT` 类别与模式（api_key_invalid 位于 model_api_key 之后），empty_result 支持场景号插值；`QUOTA_EXCEEDED_PATTERN` 增强子句（Token Plan 用量/plan expired/usage limit）
- [x] 渲染层融合（PR #882 rebase）：内容政策类别采用远端整合的 `NEEDS_USER_INPUT`（`story2video.needs_user_input`），场景号插值同时覆盖 NEEDS_USER_INPUT 与 EMPTY_RESULT；放弃独立 `content_policy` 类别
- [x] locales：`zh.js` / `en.js` 成对新增 `api_key_invalid` / `empty_result` 文案（内容政策文案由远端 `needs_user_input` 承担，废弃 `content_policy` 键已清理）
- [x] 复审解耦：`history-utils.js` 新增 `CONTENT_POLICY_ERROR_PATTERN`（内容政策子集，不含 empty_result 短语），`contentPolicyScenes` 与 `CreateViewHistory.policyResumeBlockedText` 改用子集模式，门控正则保留 empty-result 短语
- [x] 复审收紧：`minimax-image.js` isAuth 需邻近失效信号（裸 api key 不再判 AUTH），补 authenticat/credential/token 失效表述；渲染层 `API_KEY_INVALID_PATTERN` 同步补强

## 回归测试（spec 场景映射）

- [x] `minimax-image.test.js` +2：HTTP 200 + `base_resp` AUTH_FAILED（Invalid api key）、QUOTA_EXCEEDED
- [x] `story2video-image-retry.test.js` +1：AUTH_FAILED 立即失败、不进重试圈、category=auth（spec：业务错误不进内容策略圈）
- [x] `asset-generator-provider.test.js`：empty_result 用例断言消息不再称 content-policy（spec：空结果与内容策略失败区分）
- [x] `notifications.test.js` +2、`story2video-notifications.test.js` +1、`ResultView.test.js` +2：content_policy / api_key_invalid 归一化与渲染映射（spec：两类文案独立映射）
- [x] 复审回归：`history-utils.test.js` +2（子集模式不命中空结果短语、空结果不提取场景）、`notifications.test.js` 空结果用例改断 EMPTY_RESULT、`story2video-notifications.test.js` +1（EMPTY_RESULT 场景号插值）、`ResultView.test.js` +1（empty_result 弹窗）、`minimax-image.test.js` +4（额度文案不误判 AUTH / Authentication failed / credentials / token invalid）
- [x] CJK 基线 `--update-baseline`（仅行号漂移，总量不变）；node --check / git diff --check PASS；locale pair 门禁提交后复核

## 验证

- [x] 双模型审查：Claude 首轮抓到 3 缺陷（empty_result 消息自触发 content-policy 模式/额度真实文案未映射/stages 平行路径硬编码）已修复并补测试；Antigravity 地区资格不可用（降级记录）
- [x] Claude 复审（第二轮）：2 Critical + 2 Warning 全部闭环（历史页解耦 / EMPTY_RESULT 渲染类别 / isAuth 收紧 / 认证表述补强），报告见 `.ccg/tasks/s2v-retry-content-policy-message/review.md`
- [x] QM-1：`build:vue` + `electron-builder --win --dir --publish never` exit 0（首轮两次 + 复审重建 + 两次 rebase 后重建）；ASAR 核验 `base_resp.status_code` / `needsUserInputMessage` / `resolveSceneNegativePrompt` / empty_result·api_key_invalid·needs_user_input 文案 / Token Plan 模式；启动 8 秒存活 stderr 0 bytes
- [x] openspec validate（本 change PASS）
- [x] 提交、推送、创建 PR #894（2026-08-16，mergeable，17 项 CI 运行中）；PR 合并后补归档 commit 并同步基础 spec（待合并）
