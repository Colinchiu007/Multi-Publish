---
id: bgm-library
title: 全能创作背景音乐素材库管理
status: proposed
created: 2026-08-14
---

# 全能创作背景音乐素材库管理

## Why

「全能创作」当前 BGM 仅支持单文件临时选择（`s2vConfig.bgmPath` + 文件选择器，导入至临时目录且 7 天老化回收），用户无法复用、管理多首背景音乐。需要持久化素材库：多文件添加、重命名、删除，并通过下拉选择。

## What Changes

- 新增持久化 BGM 素材库（`userData/story2video-bgm/` + `library.json` 索引）：添加（校验格式/大小后复制入库）、重命名（仅索引展示名）、删除（文件+索引）。
- BGM 配置区 UI 从「选择音频」按钮升级为「下拉选择 + 管理弹窗」（添加/重命名/删除）。
- 新增 IPC 通道：`story2video:bgm-library-list/add/rename/delete`（preload + publisher.js + 主进程 handler + 权限清单同步）。
- 兼容：既有 `s2vConfig.bgmPath` 与 compose `bgm.path` 契约不变；未入库的旧选择以「已选音频」选项保留。
- 不改变 compose 阶段、持久化项目契约与发布语义。

## Capabilities

- **New Capabilities**: `story2video-bgm-library`
- **Modified Capabilities**: 无（既有 story2video 规格不涉及 BGM 管理行为）

## Impact

- 代码：`apps/desktop/electron/services/story2video-bgm-library.js`（新）、`story2video-paths.js`（allowed roots 增加素材库目录）、`ipc-handlers/story2video.js`、`ipc-handlers/license-access-control.js`、`preload/publish.js`、`preload/access-control.js`、`src/api/publisher.js`、`src/views/CreateView.vue`、`src/locales/{zh,en}.js`、`src/story2video/story2video-notifications.js`。
- 测试：`story2video-bgm-library.test.js`（新）、`ipc-handlers/story2video.test.js`、`license-access-control.test.js`、`preload.test.js`、`publisher.test.js`、`CreateView.test.js`。
- 文档：`01-docs/PRD-video-creation.md`、`CHANGELOG.md`。
- 依赖：无新增第三方依赖。
