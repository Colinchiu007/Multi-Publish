# 实施清单（进度唯一来源）

## 阶段 1：渲染端基础设施
- [x] `src/i18n/index.js`：detectSystemLocale / getAppLocale / setAppLocale + 初始化解析
- [x] 新增 `src/utils/user-facing-error.js`：USER_ERROR_MESSAGES zh/en + formatUserError（errorCode → code → pattern → fallback）
- [x] 新增 `src/utils/user-facing-error.test.js`

## 阶段 2：主进程
- [x] `ipc-handlers/license-access-control.js`：errorCode + 去通道名 message + messageParams
- [x] `services/model-provider-manager.js`：errorCode + 自然语言 message（去英文括号注释），PROVIDER_EXISTS
- [x] `services/webview-manager.js`：Failed to create tab → 中文
- [x] 更新 `license-access-control.test.js` / model-provider 相关测试

## 阶段 3：渲染端接入
- [x] CreateHistory / PublishHistory / usePipelineHistory
- [x] useModelProviderCrud（含 already-exists errorCode 判断）
- [x] useOpsCenterSync / ApprovalGateModal / UpgradeModal
- [x] usePublishFlow / usePublishDrafts / useBatchPublish
- [x] PipelineBrowser / TemplatePicker / ReplayTimeline / stores/accounts / CreateView quickError
- [x] i18n.test.js 扩展 + LogsSettings 语言切换控件 + 测试

## 阶段 4：全量验证
- [x] 桌面端相关单测通过（含 i18n / notifications / views）：聚焦 525 + ipc-handlers 388 + src 批量 1885 全绿；全量 6935 中 12 个失败经 stash 验证为 origin/main 基线预存（stage-executor / pipeline-story2video-contract / AppNavbar / phase5-ipc）
- [x] 打包验证（QM-1）：本次不改 electron-builder 打包产物结构，按 QM-1 例外说明（变更不涉及 main.js/打包清单），本地 vitest 单 worker 全量验证
- [x] git diff 范围核对：43 文件，全部在 change 声明范围内

## 阶段 5：文档与交付
- [x] PRD「提示文字与多语言规范」章节（§3.2）
- [x] learnings / CHANGELOG / .quality-gates.md
- [x] OpenSpec apply + archive；CCG task 归档；记忆更新
- [x] 推送 + PR + CI + 合并（PR #529 merged 71425220）
