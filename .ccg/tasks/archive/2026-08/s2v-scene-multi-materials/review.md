# Review — s2v-scene-multi-materials

> 2026-08-14 · 审查方式：Claude 单模型（antigravity 不可用，已按 CCG 规则降级并记录）
> 审查输入：`git diff`（交接改动 + 本轮新增），输出：`C:\tmp\s2v-multi-materials-review-out.log`

## 审查结论汇总

| 级别 | 数量 | 处理 |
|------|------|------|
| Critical | 1（C1） | 已修复 + 回归测试 |
| Warning | 4（W1–W4） | W1 已修复 + UI 测试；W2–W4 记录待确认 |
| Info | 若干 | 记录待确认 |

## C1（已修复）compose 回显污染图1 槽

- **现象**：image2 选中 → 再次合成 → `_scenesForCompose` 把 imagePath 映射为图2 → compose-engine 回显 scene 全字段（compose-engine L835 `...scene`）→ `_persistComposeArtifacts` 把图2 写入图1 槽 → 清理阶段删除原图1。
- **修复**：`recomposeProject` 在 `_persistComposeArtifacts` 后按 position 回填 `imagePath/imageMeta/alternateImages/selectedMaterial` 为项目原值（`story2video-project-service.js` recomposeProject）；同时登记被覆盖的 compose 回显图片副本，清理为孤儿文件。
- **回归测试**：`image2 选中态再次合成：图1/图2 槽保持原状，不被 compose 回显污染删除（审查 C1 回归）`；原「重新合成成功后清理不再引用的旧项目媒体」用例断言更新为 C1 新语义（槽位保留原图、孤儿副本被清理）。

## W1（已修复）再次合成后素材 URL 未刷新

- **现象**：`recomposeProject` 成功后 `this.segments = result.data.segments...` 替换为新对象（无 `imageUrl/alternateImageUrls/videoUrl`）且未调用 `refreshSegmentImageUrls()` → 素材区/分段图空白「未生成」。
- **修复**：`ResultView.vue` recomposeProject 成功分支追加 `await this.refreshSegmentImageUrls()`（内部串接 `refreshSceneMaterialUrls`）。
- **回归测试**：`再次合成成功后重新解析素材 URL（回归：旧实现素材区/分段图空白）`。

## W2（记录）跨分段并发无 per-project 锁

- 前端 `segmentBusy` 为单例，不同分段生成操作理论上可并发 read-modify-write；影响小，维持现状（Info 级风险）。

## W3（记录）generateSceneImage 缺失选中态替换语义

- `generateSceneImage` 对「有 videoPath 的缺失选中态」按 image2/video 处理（替换图1）；与 `effectiveSelectedMaterial` 的 legacy=video 语义略有出入。产品语义确认后如需统一再改，本次不扩大范围。

## W4（记录）生成/选择未置 status:'processing'

- `generateSceneImage`/`selectSceneMaterial` 成功路径未将分段置为 `processing` 中间态；对 UI 无实质影响，记录。

## Info（记录）

- 失败路径未置 dirty；UI 失败状态徽标不更新；`effectiveSelectedMaterial` 白名单可收紧；`segmentsDirty` 与 `dirty` 冗余；英文正则偏宽；已选槽重复点击幂等；`_enrichManualCandidates` 的 `second.path !== enriched.imagePath` 恒真（防重复不生效，待后续统一）。

## 门禁状态

- 定向测试：`story2video-project-service.test.js`(39) + `ResultView.test.js`(36) + `preload.test.js`(340) = 415 全过。
- 全量 Vitest：后台任务 j-uese9b 运行中（大套件，单 worker 长跑），以退出码为准。
- locale 同步：`check-locale-sync.js --cjk` 基线 1512 条 PASS；zh/en 成对修改已提交到工作树。
- QM-1 打包：待全量测试收敛后执行 electron-builder。
