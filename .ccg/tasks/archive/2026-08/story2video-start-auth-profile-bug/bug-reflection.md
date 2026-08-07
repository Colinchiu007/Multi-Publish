---
title: "图片轮播启动时权限拒绝被泛化提示吞掉"
date: 2026-08-05
type: bug-reflection
---

## 问题
- 现象: 在【视频创作】→【图片轮播】输入 `1`，点击【启动流水线】后弹出“当前操作未能完成，请稍后再试。”。
- 预期: 若当前 profile 未登录或账号没有该流水线权益，应显示可行动的登录/权益提示；只有未知业务失败才显示泛化提示。
- 复现: 进入图片轮播，输入 `1`，点击【启动流水线】；真实 Electron IPC 返回 `code=-3`、`当前许可证无权访问 pipeline:startOrchestrated`。

## 根因（5 Whys）
1. 为什么用户看到泛化失败？CreateView 将非零 IPC 响应只传入 `res.message`，通知层没有收到权限码。
2. 为什么通知层仍显示泛化失败？`story2video-notifications.js` 只识别稳定 message key 和少量文本模式，没有 `AUTH_ERROR=-3` 或许可证拒绝模式。
3. 为什么没有稳定映射？IPC 错误合同与 Story2Video renderer 文案合同没有共享的权限错误映射。
4. 为什么测试没有拦住？已有测试覆盖模型未配置、普通失败和完成缺少预览，但没有覆盖受保护 IPC 的未登录/无权益状态。
5. 为什么调试时容易误判？开发脚本未显式固定 profile 时每次使用临时 userData；即使复用了已有目录，也没有把“目录存在”与“身份状态 authenticated”区分开。

根因: 受保护 IPC 的 `AUTH_ERROR` 没有进入 Story2Video 稳定通知合同，且调试 profile 的复用方式未被明确记录；代码因此把可修复的登录问题伪装成不可行动的普通失败。

## 漏测分类
- PRD 缺口: 是。异常路径没有明确规定“未登录/无权益”的用户行动文案。
- 代码缺陷: 是。CreateView 丢失 IPC code，通知解析器缺少 `-3` 和许可证拒绝映射。
- 测试缺口: 是。缺少权限拒绝状态覆盖与输入 `1` 的完整组件路径回归。
- 流程缺口: 是。启动调试 profile 的持久化方法没有成为开发验收清单的一部分。

## 推荐测试级别
- 单元测试: 通知解析器输入 `code=-3`、许可证拒绝文本和普通错误，验证稳定键与中英文文案。
- 状态覆盖测试: CreateView 处理 `pipeline:startOrchestrated` 非零响应时显示权限弹窗并停止轮询。
- 端到端冒烟: 在已登录/未登录两个 profile 中分别输入 `1` 点击【启动流水线】，验证权限提示或进入阶段清单。
- 环境测试: 用固定 `ELECTRON_USER_DATA_DIR` 重启应用，确认 profile 目录复用；远程部署使用独立 userData。

## 改进措施
- [P0] 代码: 增加 `story2video.access_denied` 稳定通知键；识别 `AUTH_ERROR=-3`、许可证/权益拒绝文本；CreateView 传递 IPC code。
  - 文件/位置: `apps/desktop/src/story2video/story2video-notifications.js`、`apps/desktop/src/views/CreateView.vue`
  - 同步更新: PRD 需要；Review Checklist 需要检查受保护 IPC 错误码是否进入 renderer 文案合同。
- [P0] 测试: 补 RED→GREEN 的通知单元测试和 CreateView 权限状态测试。
  - 文件/位置: `apps/desktop/src/story2video/story2video-notifications.test.js`、`apps/desktop/src/views/CreateView.test.js`
- [P1] 开发流程: 使用固定但仓库外的 profile 调试；启动前确认 `identity:get-state`，不以 Cookie/SQLite 文件存在推断登录。
  - 命令: `$env:ELECTRON_USER_DATA_DIR='C:\tmp\Multi-Publish-debug-profile'; npm --workspace @multi-publish/desktop run dev`
  - 清理: 远程部署或调试收尾时停止 Electron 后删除该目录；不要提交其中任何文件。
- [P1] 文档: 在开发运行手册补充 profile 复用、DPAPI/同机限制和远程部署隔离说明。

## 7 阶段回流映射
- Stage 2（PRD）: 需要补充“未登录/无权益”异常路径及验收标准。
- Stage 5（TDD）: 已补充 RED→GREEN 单元与组件回归。
- Stage 6（评审）: 需要增加“受保护 IPC code 是否被 renderer 保留并本地化”的检查项。

## 执行状态
- [x] 代码修复（GREEN）
- [x] 失败测试已写并确认 RED
- [x] 定向回归测试全绿
- [x] PRD 同步
- [x] Review Checklist 更新
- [x] 记忆写入
