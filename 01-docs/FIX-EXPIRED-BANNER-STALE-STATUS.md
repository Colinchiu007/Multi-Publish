# 首页登录失效横幅误判修复

> PR #1738 | 2026-09-13

## 问题

首页显示 3 个账号登录失效，点击"批量登录"打开的平台页面均为已登录状态。

## 根因

PR #1677 将 `checkLogin` 从写数据库 `status: 'expired'` 改为前端 `checkedExpiredIds` Set，但 `useExpiredAccountsBanner.js` 被遗漏——仍读数据库残留的 `status === 'expired'` 脏数据，导致已重新登录的账号永久误判失效。

## 修复

`useExpiredAccountsBanner.js` 改为调用 `accountBatchCheckLogin` IPC 逐账号实际验证登录状态，不再读数据库 status 字段。

## 测试

`Home.test.js` 14/14 通过（mock `accountBatchCheckLogin` 结果驱动横幅显示）。
