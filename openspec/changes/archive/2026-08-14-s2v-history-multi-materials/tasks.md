## 1. 数据模型与主服务（story2video-project-service.js）

- [ ] 1.1 扩展 segment 槽位模型：`alternateImages: Array<{path, meta}>`（服务端强制 length ≤ 1）与 `selectedMaterial: 'image1'|'image2'|'video'`（可选字段，缺失=遗留语义），`referencedProjectFiles` 纳入 `alternateImages[].path`（测试：story2video-project-service.test.js — 引用与清理场景）
- [ ] 1.2 实现 `_scenesForCompose()` 三态映射（video→videoPath；image2→alternateImages[0].path 且 videoPath 置空；image1→imagePath 且 videoPath 置空；缺失→遗留语义），recomposeProject 改走该映射（测试：_scenesForCompose 三态映射场景，compose 引擎零改动）
- [ ] 1.3 实现 `generateSceneImage(projectId, segmentId)`：复用 assetGenerator.generateImage(segment.prompt||text, {index,style,image_provider,image_model,aspect_ratio,runId})；槽位规则（无备选图→补图2槽；2图满→替换未选中那张：selectedMaterial==='image2' 换图1，否则换图2）；attemptFiles 失败回滚+状态回写（测试：槽位规则 4 分支 + 失败回滚场景）
- [ ] 1.4 实现 `generateSceneVideo(projectId, segmentId)`：以当前选中图片+audioPath 调 composeEngine.renderSegment 替换 videoPath 槽；无 audioPath 报错；失败清理本次产物保留旧视频（测试：已有视频替换/无音频拒绝/渲染失败保留旧视频场景）
- [ ] 1.5 实现 `selectSceneMaterial(projectId, segmentId, kind)`：kind 白名单+空槽校验（VALIDATION_ERROR），成功持久化 selectedMaterial 并置 dirty=true（测试：合法选择/非法选择场景）
- [ ] 1.6 `saveRun` manual 模式候选富化：run.context.generate_assets.candidates → 未选图片复制为 alternateImages[0]、未选视频复制为 videoPath、按流水线选择写 selectedMaterial；`_persistComposeArtifacts` 透传新字段；auto 模式不富化（测试：manual 候选富化场景 + 旧项目兼容场景）

## 2. IPC / 权限 / preload / 前端 API

- [ ] 2.1 注册三个新通道 story2video:generate-scene-image / generate-scene-video / select-scene-material（story2video_write + withSenderCheck + SAFE_ID/kind 白名单校验，错误映射 VALIDATION_ERROR）（测试：ipc-handlers/story2video.test.js 参数校验与错误映射场景）
- [ ] 2.2 license-access-control.js 通道清单加入三个新通道（测试：license-access-control.test.js 通道权限场景）
- [ ] 2.3 preload/publish.js 暴露新方法 + src/api/publisher.js 新函数（测试：preload.test.js 通道清单场景）

## 3. 详情页 UI（ResultView.vue）+ 文案

- [ ] 3.1 ResultView.vue 每 segment 新增「场景素材」区：3 槽位卡（图1/图2/视频，缩略图或「未生成」占位、选中高亮+「当前使用」徽标、aria 语义、点击经 story2videoCreateShareUrl 预览 modal），空槽不可选（测试：ResultView.test.js 三槽位渲染与选中态场景）
- [ ] 3.2 【生成新图】【生成视频】按钮（素材区，busy 态「生成中...」+ segmentBusy 防抖）（测试：ResultView.test.js 生成按钮与 busy 态场景）
- [ ] 3.3 分段编辑区头部【再次合成视频】按钮（与【重新合成】并列，走 recompose-project，dirty 置 false）（测试：ResultView.test.js 再次合成并列入口场景）
- [ ] 3.4 locales zh/en 成对新增全部文案（按钮/占位/徽标/toast）+ story2video-notifications.js 新增通知键（SCENE_IMAGE_GENERATED/SCENE_VIDEO_GENERATED/MATERIAL_SELECTED 等），组件内不新增中文字面量（测试：check-locale-sync CI 场景）
- [ ] 3.5 响应式布局：桌面 3 列横向，≤720px 纵向换行（测试：ResultView.test.js 响应式或样式断言）

## 4. 文档与流程工件

- [ ] 4.1 更新 01-docs/PRD-video-creation.md：新增详情页多素材/生成/再次合成章节（数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字 zh/en、安全边界），修订记录表追加本次迭代
- [ ] 4.2 `.ccg/tasks/s2v-scene-multi-materials/task.json` 阶段推进与最终归档（openspec archive + CCG 归档 + learnings 三同步）

## 5. 验证与交付

- [ ] 5.1 运行服务/IPC/preload/组件测试（story2video-project-service.test.js、ipc-handlers/story2video.test.js、license-access-control.test.js、preload.test.js、ResultView.test.js 相关用例）+ apps/desktop vitest 全套 + check-locale-sync
- [ ] 5.2 QM-1 本地 electron-builder 打包验证（修改 apps/desktop/electron/ 后必须）+ QM-2 必检项（IPC plain JSON、路径越界、清理不跟 junction）
- [ ] 5.3 双模型审查 git diff（antigravity 不可用则 Claude 单模型 + 主代理综合，报告注明降级）→ 修复 Critical/Warning → review.md
- [ ] 5.4 提交（worktree 分支声明）→ push origin codex/s2v-scene-multi-materials → 创建 PR 并实际合并（核对远程合并状态）
