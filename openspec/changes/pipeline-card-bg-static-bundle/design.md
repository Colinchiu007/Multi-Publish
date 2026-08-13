## Context

上一交付（pipeline-card-backgrounds-ui，PR #755）实现了「运行时 MiniMax 生成 + 磁盘缓存 + loopback 静态服务」，已合并归档。用户确认改为**方案 B**：预生成固定静态图打包进项目、彻底移除运行时生成。背景图改由免费生图模型 Pollinations（flux）预生成（存量 profile 的 MiniMax/LLM Key 经诊断在当前 Electron 43 下无法解密，详见 task.json notes）。

## Goals / Non-Goals

**Goals:**
- 15 张静态背景图进仓库并随应用打包（Vite 静态导入），所有用户一致。
- 前端直接引用内置资源，移除全部运行时生成代码/接口/测试。
- 保留背景视觉质量与可读性（统一风格、暗色遮罩、浅色前景）、交互动效与可访问性。

**Non-Goals:**
- 不引入运行时图片生成/网络调用/缓存（彻底移除）。
- 不做背景图在线更新/换肤（资源变更走 git + 发版）。
- 不保留「生成中/失败」提示文案（不再存在对应状态）。

## Decisions

### D1 静态资源位置与引用
- 资源放 `apps/desktop/src/assets/pipeline-card-bg/<name>.jpg`，由 `src/story2video/pipeline-card-bg-assets.js` 以静态 import 聚合为 `{ [pipelineName]: url }` 映射（Vite 打包 + 哈希，dev/打包均可用）。
- 备选（弃用）：`public/` 目录 —— 打包 file:// 下绝对路径处理易出错；运行时写缓存 —— 已确认移除。

### D2 图片规格
- 1024x576（16:9，Pollinations 免费档最大边限制），JPEG（magic ffd8ff 校验），每张 ~18-20KB；CSS `object-fit: cover` 裁切填充卡片。
- 提示词 = 既有 `promptFor` 风格（统一风格块 + 每流水线主题意象），seed 按 prompt 哈希固定（同提示词输出稳定）。

### D3 前端简化
- `PipelineSelector.vue`：删除 data（backgrounds/bgLoading/bgHint/bgFetchedFor）、fetchCardBackgrounds、pipelineNames、hasBg/bgUrl/isBgLoading、anyBgLoading、watch/mounted 请求；新增 `bgUrl(name)` 直接查静态映射（返回 `undefined` 时卡片用分类渐变兜底，兼容未来新增流水线无图场景）。
- 模板保留 `card-bg` 层（img + scrim）与 `has-bg` 类，删除 `bg-generating`/`bg-hint` 块；`aria-busy` 删除。

### D4 移除运行时链路清单
- 删除文件：`electron/services/pipeline-card-backgrounds.js`(+test)、`electron/ipc-handlers/pipeline-card-backgrounds.js`(+test)。
- 接线回退：`ipc-handlers/index.js` 去掉注册；preload `publish.js` 去掉方法、`access-control.js` PUBLIC_METHODS 去掉、`license-access-control.js` public 通道去掉；`src/api/publisher.js` 去掉封装；`preload.test.js` 计数还原（85→84、275→274、77→76）并去掉新增断言；`access-control.test.js` 去掉新增用例；`CreateView.test.js` mock 去掉 `pipelineCardBackgrounds`。
- locales：删除 `pipelines.selector.*`（zh/en）；i18n-glossary 删除「卡片背景」行（无 UI 文案再引用）。

### D5 测试
- `PipelineSelector.test.js` 重写：静态映射命中渲染背景层（aria-hidden）、未知流水线渐变兜底、role/aria-label/键盘保留、无 API 调用断言（mock 空 window.electronAPI 也可渲染）。
- 不新增主进程服务测试（服务已删除）；`check-locale-sync --cjk` 需重锚基线（删除文案 key 不影响，但 .vue 行位移需 re-baseline）。

## Risks / Trade-offs

- [Pollinations 免费档限流（429）与偶发超时] → 一次性预生成脚本串行 + 退避重试 + 缓存续跑；产物提交后不再依赖该服务。
- [免费模型视觉质量不稳定] → 统一风格提示词 + 固定 seed；验收以「低饱和深色抽象、无文字、可读性」为准，必要时人工抽换个别图。
- [静态资源增大安装包] → 15 张 × ~20KB ≈ 300KB，可忽略。
- [外部双模型审查不可用（前次诊断）] → 继续按机制硬化降级，本地自审 + 测试/CI 门禁补充。

## Migration Plan

- 代码级移除，无数据迁移；删除 `userData/pipeline-card-bg/` 由运行时缓存自然失效（不再被引用）。
- 回滚：revert PR（纯前端 + 资源变更，无 DB/服务端影响）。

## Open Questions

无。
