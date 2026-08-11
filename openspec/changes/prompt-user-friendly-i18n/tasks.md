# 实施清单（进度唯一来源）

## 阶段 1：渲染端基础设施
- [ ] `src/i18n/index.js`：detectSystemLocale / getAppLocale / setAppLocale + 初始化解析
- [ ] 新增 `src/utils/user-facing-error.js`：USER_ERROR_MESSAGES zh/en + formatUserError（errorCode → code → pattern → fallback）
- [ ] 新增 `src/utils/user-facing-error.test.js`

## 阶段 2：主进程
- [ ] `ipc-handlers/license-access-control.js`：errorCode + 去通道名 message + messageParams
- [ ] `services/model-provider-manager.js`：errorCode + 自然语言 message（去英文括号注释），PROVIDER_EXISTS
- [ ] `services/webview-manager.js`：Failed to create tab → 中文
- [ ] 更新 `license-access-control.test.js` / model-provider 相关测试

## 阶段 3：渲染端接入
- [ ] CreateHistory / PublishHistory / usePipelineHistory
- [ ] useModelProviderCrud（含 already-exists errorCode 判断）
- [ ] useOpsCenterSync / ApprovalGateModal / UpgradeModal
- [ ] usePublishFlow / usePublishDrafts / useBatchPublish
- [ ] PipelineBrowser / TemplatePicker / ReplayTimeline / stores/accounts / CreateView quickError
- [ ] i18n.test.js 扩展 + LogsSettings 语言切换控件 + 测试

## 阶段 4：全量验证
- [ ] 桌面端相关单测通过（含 i18n / notifications / views）
- [ ] 打包验证（QM-1）或明确不涉及 electron 主进程打包路径时按 QM 要求执行
- [ ] git diff 范围核对

## 阶段 5：文档与交付
- [ ] PRD「提示文字与多语言规范」章节
- [ ] learnings / CHANGELOG / .quality-gates.md
- [ ] OpenSpec apply + archive；CCG task 归档；记忆更新
- [ ] 推送 + PR + CI + 合并
