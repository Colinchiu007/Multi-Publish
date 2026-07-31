---
title: "打包应用缺失 app-update.yml 显示更新失败"
date: 2026-07-31
type: bug-reflection
---

## 问题

- 现象: 打包的 `win-unpacked` 应用在视频创作页面显示 `更新失败: ENOENT ... app-update.yml`。
- 预期: 缺少本地更新配置代表自动更新不可用，不应显示失败通知。
- 复现: 启动 `win-unpacked/Multi-Publish.exe`，等待自动更新检查。

## 根因

1. electron-updater 发出 `ENOENT` 错误。
2. 错误目标是本地 `resources/app-update.yml`。
3. `isUpdateCheckUnavailable()` 只识别网络错误和远端 `latest*.yml` 404。
4. 本地更新配置缺失未被分类为更新不可用。
5. 根因: 自动更新降级合同遗漏了打包解压产物的本地配置缺失场景。

## 漏测分类

- PRD 缺口: 否。
- 代码缺陷: 是。
- 测试缺口: 是，已有 latest.yml 404 回归未覆盖 app-update.yml ENOENT。
- 流程缺口: 是，真实 unpacked 应用冒烟未将 updater toast 作为断言。

## 执行状态

- [x] RED: 新用例初始得到 `type: error`。
- [x] GREEN: auto-updater 13 条测试通过。
- [x] 保护测试: `EACCES app-update.yml` 仍上报真实错误。
- [x] 新打包应用现场复测: 纯净 `origin/main@362c172` worktree 成功生成 Windows unpacked 产物；等待自动更新检查后页面无 `更新失败`、`app-update.yml` 或 `ENOENT` 文案。
