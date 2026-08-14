# Design: bgm-library

## 现状（差异审计）

- 单 BGM：`CreateView.vue` `s2vConfig.bgmPath`（字符串路径）→ compose `bgm: { enabled, path, volume }`（契约在 `story2video-compose-engine.js`，`resolveReadableMediaFile(path, { kind: 'bgm' })` 校验）。
- 导入：`story2video:import-media` → `importUserSelectedMedia` 复制到 `os.tmpdir()/story2video/selected-media/`（7 天 GC，非持久）。
- 权限：`story2video:import-media` 为 PUBLIC_CHANNELS（未登录可用，注释给出理由）；写操作（delete-project 等）为 authenticated `story2video_write`。
- 素材库参照：无现成本地文件库；voice-catalog 为远端目录，不适用。

## 决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 存储位置 | `userData/story2video-bgm/`，索引 `library.json` | 持久、设备级、与项目目录并列；加入 allowed roots 后 compose/校验零改动 |
| 索引结构 | `{ version: 1, items: [{ id, name, fileName, size, createdAt, updatedAt }] }` | 展示名与磁盘文件名分离（磁盘用 `bgm-<token><ext>`），重命名只改索引，避免 Windows 文件改名竞态 |
| ID | `crypto.randomUUID()` | 唯一、非顺序、不可枚举 |
| 添加 | 复用 `importUserSelectedMedia(candidate, 'bgm', { baseDir: libraryDir })` | 已有校验（扩展名/大小/非符号链接/占用重试）与原子复制语义 |
| 索引写入 | 临时文件 + `renameSync`，Windows 占用类错误有界重试（沿用 `copyImportedMedia` 模式） | 满足 Windows 原子替换 QM |
| 删除 | 先删索引条目再删文件（文件缺失不阻塞） | 悬挂引用最小化；compose 对缺失 BGM 已有降级 |
| allowed roots | `getElectronMediaRoots()` 增加 `userData/story2video-bgm` | 所有 `resolveReadableMediaFile` 调用（compose、share-url、save-as）自动放行 |
| 权限 | 4 个新通道全部 PUBLIC（含 rename/delete） | 纯设备本地文件管理，与 `import-media` 同理由；未登录用户也能管理本地素材 |
| 渲染端 | 原生 `<select class="form-select">` + `UiModal` 管理弹窗 | 与现有字幕样式等下拉、删除确认弹窗模式一致 |
| 兼容 | 下拉额外渲染「已选音频（未入库）」选项保留旧 `bgmPath` | 历史配置/模板恢复不丢 BGM |

## IPC 契约

- `story2video:bgm-library-list` → `{ code: 0, data: [{ id, name, path, size, createdAt }] }`
- `story2video:bgm-library-add` `{ filePath }`（preload 经 getPathForFile 解析）→ `{ code: 0, data: { id, name, path, size } }`；失败 `{ code: EC.VALIDATION_ERROR, message }`（沿用 MEDIA_* 细分提示）
- `story2video:bgm-library-rename` `{ id, name }`（name 1..60 字符，trim）→ `{ code: 0, data: item }`
- `story2video:bgm-library-delete` `{ id }` → `{ code: 0, data: { deleted: true } }`

## 渲染端状态

`s2vBgmLibrary: []`、`s2vBgmLibraryLoading`、`s2vBgmLibraryError`、`s2vBgmLibraryDialogOpen`、`s2vBgmLibraryRenamingId`、`s2vBgmLibraryRenameDraft`、`s2vBgmLibraryDeletingId`；mounted 时加载，弹窗打开时刷新。

## i18n

新增 key（zh/en 成对，`story2video.*`）：`bgm_library_title`、`bgm_library_add`、`bgm_library_manage`、`bgm_none`、`bgm_legacy_option`、`bgm_library_empty`、`bgm_library_rename_failed`、`bgm_library_delete_failed`、`bgm_library_load_failed`、`bgm_library_delete_confirm`。错误弹窗沿用 `showStory2VideoErrorDialog` + `STORY2VIDEO_NOTIFICATION_KEYS`。
