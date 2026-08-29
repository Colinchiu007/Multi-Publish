# Review：s2v-pipeline-config-profiles

日期：2026-08-29
分支：codex/s2v-pipeline-config-profiles

## 审查范围

- Story2VideoConfigProfiles 服务、四个 IPC 通道、preload/public 权限矩阵。
- CreateView 编排/legacy 快照、应用归一化、provider 回退、表单确认和异步关闭竞态。
- Video Clone、Film Engineering 专用快照及通用 ConfigProfileManager。
- zh/en locale、OpenSpec、PRD/开发报告/CHANGELOG/i18n glossary。

## 外部审查状态

- opencode：wrapper 启动成功并返回 bounded review，退出码 0；实际报告无 CRITICAL，初始提出 3 个 MAJOR。
- Claude：claude.exe 与 wrapper 均可启动，但外部后端连续返回 HTTP 429，退出码 1，未返回 bounded review 正文。该状态分类为“CLI 可执行、wrapper 可用、外部限流”，不等同于 Claude 不可用。

## 分级结论

### CRITICAL

无。

### MAJOR

opencode 初审提出的以下问题在当前 diff 中均已修复并复核：

1. CreateView.vue 编排快照已改为显式字段白名单，排除 bgmPath、coverUrl、发布字段及其他素材/运行态引用。
2. legacy 应用已对白名单中的 selectedStyle、budgetConfig.mode、outputConfig.fps、outputConfig.format 和分辨率做归一化，陈旧值回退到合法默认值。
3. Story2Video 配置 CRUD IPC 已按 ProfileValidationError 与普通 IO/占用错误分别映射 VALIDATION_ERROR / REQUEST_ERROR。

### MINOR / INFO

- 已补加载请求代际守卫：保存/列表弹窗可在加载中关闭，迟到结果不会覆盖当前状态。
- renameWithRetry 仍采用与既有 BGM 素材库一致的同步有限重试；可能短暂阻塞主进程，属于低概率、可界定的既有模式。
- 时间格式化仍使用 zh-CN，可作为后续 locale 体验优化，不影响数据安全或功能正确性。
- 现有测试 mock 的实现重置纪律、临时文件失败清理等可继续加强，但本次核心路径已有覆盖。

## 可合并性

代码审查层面：通过，无未解决 Critical/Major。

## 证据边界

- 聚焦回归、Vue build、preload 双 sandbox、ASAR 清单和 JS 语法/入口检查可证明本地实现链路。
- 全量 Vitest 的失败属于既有 asset-generator.test.js spawn mock 与 Windows symlink 权限环境问题，不是本次变更失败；不能宣称全量套件全绿。
- Electron 产物曾成功构建且 ASAR 含新增文件，但构建日志提示 .playwright-browsers 目录缺失；因此不能把该产物宣称为包含捆绑 Chromium 的完整发行包。
- 本次未进行真实第三方登录、provider 调用、上传、发布、云同步或跨设备验收。

## Completeness

8.5 / 10。核心 CRUD、快照、应用、管理、权限、文档和回归测试完整；扣分来自仓库既有全量门禁失败、外部 Claude 限流，以及缺少真实 provider/发布验收。
