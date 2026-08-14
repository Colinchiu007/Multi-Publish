# Tasks — s2v-content-type-auto-suggest

> 进度单一来源：本文件 checkbox。TDD：测试先行，完成后双模型审查。

## Phase 1 — 主进程判定与 IPC

- [x] 1.1 `story-context-engine.js`：新增纯函数 `suggestContentType(text)`（D1 规则）+ 导出
      - 测试：`story-context-engine.test.js` 新 describe 12 条（朝代命中/三国杀钉住/武侠强信号/无题材强信号/寺庙单信号不强/现代强信号不强/genre 单独不强/混信号不强/空文本/超长文本/非法入参等）→ 44/44 通过
- [x] 1.2 `ipc-handlers/story2video.js`：`story2video:suggest-content-type` handler（withSenderCheck + wrapIpcHandler，fail-open）
- [x] 1.3 权限双登记：`ipc-handlers/license-access-control.js` PUBLIC_CHANNELS + `preload/access-control.js` PUBLIC_METHODS
      - 测试：license-access-control.test.js + access-control.test.js 均新增 public 断言 → 通过

## Phase 2 — 渲染进程预选联动

- [x] 2.1 `preload/publish.js`：暴露 `story2videoSuggestContentType(text)`（对齐 BGM API 内联方式；`index.bundle.js` 为构建产物不手改）
- [x] 2.2 `CreateView.vue`：`s2vContentTypeTouched` + 下拉 `@change` + `watch pipelineText` 500ms 防抖 + seq 令牌 + 恢复流程置 touched + reset 重置 touched + unmount 清定时器
      - 测试：`CreateView.test.js` fake timers 6 用例（预选生效/用户改后不覆盖/IPC 失败保持/空文本不调用/乱序守卫/恢复视为偏好）→ 192/192 通过
- [x] 2.3 `tests/e2e/helpers/ipc-mock.js`：加 `story2videoSuggestContentType` 桩（返回 general）

## Phase 3 — 门禁与交付

- [x] 3.1 vitest 定向（284 通过）+ CreateView.test + locale sync check（基线行号吸收 1515→1515，无新增硬编码）+ openspec validate（valid）
- [ ] 3.2 手动验证（桌面应用：历史文本预选/手动不覆盖）
- [ ] 3.3 双模型审查 → PR → 归档三同步
