# Tasks: bgm-library

## 阶段 1：主进程服务与 IPC（Layer 1）

- [x] T1 新建 `electron/services/story2video-bgm-library.js`：list/add/rename/delete + library.json 原子读写 + 容错
  - 测试：`electron/services/story2video-bgm-library.test.js`
- [x] T2 `story2video-paths.js`：`getElectronMediaRoots()` 增加 `userData/story2video-bgm`
  - 测试：`story2video-paths.test.js` 断言 allowed roots 含库目录
- [x] T3 `ipc-handlers/story2video.js`：注册 `story2video:bgm-library-{list,add,rename,delete}`（withSenderCheck + 参数校验）
  - 测试：`ipc-handlers/story2video.test.js`
- [x] T4 `ipc-handlers/license-access-control.js`：4 通道入 PUBLIC_CHANNELS
  - 测试：`license-access-control.test.js`
- [x] T5 `preload/publish.js` + `preload/access-control.js`：4 方法（add 经 getPathForFile 解析路径）+ PUBLIC_METHODS
  - 测试：`preload.test.js`
- [x] T6 `src/api/publisher.js`：4 个 API 函数 + fallback
  - 测试：`publisher.test.js`

## 阶段 2：渲染端 UI（Layer 2，依赖 T1-T6）

- [x] T7 `CreateView.vue`：BGM 下拉（库条目 + 空选项 + 历史路径兼容）+ 管理弹窗（UiModal：添加/重命名/删除/空态）+ 状态与 mounted 加载
  - 测试：`CreateView.test.js`（下拉渲染、选择映射 bgmPath、compose 参数、添加/重命名/删除流、历史路径保留）
- [x] T8 `locales/{zh,en}.js` + `story2video-notifications.js`：新增 key 成对 + 通知键
  - 测试：i18n sync 门禁（zh/en 成对）
- [x] T9 e2e helpers：`tests/e2e/helpers/ipc-mock.js` 增加 4 方法 mock（如适用）

## 阶段 3：文档与收尾

- [x] T10 `01-docs/PRD-video-creation.md`：BGM 素材库功能补齐（能力表 + 7.1.x 章节 + 边界）
- [x] T11 `CHANGELOG.md` 追加记录
- [x] T12 全量相关测试通过 + 双模型审查 + openspec validate + 三同步归档
